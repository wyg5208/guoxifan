"""应用入口：uvicorn app.main:app --host 127.0.0.1 --port 8000"""

import logging
import mimetypes
import shutil
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.core.config import settings
from app.core.errors import AppError
from app.db.session import SessionLocal, init_db
from app.services.settings import ensure_seed
from app.ws.router import router as ws_router

VERSION = "1.0.0"

logger = logging.getLogger("app")

# Windows 注册表常缺这些类型，显式注册，否则派生图会以 octet-stream 下发
for _type, _ext in (
    ("image/webp", ".webp"),
    ("image/avif", ".avif"),
    ("image/heic", ".heic"),
    ("image/heif", ".heif"),
    ("video/mp4", ".mp4"),
    ("video/quicktime", ".mov"),
    ("video/webm", ".webm"),
    ("application/vnd.apple.mpegurl", ".m3u8"),
    ("video/mp2t", ".ts"),
):
    mimetypes.add_type(_type, _ext)

HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "AUTH_REQUIRED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}


class CachedStaticFiles(StaticFiles):
    """派生图/视频文件名带唯一 id，可以放心长缓存。"""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )
    settings.ensure_dirs()
    await init_db()
    async with SessionLocal() as db:
        await ensure_seed(
            db,
            settings.admin_init_email,
            settings.admin_init_password,
            settings.admin_init_nickname,
        )
    logger.info("老村记忆 API 已启动，媒体目录：%s", settings.media_path)
    yield
    logger.info("老村记忆 API 已停止")


settings.ensure_dirs()

app = FastAPI(
    title="老村记忆 API",
    description="村庄纪念站：照片、文章、村民名片、聊天室。",
    version=VERSION,
    lifespan=lifespan,
    # 生产环境按 docs/06 §7 关掉交互式文档
    docs_url=None if settings.is_production else "/docs",
    openapi_url=None if settings.is_production else "/openapi.json",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
    max_age=86400,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def add_trace_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{(time.perf_counter() - started) * 1000:.1f}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ---------------------------------------------------------------- 异常处理


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    details = []
    for item in exc.errors():
        details.append(
            {
                "loc": ".".join(str(part) for part in item.get("loc", ())),
                "msg": item.get("msg"),
                "type": item.get("type"),
            }
        )
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "请求参数不合法",
                "details": jsonable_encoder(details),
            }
        },
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(request: Request, exc: StarletteHTTPException):
    code = HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "请求无法完成"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": code, "message": message, "details": None}},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    logger.exception("未处理的异常 %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "服务器出了点问题，请稍后再试", "details": None}},
    )


# ---------------------------------------------------------------- 路由与静态资源


app.include_router(api_router)
app.include_router(ws_router)
app.mount(
    "/media/derived",
    CachedStaticFiles(directory=str(settings.derived_path), check_dir=False),
    name="derived",
)
app.mount(
    "/media/attachments",
    CachedStaticFiles(directory=str(settings.attachment_path), check_dir=False),
    name="attachments",
)


@app.get("/healthz", tags=["运维"])
async def healthz():
    """存活 + 数据库 + 磁盘自检，计划任务与运维脚本都读这里。"""
    disk_free_gb = None
    try:
        usage = shutil.disk_usage(settings.media_path)
        disk_free_gb = round(usage.free / 1024**3, 1)
    except OSError:
        pass

    db_ok = True
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - 健康检查不该抛异常
        logger.exception("健康检查：数据库不可用")
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "ok": db_ok,
        "version": VERSION,
        "env": settings.app_env,
        "db": "ok" if db_ok else "error",
        "disk_free_gb": disk_free_gb,
    }


@app.get("/", include_in_schema=False)
async def root():
    if settings.is_production:
        return {"name": settings.app_name, "version": VERSION, "docs": "disabled"}
    return RedirectResponse(url="/docs")
