#!/usr/bin/env python3
"""補強資料品質檢查（離線執行，不在網站請求時跑）。

讀取 prepare_bus_data.py 產生的 cleaned_trips.csv（逐筆上車紀錄），新增兩項待查規則：
  1. 乘車時間過長：下車時間 − 上車時間 > 門檻（預設 6 小時；是待查門檻，不是刪除規則）
  2. 上下車同站：上車站名 = 下車站名

輸出 quality_checks.json，供網站「資料品質」頁讀取。輸出只含彙總與必要欄位範例，
不含卡號、司機編號或車號。兩項規則可能重疊，結果另列重疊筆數，不得相加成異常總數。

執行（專案根目錄）：
  python scripts/quality_checks.py --trips <cleaned_trips.csv 路徑> --prepared-dir data/prepared
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.services.versioning import compute_data_version  # noqa: E402

SCHEMA_VERSION = 1
TZ = ZoneInfo("Asia/Taipei")
USECOLS = [
    "route", "boarding_time", "boarding_stop", "alighting_time", "alighting_stop",
    "source_sheet", "source_row",
]
EXAMPLE_LIMIT = 10


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def by_year(mask: pd.Series, year: pd.Series) -> list[dict]:
    counts = mask.groupby(year).sum()
    totals = year.value_counts()
    return [
        {"year": int(y), "count": int(counts.get(y, 0)), "rows": int(totals[y])}
        for y in sorted(totals.index)
    ]


def examples(df: pd.DataFrame) -> list[dict]:
    out = []
    for r in df.itertuples(index=False):
        out.append({
            "boarding_time": r.boarding_time.strftime("%Y-%m-%d %H:%M"),
            "boarding_stop": r.boarding_stop,
            "alighting_time": r.alighting_time.strftime("%Y-%m-%d %H:%M"),
            "alighting_stop": r.alighting_stop,
            "ride_minutes": int(round(r.ride_minutes)),
            "source_sheet": str(r.source_sheet),
            "source_row": int(r.source_row),
        })
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--trips", type=Path, default=ROOT / "data" / "prepared" / "cleaned_trips.csv")
    p.add_argument("--prepared-dir", type=Path, default=ROOT / "data" / "prepared")
    p.add_argument("--output", type=Path)
    p.add_argument("--long-ride-hours", type=float, default=6.0)
    args = p.parse_args()

    if not args.trips.is_file():
        p.error(f"找不到逐筆資料：{args.trips}（請先執行 prepare_bus_data.py）")
    output = args.output or (args.prepared_dir / "quality_checks.json")
    data_version = compute_data_version(args.prepared_dir)

    print(f"讀取 {args.trips} …", flush=True)
    d = pd.read_csv(args.trips, usecols=USECOLS, dtype={"route": "string", "boarding_stop": "string",
                                                         "alighting_stop": "string", "source_sheet": "string"},
                    encoding="utf-8-sig")
    for c in ("boarding_time", "alighting_time"):
        d[c] = pd.to_datetime(d[c], format="%Y-%m-%d %H:%M:%S", errors="coerce")
    d["boarding_stop"] = d["boarding_stop"].fillna("").str.strip()
    d["alighting_stop"] = d["alighting_stop"].fillna("").str.strip()

    total = len(d)
    year = d["boarding_time"].dt.year
    ride = (d["alighting_time"] - d["boarding_time"]).dt.total_seconds() / 60
    d["ride_minutes"] = ride
    threshold_min = args.long_ride_hours * 60

    valid_ride = ride.notna()
    long_ride = valid_ride & ride.gt(threshold_min)
    same_stop = d["boarding_stop"].ne("") & d["boarding_stop"].eq(d["alighting_stop"])
    overlap = long_ride & same_stop

    q = ride[valid_ride].quantile([0.5, 0.95, 0.99])
    long_bins = pd.cut(ride[long_ride], bins=[threshold_min, 480, 720, 1440, float("inf")],
                       labels=[f"{args.long_ride_hours:g}–8 小時", "8–12 小時", "12–24 小時", "超過 24 小時"],
                       right=True)
    same_top = (d.loc[same_stop, "boarding_stop"].value_counts().head(10)
                .rename_axis("stop").reset_index(name="count"))

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "data_version": data_version,
        "source": {
            "file": args.trips.name,
            "sha256": sha256_file(args.trips),
            "rows": total,
            "routes": sorted(d["route"].dropna().unique().tolist()),
        },
        "ride_minutes_quantiles": {
            "p50": round(float(q.loc[0.5]), 1),
            "p95": round(float(q.loc[0.95]), 1),
            "p99": round(float(q.loc[0.99]), 1),
        },
        "rules": [
            {
                "id": "long_ride",
                "label": f"乘車時間超過 {args.long_ride_hours:g} 小時",
                "definition": f"下車時間減上車時間大於 {args.long_ride_hours:g} 小時（{threshold_min:g} 分鐘）",
                "threshold_minutes": threshold_min,
                "threshold_note": "待查門檻，不是企業確認的刪除規則；上車紀錄仍計入上車旅次。",
                "count": int(long_ride.sum()),
                "by_year": by_year(long_ride, year),
                "distribution": [{"bucket": str(k), "count": int(v)}
                                 for k, v in long_bins.value_counts(sort=False).items()],
                "examples": examples(d.loc[long_ride].sort_values("ride_minutes", ascending=False)
                                     .head(EXAMPLE_LIMIT)),
            },
            {
                "id": "same_stop",
                "label": "上下車站名相同",
                "definition": "上車計費站名與下車計費站名相同（站名非空白）",
                "threshold_minutes": None,
                "threshold_note": "可能是刷卡操作、補登或短程往返，需與業者確認；上車紀錄仍計入上車旅次。",
                "count": int(same_stop.sum()),
                "by_year": by_year(same_stop, year),
                "top_stops": same_top.to_dict(orient="records"),
                "examples": examples(d.loc[same_stop].sort_values("boarding_time").head(EXAMPLE_LIMIT)),
            },
        ],
        "overlap": {
            "rule_ids": ["long_ride", "same_stop"],
            "count": int(overlap.sum()),
            "note": "兩項規則可能重疊，不可直接相加當成異常總筆數。",
        },
    }
    for rule in report["rules"]:
        for item in rule.get("top_stops", []):
            item["count"] = int(item["count"])

    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成：{total:,} 筆；乘車過長 {int(long_ride.sum()):,}、同站 {int(same_stop.sum()):,}、"
          f"重疊 {int(overlap.sum()):,}；版本 {data_version}；輸出 {output}", flush=True)


if __name__ == "__main__":
    main()
