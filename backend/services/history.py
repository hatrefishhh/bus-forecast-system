"""歷史需求：依已套用條件計算摘要、每日、每小時與星期比較。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from .data_store import DIRECTION_ALL_LABEL, WEEKDAY_LABELS, Dataset

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SUPPORTED_DIRECTIONS = ("all",)


class InvalidParams(ValueError):
    def __init__(self, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.code, self.message, self.field = code, message, field


@dataclass(frozen=True)
class Filters:
    start: date
    end: date
    route: str
    direction: str

    def as_dict(self) -> dict:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "route": self.route,
            "direction": self.direction,
            "direction_label": DIRECTION_ALL_LABEL,
        }


def _parse_date(value: str | None, field: str) -> date:
    label = "起日" if field == "start" else "迄日"
    if not value:
        raise InvalidParams("missing_date", f"請提供{label}（YYYY-MM-DD）。", field)
    if not DATE_RE.match(value):
        raise InvalidParams("invalid_date", f"{label}格式應為 YYYY-MM-DD。", field)
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise InvalidParams("invalid_date", f"{label}不是有效日期。", field) from None


def parse_filters(ds: Dataset, start: str | None, end: str | None, route: str | None,
                  direction: str | None) -> Filters:
    s, e = _parse_date(start, "start"), _parse_date(end, "end")
    if s > e:
        raise InvalidParams("invalid_range", "起日不可晚於迄日。", "start")
    lo, hi = ds.period_start, ds.period_end
    if s < lo or e > hi:
        raise InvalidParams("out_of_period", f"日期需介於資料期間 {lo.isoformat()} 至 {hi.isoformat()}。",
                            "start" if s < lo else "end")
    r = (route or ds.route).strip()
    if r != ds.route:
        raise InvalidParams("unsupported_route", f"目前僅支援路線 {ds.route}。", "route")
    dirn = (direction or "all").strip()
    if dirn not in SUPPORTED_DIRECTIONS:
        raise InvalidParams("unsupported_direction", "方向尚未分類，目前僅支援 all（全部方向）。", "direction")
    return Filters(s, e, r, dirn)


def slice_period(ds: Dataset, f: Filters) -> tuple[pd.DataFrame, np.ndarray]:
    i, j = ds.index_of(f.start), ds.index_of(f.end) + 1
    return ds.calendar.iloc[i:j], ds.hourly[i:j]


def _int_or_none(v) -> int | None:
    return None if v is None or pd.isna(v) else int(v)


def _avg(total: int, n: int) -> float | None:
    return round(total / n, 1) if n else None


def build_history(ds: Dataset, f: Filters) -> dict:
    cal, grid = slice_period(ds, f)
    recorded_mask = cal["trips"].notna()
    recorded_days = int(recorded_mask.sum())
    calendar_days = len(cal)
    total = int(cal.loc[recorded_mask, "trips"].sum()) if recorded_days else None

    daily = [
        {
            "date": row.date,
            "weekday": int(row.weekday),
            "weekday_label": WEEKDAY_LABELS[row.weekday],
            "trips": _int_or_none(row.trips),
            "status": "recorded" if not pd.isna(row.trips) else "no_record",
        }
        for row in cal.itertuples(index=False)
    ]

    peak = low = None
    if recorded_days:
        rec = cal[recorded_mask]
        pk = rec.loc[rec["trips"].idxmax()]
        lw = rec.loc[rec["trips"].idxmin()]
        peak = {"date": pk["date"], "weekday_label": WEEKDAY_LABELS[int(pk["weekday"])], "trips": int(pk["trips"])}
        low = {"date": lw["date"], "weekday_label": WEEKDAY_LABELS[int(lw["weekday"])], "trips": int(lw["trips"])}

    observed = ~np.isnan(grid)
    hour_days = observed.sum(axis=0)
    hour_totals = np.nansum(grid, axis=0)
    hourly = [
        {
            "hour": h,
            "trips": int(hour_totals[h]) if hour_days[h] else None,
            "recorded_days": int(hour_days[h]),
            "status": "recorded" if hour_days[h] else "no_record",
        }
        for h in range(24)
    ]

    by_weekday = []
    for wd in range(7):
        sub = cal[cal["weekday"] == wd]
        rec = sub["trips"].notna()
        n = int(rec.sum())
        t = int(sub.loc[rec, "trips"].sum()) if n else None
        by_weekday.append({
            "weekday": wd, "label": WEEKDAY_LABELS[wd], "calendar_days": len(sub),
            "recorded_days": n, "no_record_days": len(sub) - n,
            "total_trips": t, "avg_trips_per_recorded_day": _avg(t or 0, n),
        })

    groups = []
    for key, label, wds in (("weekday", "週一至週五", range(0, 5)), ("weekend", "週末（週六、週日）", range(5, 7))):
        rows = [by_weekday[w] for w in wds]
        n = sum(r["recorded_days"] for r in rows)
        t = sum(r["total_trips"] or 0 for r in rows) if n else None
        groups.append({
            "key": key, "label": label, "calendar_days": sum(r["calendar_days"] for r in rows),
            "recorded_days": n, "no_record_days": sum(r["no_record_days"] for r in rows),
            "total_trips": t, "avg_trips_per_recorded_day": _avg(t or 0, n),
        })

    no_record_dates = cal.loc[~recorded_mask, "date"].tolist()
    warnings = [{
        "code": "direction_unclassified",
        "message": "方向尚未分類：所有數字為兩方向合計。",
    }]
    if no_record_dates:
        shown = "、".join(no_record_dates[:8]) + ("等" if len(no_record_dates) > 8 else "")
        warnings.append({
            "code": "no_record_dates",
            "message": f"期間內有 {len(no_record_dates)} 天無刷卡紀錄（{shown}），以缺口顯示，未補 0；不代表已確認停駛或零需求。",
        })
    unobserved_hours = [h["hour"] for h in hourly if h["status"] == "no_record"]
    if recorded_days and unobserved_hours:
        warnings.append({
            "code": "hours_without_records",
            "message": f"有 {len(unobserved_hours)} 個時段在此期間沒有任何紀錄，標為無紀錄，未區分非營運或零旅次。",
        })
    warnings.extend({"code": "load_warning", "message": m} for m in ds.load_warnings)

    return {
        "data_version": ds.data_version,
        "filters": f.as_dict(),
        "status": "ok" if recorded_days else "no_records",
        "summary": {
            "calendar_days": calendar_days,
            "recorded_days": recorded_days,
            "no_record_days": calendar_days - recorded_days,
            "total_trips": total,
            "avg_trips_per_recorded_day": _avg(total or 0, recorded_days),
            "peak_day": peak,
            "low_day": low,
        },
        "daily": daily,
        "hourly": {"basis": "period_total", "points": hourly},
        "weekday_summary": {"by_weekday": by_weekday, "groups": groups},
        "no_record_dates": no_record_dates,
        "warnings": warnings,
    }
