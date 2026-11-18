"""資料版本：以 P0 彙整檔內容雜湊產生，網站與離線品質腳本共用同一定義。"""
from __future__ import annotations

import hashlib
from pathlib import Path

# 參與版本計算的彙整檔（順序固定）。quality_checks.json 是衍生檔，不列入以免循環。
VERSIONED_FILES = (
    "daily_trips.csv",
    "hourly_all_directions.csv",
    "dates_without_records.csv",
    "quality_report.json",
    "sheet_audit.csv",
    "station_mapping_review.csv",
)


def compute_data_version(data_dir: Path) -> str:
    """回傳例如 `prep-3f9a1c2e` 的版本字串；缺檔時拋出 FileNotFoundError。"""
    digest = hashlib.sha256()
    for name in VERSIONED_FILES:
        path = data_dir / name
        if not path.is_file():
            raise FileNotFoundError(str(path))
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"prep-{digest.hexdigest()[:8]}"
