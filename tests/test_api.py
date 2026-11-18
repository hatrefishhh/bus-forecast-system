"""P0 驗收：彙整、缺漏、API 與匯出。使用 data/prepared 中的實際彙整檔。"""
from __future__ import annotations

import csv
import io
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.data_store import DataStore

DATA = Path(__file__).resolve().parents[1] / "data" / "prepared"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def hist(client, start, end, **kw):
    return client.get("/api/history", params={"start": start, "end": end, "route": "6670D",
                                              "direction": "all", **kw})


def test_health_and_meta(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["data"] == "ready"
    m = client.get("/api/meta").json()
    assert m["routes"] == ["6670D"]
    assert m["period"] == {"start": "2024-01-01", "end": "2025-12-31"}
    assert m["default_range"] == {"start": "2025-01-01", "end": "2025-12-31"}
    assert [d["value"] for d in m["directions"]] == ["all"]
    assert m["direction_classification_available"] is False
    assert m["data_version"].startswith("prep-")


def test_totals_full_period(client):
    s = hist(client, "2024-01-01", "2025-12-31").json()["summary"]
    assert s["total_trips"] == 840_431
    assert s["recorded_days"] == 725 and s["no_record_days"] == 6 and s["calendar_days"] == 731


@pytest.mark.parametrize("year,total,days", [(2024, 423_365, 361), (2025, 417_066, 364)])
def test_totals_by_year(client, year, total, days):
    body = hist(client, f"{year}-01-01", f"{year}-12-31").json()
    s = body["summary"]
    assert s["total_trips"] == total and s["recorded_days"] == days
    assert s["avg_trips_per_recorded_day"] == round(total / days, 1)
    assert sum(p["trips"] or 0 for p in body["hourly"]["points"]) == total
    assert sum(d["trips"] or 0 for d in body["daily"]) == total


def test_single_no_record_day_is_not_zero(client):
    body = hist(client, "2024-07-24", "2024-07-24").json()
    assert body["status"] == "no_records"
    assert body["summary"]["total_trips"] is None
    assert body["summary"]["avg_trips_per_recorded_day"] is None
    assert body["daily"] == [{"date": "2024-07-24", "weekday": 2, "weekday_label": "週三",
                              "trips": None, "status": "no_record"}]
    assert all(p["trips"] is None and p["status"] == "no_record" for p in body["hourly"]["points"])
    assert body["no_record_dates"] == ["2024-07-24"]


def test_no_record_dates_listed(client):
    body = hist(client, "2024-01-01", "2025-12-31").json()
    assert body["no_record_dates"] == ["2024-07-24", "2024-07-25", "2024-10-02", "2024-10-03",
                                       "2024-10-31", "2025-07-07"]


def test_hours_without_records_are_null(client):
    pts = hist(client, "2024-01-01", "2025-12-31").json()["hourly"]["points"]
    assert [p["hour"] for p in pts] == list(range(24))
    for h in range(0, 5):
        assert pts[h]["trips"] is None and pts[h]["status"] == "no_record"
    assert pts[12]["trips"] == 81_675


def test_weekday_summary_uses_recorded_day_average(client):
    ws = hist(client, "2024-01-01", "2025-12-31").json()["weekday_summary"]
    assert sum(w["recorded_days"] for w in ws["by_weekday"]) == 725
    for w in ws["by_weekday"]:
        assert w["avg_trips_per_recorded_day"] == round(w["total_trips"] / w["recorded_days"], 1)
    labels = [g["label"] for g in ws["groups"]]
    assert labels == ["週一至週五", "週末（週六、週日）"]
    assert sum(g["total_trips"] for g in ws["groups"]) == 840_431


@pytest.mark.parametrize("params,code", [
    ({"start": "2025-02-01", "end": "2025-01-01"}, "invalid_range"),
    ({"start": "2025-13-01", "end": "2025-12-31"}, "invalid_date"),
    ({"start": "2025/01/01", "end": "2025-12-31"}, "invalid_date"),
    ({"start": "2023-01-01", "end": "2025-12-31"}, "out_of_period"),
    ({"start": "2025-01-01", "end": "2025-12-31", "route": "6670"}, "unsupported_route"),
    ({"start": "2025-01-01", "end": "2025-12-31", "direction": "outbound"}, "unsupported_direction"),
    ({"end": "2025-12-31"}, "missing_date"),
])
def test_invalid_params_422(client, params, code):
    r = client.get("/api/history", params=params)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == code


def read_csv(resp):
    assert resp.content.startswith(b"\xef\xbb\xbf"), "需有 UTF-8 BOM 供 Excel 讀中文"
    return list(csv.reader(io.StringIO(resp.content.decode("utf-8-sig"))))


def test_export_daily_matches_filters(client):
    r = client.get("/api/export", params={"start": "2024-07-20", "end": "2024-07-31", "route": "6670D",
                                          "direction": "all", "kind": "daily"})
    assert r.status_code == 200
    assert "6670D_daily_2024-07-20_2024-07-31_prep-" in r.headers["content-disposition"]
    rows = read_csv(r)
    assert rows[0][:4] == ["日期", "星期", "刷卡旅次", "資料狀態"]
    assert rows[0][4:] == ["路線", "方向", "篩選期間", "資料版本"]
    body = rows[1:]
    assert len(body) == 12
    no_rec = [x for x in body if x[0] in ("2024-07-24", "2024-07-25")]
    assert all(x[2] == "" and x[3].startswith("無紀錄") for x in no_rec)
    assert all(x[4] == "6670D" and x[6] == "2024-07-20~2024-07-31" for x in body)
    total = sum(int(x[2]) for x in body if x[2])
    assert total == hist(client, "2024-07-20", "2024-07-31").json()["summary"]["total_trips"]


def test_export_hourly_only_recorded_rows(client):
    r = client.get("/api/export", params={"start": "2025-01-01", "end": "2025-12-31", "kind": "hourly"})
    rows = read_csv(r)[1:]
    assert sum(int(x[3]) for x in rows) == 417_066
    r2 = client.get("/api/export", params={"start": "2025-01-01", "end": "2025-12-31", "kind": "hourly_summary"})
    rows2 = read_csv(r2)[1:]
    assert len(rows2) == 24 and rows2[0][1] == "" and rows2[0][3].startswith("無紀錄")


def test_export_bad_kind(client):
    r = client.get("/api/export", params={"start": "2025-01-01", "end": "2025-12-31", "kind": "xlsx"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "unsupported_kind"


def test_quality(client):
    q = client.get("/api/quality").json()
    assert q["direction"]["unknown_rows"] == 840_431 and q["direction"]["classified"] is False
    assert [d["date"] for d in q["no_record_dates"]][0] == "2024-07-24"
    assert all(r["count"] == 0 for r in q["existing_checks"]["rules"])
    assert "不代表資料完全無異常" in q["existing_checks"]["note"]
    nc = q["new_checks"]
    assert nc["status"] == "ready"
    counts = {r["id"]: r["count"] for r in nc["rules"]}
    assert counts == {"long_ride": 100, "same_stop": 2_623}
    assert nc["overlap"]["count"] <= min(counts.values())


def test_sheet_names_kept_as_text(client):
    sheets = [r["sheet"] for r in client.get("/api/quality").json()["sheet_audit"]]
    assert "2024.10" in sheets and "2025.10" in sheets and "2024.1" not in sheets
    assert len(sheets) == 24


def test_no_sensitive_fields_in_responses(client):
    blobs = [client.get(u).text for u in ("/api/quality", "/api/meta")]
    blobs.append(hist(client, "2024-01-01", "2025-12-31").text)
    for b in blobs:
        for word in ("vehicle", "卡號", "司機", "card", "958-FX", "KKA-"):
            assert word not in b


def test_missing_source_file_is_explicit(tmp_path):
    for f in DATA.iterdir():
        if f.is_file() and f.name != "daily_trips.csv":
            shutil.copy(f, tmp_path / f.name)
    with TestClient(app) as c:
        original = c.app.state.store
        c.app.state.store = DataStore(tmp_path, "6670D")
        try:
            r = hist(c, "2025-01-01", "2025-12-31")
            assert r.status_code == 503
            assert r.json()["detail"]["code"] == "data_unavailable"
            assert "daily_trips.csv" in r.json()["detail"]["message"]
            assert c.get("/api/health").status_code == 503
        finally:
            c.app.state.store = original


def test_stale_quality_checks_marked_pending(tmp_path):
    for f in DATA.iterdir():
        if f.is_file():
            shutil.copy(f, tmp_path / f.name)
    # 改動彙整檔 → 版本改變 → 新增規則必須標為待重算
    p = tmp_path / "sheet_audit.csv"
    p.write_bytes(p.read_bytes() + b"\r\n")
    with TestClient(app) as c:
        original = c.app.state.store
        c.app.state.store = DataStore(tmp_path, "6670D")
        try:
            nc = c.get("/api/quality").json()["new_checks"]
            assert nc["status"] == "stale" and nc["rules"] == []
        finally:
            c.app.state.store = original


def test_unknown_api_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"
