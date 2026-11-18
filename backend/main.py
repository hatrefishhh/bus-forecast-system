"""客運順起來 P0：FastAPI 提供 /api/* 與前端 build 後的靜態檔。

開發：python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5000
正式：python -m backend.serve（讀取 PORT，監聽 0.0.0.0，不使用 --reload）
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .services.data_store import DIRECTION_ALL_LABEL, DataStore, DataUnavailableError
from .services.export import build_csv, parse_kind
from .services.history import InvalidParams, build_history, parse_filters
from .services.quality import build_quality

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = DataStore(settings.data_dir, settings.route, settings.reload_check_seconds)
    store.status()  # 啟動時先載入一次；失敗時 API 會回明確錯誤
    app.state.store = store
    yield


app = FastAPI(title="客運順起來 API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)


def _store(request: Request) -> DataStore:
    return request.app.state.store


def _error(status: int, code: str, message: str, field: str | None = None) -> JSONResponse:
    detail = {"code": code, "message": message}
    if field:
        detail["field"] = field
    return JSONResponse(status_code=status, content={"detail": detail},
                        headers={"Cache-Control": "no-store"})


@app.exception_handler(InvalidParams)
async def _invalid_params(_: Request, exc: InvalidParams):
    return _error(422, exc.code, exc.message, exc.field)


@app.exception_handler(RequestValidationError)
async def _validation(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = first.get("loc", [])
    field = str(loc[-1]) if loc else None
    return _error(422, "invalid_params", f"參數 {field or ''} 不正確：{first.get('msg', '')}".strip(), field)


@app.exception_handler(DataUnavailableError)
async def _data_unavailable(_: Request, exc: DataUnavailableError):
    return _error(503, "data_unavailable", str(exc))


@app.exception_handler(StarletteHTTPException)
async def _http(request: Request, exc: StarletteHTTPException):
    if request.url.path.startswith("/api"):
        return _error(exc.status_code, "not_found" if exc.status_code == 404 else "http_error", str(exc.detail))
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/api/health")
def health(request: Request):
    ds, err = _store(request).status()
    if ds is None:
        return JSONResponse(status_code=503, content={"status": "error", "data": "unavailable", "message": err})
    return {"status": "ok", "data": "ready", "data_version": ds.data_version}


def _default_range(start: date, end: date) -> tuple[str, str]:
    """預設最後一個完整年度（目前資料為 2025 全年）。"""
    y = end.year
    lo = max(start, date(y, 1, 1))
    return lo.isoformat(), end.isoformat()


@app.get("/api/meta")
def meta(request: Request):
    ds = _store(request).get()
    years = sorted({int(d[:4]) for d in ds.calendar["date"]})
    presets = [{"key": str(y), "label": f"{y} 年",
                "start": max(ds.period_start, date(y, 1, 1)).isoformat(),
                "end": min(ds.period_end, date(y, 12, 31)).isoformat()} for y in years]
    presets.append({"key": "all", "label": "全部期間",
                    "start": ds.period_start.isoformat(), "end": ds.period_end.isoformat()})
    d_start, d_end = _default_range(ds.period_start, ds.period_end)
    return {
        "app_name": "客運順起來",
        "data_version": ds.data_version,
        "loaded_at": ds.loaded_at,
        "timezone": "Asia/Taipei",
        "routes": [ds.route],
        "default_route": ds.route,
        "period": {"start": ds.period_start.isoformat(), "end": ds.period_end.isoformat()},
        "default_range": {"start": d_start, "end": d_end},
        "presets": presets,
        "directions": [{"value": "all", "label": DIRECTION_ALL_LABEL}],
        "direction_classification_available": False,
        "features": {"history": True, "quality": True, "forecast": False, "scenario": False},
    }


@app.get("/api/history")
def history(request: Request, start: str | None = Query(None), end: str | None = Query(None),
            route: str | None = Query(None), direction: str | None = Query("all")):
    ds = _store(request).get()
    f = parse_filters(ds, start, end, route, direction)
    return build_history(ds, f)


@app.get("/api/quality")
def quality(request: Request):
    return build_quality(_store(request).get())


@app.get("/api/export")
def export(request: Request, start: str | None = Query(None), end: str | None = Query(None),
           route: str | None = Query(None), direction: str | None = Query("all"),
           kind: str | None = Query("daily")):
    ds = _store(request).get()
    k = parse_kind(kind)
    f = parse_filters(ds, start, end, route, direction)
    filename, body = build_csv(ds, f, k)
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"',
                             "X-Data-Version": ds.data_version,
                             "Cache-Control": "no-store"})


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def api_not_found(rest: str):
    return _error(404, "not_found", f"找不到 API：/api/{rest}")


# ---- 正式環境：同一服務提供前端靜態檔 ----
STATIC_DIR: Path = settings.static_dir


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    index = STATIC_DIR / "index.html"
    if not index.is_file():
        return JSONResponse(status_code=404, content={
            "detail": "前端尚未 build。開發時請用 Vite（npm run dev）；正式環境請先執行 npm run build。"})
    if full_path:
        candidate = (STATIC_DIR / full_path).resolve()
        if candidate.is_file() and STATIC_DIR in candidate.parents:
            cache = "public, max-age=31536000, immutable" if "/assets/" in candidate.as_posix() else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
