"""CSV 匯出：與歷史頁使用同一組已套用條件；UTF-8 BOM 讓 Excel 正確顯示中文。"""
from __future__ import annotations

import csv
import io

import numpy as np

from .data_store import DIRECTION_ALL_LABEL, WEEKDAY_LABELS, Dataset
from .history import Filters, InvalidParams, build_history, slice_period

EXPORT_KINDS = ("daily", "hourly", "hourly_summary")
STATUS_LABEL = {"recorded": "有紀錄", "no_record": "無紀錄（未補 0）"}


def parse_kind(kind: str | None) -> str:
    k = (kind or "daily").strip()
    if k not in EXPORT_KINDS:
        raise InvalidParams("unsupported_kind", "kind 只能是 daily、hourly 或 hourly_summary。", "kind")
    return k


def _meta(ds: Dataset, f: Filters) -> list[str]:
    return [f.route, DIRECTION_ALL_LABEL, f"{f.start.isoformat()}~{f.end.isoformat()}", ds.data_version]


META_HEADER = ["路線", "方向", "篩選期間", "資料版本"]


def build_csv(ds: Dataset, f: Filters, kind: str) -> tuple[str, bytes]:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    meta = _meta(ds, f)

    if kind == "daily":
        w.writerow(["日期", "星期", "刷卡旅次", "資料狀態", *META_HEADER])
        for d in build_history(ds, f)["daily"]:
            w.writerow([d["date"], d["weekday_label"], "" if d["trips"] is None else d["trips"],
                        STATUS_LABEL[d["status"]], *meta])
    elif kind == "hourly":
        # 只列有紀錄的日期與時段；缺列不代表 0
        cal, grid = slice_period(ds, f)
        w.writerow(["日期", "星期", "小時", "刷卡旅次", *META_HEADER])
        for (row, counts) in zip(cal.itertuples(index=False), grid):
            for h in np.flatnonzero(~np.isnan(counts)):
                w.writerow([row.date, WEEKDAY_LABELS[row.weekday], int(h), int(counts[h]), *meta])
    else:
        w.writerow(["小時", "期間累計刷卡旅次", "有紀錄天數", "資料狀態", *META_HEADER])
        for p in build_history(ds, f)["hourly"]["points"]:
            w.writerow([p["hour"], "" if p["trips"] is None else p["trips"], p["recorded_days"],
                        STATUS_LABEL[p["status"]], *meta])

    filename = f"{f.route}_{kind}_{f.start.isoformat()}_{f.end.isoformat()}_{ds.data_version}.csv"
    return filename, buf.getvalue().encode("utf-8-sig")
