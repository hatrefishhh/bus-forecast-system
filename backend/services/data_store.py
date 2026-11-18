"""讀取與快取彙整檔。

只讀小型彙整檔（每日、每小時、品質摘要），不讀 84 萬筆逐筆資料。
資料在第一次使用時載入，之後只在檔案大小或修改時間改變時重新載入。
"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from .versioning import VERSIONED_FILES, compute_data_version

TZ = ZoneInfo("Asia/Taipei")
WEEKDAY_LABELS = ("週一", "週二", "週三", "週四", "週五", "週六", "週日")
DIRECTION_ALL_LABEL = "全部方向（尚未分類）"

REQUIRED_FILES = VERSIONED_FILES
OPTIONAL_FILES = ("hourly_by_direction.csv", "direction_map_template.csv", "quality_checks.json")


class DataUnavailableError(RuntimeError):
    """來源檔缺少或格式不符；API 以 503 回報，不以空結果掩蓋。"""


@dataclass
class Dataset:
    data_version: str
    route: str
    loaded_at: str
    period_start: date
    period_end: date
    calendar: pd.DataFrame          # index=日期序號；欄位 date, weekday, trips(Int64, 無紀錄為 NA)
    hourly: np.ndarray              # [天數, 24] float，無紀錄為 NaN
    no_record_listed: list[str]     # dates_without_records.csv 原始清單
    quality_report: dict
    sheet_audit: list[dict]
    station_mapping: pd.DataFrame
    direction: dict
    quality_checks: dict | None
    quality_checks_status: str      # ready / missing / stale / invalid
    quality_checks_message: str
    load_warnings: list[str] = field(default_factory=list)

    def index_of(self, d: date) -> int:
        return (d - self.period_start).days


def _read_csv(path: Path, **kw) -> pd.DataFrame:
    try:
        return pd.read_csv(path, encoding="utf-8-sig", **kw)
    except FileNotFoundError as exc:
        raise DataUnavailableError(f"找不到來源檔 {path.name}") from exc
    except Exception as exc:  # 格式錯誤要明確回報
        raise DataUnavailableError(f"來源檔 {path.name} 無法讀取：{exc}") from exc


def _require_columns(df: pd.DataFrame, name: str, cols: list[str]) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise DataUnavailableError(f"來源檔 {name} 缺少欄位：{', '.join(missing)}")


def load_dataset(data_dir: Path, route: str) -> Dataset:
    if not data_dir.is_dir():
        raise DataUnavailableError(f"找不到資料資料夾（BUS_DATA_DIR）：{data_dir.name}")
    for name in REQUIRED_FILES:
        if not (data_dir / name).is_file():
            raise DataUnavailableError(f"找不到來源檔 {name}，請依 README 放入 data/prepared/")

    data_version = compute_data_version(data_dir)
    warnings: list[str] = []

    daily = _read_csv(data_dir / "daily_trips.csv", dtype={"date": "string", "route": "string"})
    _require_columns(daily, "daily_trips.csv", ["date", "route", "trips"])
    daily = daily[daily["route"].str.strip() == route]
    if daily.empty:
        raise DataUnavailableError(f"daily_trips.csv 沒有路線 {route} 的紀錄")
    if daily["date"].duplicated().any():
        raise DataUnavailableError("daily_trips.csv 有重複日期")

    hourly = _read_csv(data_dir / "hourly_all_directions.csv", dtype={"date": "string", "route": "string"})
    _require_columns(hourly, "hourly_all_directions.csv", ["date", "route", "hour", "trips"])
    hourly = hourly[hourly["route"].str.strip() == route]

    gaps = _read_csv(data_dir / "dates_without_records.csv", dtype="string")
    _require_columns(gaps, "dates_without_records.csv", ["date", "status"])
    no_record_listed = sorted(gaps["date"].dropna().str.strip().tolist())

    # 資料期間：觀測日與無紀錄清單的聯集（原腳本以整年列出無紀錄日）
    all_dates = pd.to_datetime(pd.concat([daily["date"], pd.Series(no_record_listed, dtype="string")]),
                               format="%Y-%m-%d")
    period_start = all_dates.min().date()
    period_end = all_dates.max().date()
    days = pd.date_range(period_start, period_end, freq="D")

    trips_by_date = daily.set_index("date")["trips"].astype("int64")
    calendar = pd.DataFrame({"date": days.strftime("%Y-%m-%d")})
    calendar["weekday"] = days.day_of_week.astype(int)
    calendar["trips"] = calendar["date"].map(trips_by_date).astype("Int64")

    missing_dates = calendar.loc[calendar["trips"].isna(), "date"].tolist()
    if missing_dates != no_record_listed:
        warnings.append("dates_without_records.csv 與每日表推得的無紀錄日期不一致，網站以每日表為準。")

    grid = np.full((len(days), 24), np.nan)
    pos = pd.Series(range(len(days)), index=calendar["date"])
    hr = hourly.assign(i=hourly["date"].map(pos))
    if hr["i"].isna().any() or not hr["hour"].between(0, 23).all():
        raise DataUnavailableError("hourly_all_directions.csv 含期間外日期或無效小時")
    if hr.duplicated(["date", "hour"]).any():
        raise DataUnavailableError("hourly_all_directions.csv 有重複的日期與小時")
    grid[hr["i"].astype(int).to_numpy(), hr["hour"].astype(int).to_numpy()] = hr["trips"].to_numpy(float)

    # 每小時加總必須等於每日旅次
    hourly_sum = np.nansum(grid, axis=1)
    recorded = calendar["trips"].notna().to_numpy()
    if not np.array_equal(hourly_sum[recorded], calendar.loc[recorded, "trips"].to_numpy(float)):
        raise DataUnavailableError("每小時加總與每日旅次不一致，請重新產生彙整檔")
    if np.any(~np.isnan(grid[~recorded])):
        raise DataUnavailableError("無紀錄日期出現每小時紀錄，請重新產生彙整檔")

    quality_report = json.loads((data_dir / "quality_report.json").read_text(encoding="utf-8"))
    audit = _read_csv(data_dir / "sheet_audit.csv", dtype={"file": "string", "sheet": "string"})
    _require_columns(audit, "sheet_audit.csv", ["file", "sheet", "raw_rows", "selected_rows"])
    station = _read_csv(data_dir / "station_mapping_review.csv", dtype={"stop": "string", "route": "string"})
    _require_columns(station, "station_mapping_review.csv", ["year", "route", "sequence", "stop", "size"])

    direction = _direction_summary(data_dir, route, int(calendar["trips"].sum()))
    qc, qc_status, qc_message = _load_quality_checks(data_dir, data_version, int(calendar["trips"].sum()))

    return Dataset(
        data_version=data_version,
        route=route,
        loaded_at=datetime.now(TZ).isoformat(timespec="seconds"),
        period_start=period_start,
        period_end=period_end,
        calendar=calendar,
        hourly=grid,
        no_record_listed=no_record_listed,
        quality_report=quality_report,
        sheet_audit=audit.to_dict(orient="records"),
        station_mapping=station,
        direction=direction,
        quality_checks=qc,
        quality_checks_status=qc_status,
        quality_checks_message=qc_message,
        load_warnings=warnings,
    )


def _direction_summary(data_dir: Path, route: str, total: int) -> dict:
    out = {"classified": False, "unknown_rows": None, "classified_rows": None, "total_rows": total,
           "template_pairs": None, "template_filled": None}
    by_dir = data_dir / "hourly_by_direction.csv"
    if by_dir.is_file():
        df = _read_csv(by_dir, dtype={"direction": "string", "route": "string"})
        df = df[df["route"].str.strip() == route]
        unknown = int(df.loc[df["direction"].fillna("UNKNOWN").eq("UNKNOWN"), "trips"].sum())
        out["unknown_rows"] = unknown
        out["classified_rows"] = int(df["trips"].sum()) - unknown
    template = data_dir / "direction_map_template.csv"
    if template.is_file():
        t = _read_csv(template, dtype="string")
        out["template_pairs"] = len(t)
        out["template_filled"] = int(t.get("direction", pd.Series(dtype="string")).fillna("").str.strip().ne("").sum())
    # P0 不支援方向篩選；就算之後有部分分類，也要等對照表核對完成才開放
    out["classified"] = False
    return out


def _load_quality_checks(data_dir: Path, data_version: str, total: int) -> tuple[dict | None, str, str]:
    path = data_dir / "quality_checks.json"
    if not path.is_file():
        return None, "missing", "新增規則尚未計算：請執行 scripts/quality_checks.py 產生 quality_checks.json。"
    try:
        qc = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, "invalid", f"quality_checks.json 無法讀取：{exc}"
    if qc.get("data_version") != data_version:
        return qc, "stale", (f"quality_checks.json 的資料版本（{qc.get('data_version')}）與目前彙整檔"
                             f"（{data_version}）不同，新增規則待重算。")
    if int(qc.get("source", {}).get("rows", -1)) != total:
        return qc, "stale", "quality_checks.json 的檢查筆數與每日旅次總數不一致，新增規則待重算。"
    return qc, "ready", "新增規則已由離線腳本依目前資料版本計算。"


class DataStore:
    """執行緒安全的快取；檔案變更時才重新載入。"""

    def __init__(self, data_dir: Path, route: str, reload_check_seconds: float = 5.0):
        self.data_dir = data_dir
        self.route = route
        self.reload_check_seconds = reload_check_seconds
        self._lock = threading.Lock()
        self._dataset: Dataset | None = None
        self._error: str | None = None
        self._signature: tuple | None = None
        self._last_check = 0.0

    def _current_signature(self) -> tuple:
        sig = []
        for name in REQUIRED_FILES + OPTIONAL_FILES:
            p = self.data_dir / name
            try:
                st = p.stat()
                sig.append((name, st.st_size, st.st_mtime_ns))
            except FileNotFoundError:
                sig.append((name, None, None))
        return tuple(sig)

    def _maybe_reload(self) -> None:
        now = time.monotonic()
        if self._signature is not None and now - self._last_check < self.reload_check_seconds:
            return
        self._last_check = now
        sig = self._current_signature()
        if sig == self._signature:
            return
        self._signature = sig
        try:
            self._dataset = load_dataset(self.data_dir, self.route)
            self._error = None
        except DataUnavailableError as exc:
            self._dataset, self._error = None, str(exc)
        except Exception as exc:  # 未預期錯誤也要回報，不改用假資料
            self._dataset, self._error = None, f"資料載入失敗：{exc}"

    def get(self) -> Dataset:
        with self._lock:
            self._maybe_reload()
            if self._dataset is None:
                raise DataUnavailableError(self._error or "資料尚未載入")
            return self._dataset

    def status(self) -> tuple[Dataset | None, str | None]:
        with self._lock:
            self._maybe_reload()
            return self._dataset, self._error
