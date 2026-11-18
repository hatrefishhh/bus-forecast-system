"""執行設定：全部由環境變數提供，未設定時使用本機開發預設值。"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    static_dir: Path
    route: str
    reload_check_seconds: float


def get_settings() -> Settings:
    data_dir = Path(os.environ.get("BUS_DATA_DIR", PROJECT_ROOT / "data" / "prepared"))
    static_dir = Path(os.environ.get("BUS_STATIC_DIR", PROJECT_ROOT / "frontend" / "dist"))
    return Settings(
        data_dir=data_dir.resolve(),
        static_dir=static_dir.resolve(),
        route=os.environ.get("BUS_ROUTE", "6670D").strip(),
        reload_check_seconds=float(os.environ.get("BUS_RELOAD_CHECK_SECONDS", "5")),
    )
