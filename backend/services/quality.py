"""資料品質：區分「現有報告已檢查」與「新增規則」，不把舊報告的 0 說成資料完全正常。"""
from __future__ import annotations

from .data_store import WEEKDAY_LABELS, Dataset

EXISTING_RULES = {
    "invalid_boarding_time": ("上車時間無法解析", "上車時間欄位不是有效日期時間"),
    "invalid_alighting_time": ("下車時間無法解析", "下車時間欄位不是有效日期時間"),
    "reversed_time": ("下車早於上車", "下車時間早於上車時間"),
    "missing_stop": ("站名空白", "上車或下車站名為空白"),
    "possible_duplicate": ("疑似重複交易", "讀取欄位全部相同的紀錄（只標記，不刪除，可能是不同乘客）"),
    "sheet_month_mismatch": ("工作表月份不符", "上車時間的年月與所在工作表名稱不符"),
}

# 每條限制：畫面上只顯示一行 label，完整說明放在 detail（前端以 InfoTip 呈現）
LIMITATIONS = [
    {"label": "刷卡旅次不是乘客人數",
     "detail": "刷卡旅次不等於獨立乘客人數、車上人數，也不包含沒搭上車的人。"},
    {"label": "缺列不補 0",
     "detail": "每小時表只列有紀錄的時段；缺列不能自動補 0，尚未區分非營運時段與零旅次。"},
    {"label": "去回程尚未分類",
     "detail": "方向需以站名、路線與年份核對；相同站序在不同年份可對應不同站名，不能用站序差判斷去回程。"},
    {"label": "下車異常不影響上車統計",
     "detail": "下車異常不代表上車無效；上車旅次統計保留這些紀錄並另列旗標。"},
    {"label": "週末未含國定假日",
     "detail": "週末只指週六、週日，未含國定假日；尚未補官方行事曆。"},
    {"label": "不自動刪除異常紀錄",
     "detail": "未自動刪除低運量日、尖峰或疑似重複交易。"},
]


def build_quality(ds: Dataset) -> dict:
    cal = ds.calendar
    recorded = cal["trips"].notna()
    total = int(cal.loc[recorded, "trips"].sum())
    rep = ds.quality_report
    flags = rep.get("flags", {})

    existing = [
        {"id": k, "label": EXISTING_RULES.get(k, (k, ""))[0], "definition": EXISTING_RULES.get(k, ("", ""))[1],
         "count": int(v)}
        for k, v in flags.items()
    ]

    no_record = []
    for d in cal.loc[~recorded].itertuples(index=False):
        no_record.append({"date": d.date, "weekday_label": WEEKDAY_LABELS[d.weekday],
                          "status": "no_record_verify", "listed_in_source": d.date in ds.no_record_listed})

    st = ds.station_mapping
    multi = (st.groupby(["year", "sequence"])
             .agg(stops=("stop", lambda s: list(s)), sizes=("size", lambda s: [int(x) for x in s]))
             .reset_index())
    multi = multi[multi["stops"].map(len) > 1]
    station_by_year = []
    for year, g in st.groupby("year"):
        station_by_year.append({
            "year": int(year),
            "sequences": int(g["sequence"].nunique()),
            "sequences_with_multiple_stops": int((multi["year"] == year).sum()),
        })
    station_examples = [
        {"year": int(r.year), "sequence": int(r.sequence),
         "stops": [{"stop": s, "count": n} for s, n in sorted(zip(r.stops, r.sizes), key=lambda x: -x[1])]}
        for r in multi.itertuples(index=False)
    ]

    qc = ds.quality_checks
    new_checks = {
        "status": ds.quality_checks_status,
        "message": ds.quality_checks_message,
        "generated_at": qc.get("generated_at") if qc else None,
        "data_version": qc.get("data_version") if qc else None,
        "rows_checked": qc.get("source", {}).get("rows") if qc else None,
        "ride_minutes_quantiles": qc.get("ride_minutes_quantiles") if qc else None,
        "rules": qc.get("rules", []) if qc and ds.quality_checks_status == "ready" else [],
        "overlap": qc.get("overlap") if qc and ds.quality_checks_status == "ready" else None,
    }

    return {
        "data_version": ds.data_version,
        "route": ds.route,
        "coverage": {
            "period_start": ds.period_start.isoformat(),
            "period_end": ds.period_end.isoformat(),
            "calendar_days": len(cal),
            "recorded_days": int(recorded.sum()),
            "no_record_days": int((~recorded).sum()),
            "total_trips": total,
        },
        "direction": {
            **ds.direction,
            "note": "方向尚未分類，網站只提供全部方向合計；方向對照表需經站點資料核對後填寫。",
        },
        "no_record_dates": no_record,
        "existing_checks": {
            "source": "quality_report.json",
            "rows_checked": rep.get("selected_rows"),
            "counted_boarding_trips": rep.get("counted_boarding_trips"),
            "rules": existing,
            "notes": rep.get("notes", []),
            "note": "這些規則在原腳本條件下檢出 0 筆，只代表這幾項規則沒有命中，不代表資料完全無異常。",
        },
        "new_checks": new_checks,
        "sheet_audit": [
            {"file": r["file"], "sheet": str(r["sheet"]), "raw_rows": int(r["raw_rows"]),
             "selected_rows": int(r["selected_rows"])}
            for r in ds.sheet_audit
        ],
        "station_mapping": {"by_year": station_by_year, "multi_stop_sequences": station_examples},
        "limitations": LIMITATIONS,
        "load_warnings": ds.load_warnings,
    }
