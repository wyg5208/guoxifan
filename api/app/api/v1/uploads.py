import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.api.serializers import attachment_card, media_card
from app.api.utils import get_or_404
from app.core.config import settings
from app.core.constants import FILE_EXT, IMAGE_EXT, MEDIA_READY, VIDEO_EXT
from app.core.deps import ActiveUser, CurrentUser, DbSession
from app.core.errors import AppError, NotFoundError, PermissionError_
from app.db.base import new_id, utcnow
from app.db.session import SessionLocal
from app.models.chat import Attachment
from app.models.content import Album, Media
from app.models.user import User
from app.schemas.content import UploadInitRequest
from app.services import storage
from app.services.imaging import process_image
from app.services.video import process_video
from app.ws.manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["上传"])

CHUNK_SIZE = 5 * 1024 * 1024
UPLOAD_KINDS = {"image": IMAGE_EXT, "video": VIDEO_EXT, "file": FILE_EXT}


def _ext_of(filename: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix


def _kind_of(ext: str) -> str | None:
    for kind, allowed in UPLOAD_KINDS.items():
        if ext in allowed:
            return kind
    return None


async def _used_bytes(db, user_id: str) -> int:
    media_total = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Media.size_bytes), 0)).where(
                    Media.uploader_id == user_id, Media.deleted_at.is_(None)
                )
            )
        ).scalar()
        or 0
    )
    att_total = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Attachment.size_bytes), 0)).where(Attachment.uploader_id == user_id)
            )
        ).scalar()
        or 0
    )
    return media_total + att_total


async def _check_quota(db, user: User, extra: int) -> None:
    quota = int(settings.user_storage_quota_gb * 1024 * 1024 * 1024)
    used = await _used_bytes(db, user.id)
    if used + extra > quota:
        raise AppError("QUOTA_EXCEEDED", "你的存储空间已用尽，请先清理部分内容", 422)


async def _touch_album(db, album_id: str | None, media: Media) -> None:
    if not album_id:
        return
    album = await db.get(Album, album_id)
    if album is None:
        return
    album.media_count += 1
    if not album.cover_url and media.status == MEDIA_READY:
        album.cover_url = storage.media_url(media.id, "thumb.webp")


def _meta_path(upload_id: str) -> Path:
    return storage.staging_dir(upload_id) / "meta.json"


# ---------------------------------------------------------------- 单图（头像/封面/相册）


@router.post("/uploads/image", status_code=201)
async def upload_image(
    user: ActiveUser,
    db: DbSession,
    file: UploadFile = File(...),
    album_id: str | None = Form(default=None),
    caption: str | None = Form(default=None),
):
    ext = _ext_of(file.filename or "")
    if ext not in IMAGE_EXT:
        raise AppError("FILE_TYPE_NOT_ALLOWED", "只支持 jpg/png/webp/gif/heic 等图片", 422)

    data = await file.read()
    if len(data) > settings.max_image_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"图片不能超过 {settings.max_image_mb}MB", 413)
    await _check_quota(db, user, len(data))

    key = storage.new_storage_key("image", ext)
    dest = storage.safe_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)

    media = Media(
        album_id=album_id or None,
        kind="image",
        title=Path(file.filename or "").stem[:200] or None,
        caption=caption,
        status="processing",
        mime=file.content_type or "image/jpeg",
        ext=ext,
        size_bytes=len(data),
        storage_key=key,
        uploader_id=user.id,
    )
    db.add(media)
    await db.flush()

    try:
        info = await asyncio.to_thread(process_image, dest, storage.derived_dir(media.id))
        media.width = info["width"]
        media.height = info["height"]
        media.derived = json.dumps(info["variants"], ensure_ascii=False)
        if info.get("taken_at"):
            try:
                media.taken_at = datetime.fromisoformat(info["taken_at"])
            except ValueError:
                media.taken_at = None
        media.status = MEDIA_READY
    except Exception as exc:  # noqa: BLE001
        logger.warning("图片处理失败: %s", exc)
        media.status = "failed"
        await db.commit()
        raise AppError("FILE_INVALID", "图片无法解析，请换一张试试", 422) from exc

    await _touch_album(db, album_id, media)
    await db.commit()
    return {"data": media_card(media, user)}


# ---------------------------------------------------------------- 分片上传（视频/大文件）


@router.post("/uploads/init", status_code=201)
async def init_upload(payload: UploadInitRequest, user: ActiveUser, db: DbSession):
    filename = payload.filename
    ext = _ext_of(filename)
    kind = _kind_of(ext)
    if kind is None:
        raise AppError("FILE_TYPE_NOT_ALLOWED", "不支持的文件类型", 422)

    size = payload.size
    limit_mb = {
        "image": settings.max_image_mb,
        "video": settings.max_video_mb,
        "file": settings.max_file_mb,
    }[kind]
    if size > limit_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"文件不能超过 {limit_mb}MB", 413)
    await _check_quota(db, user, size)

    upload_id = new_id()
    chunks = max(1, (size + CHUNK_SIZE - 1) // CHUNK_SIZE)
    meta = {
        "upload_id": upload_id,
        "filename": filename,
        "ext": ext,
        "kind": kind,
        "mime": payload.mime or "application/octet-stream",
        "size": size,
        "chunk_size": CHUNK_SIZE,
        "chunks": chunks,
        "uploader_id": user.id,
        "album_id": payload.album_id,
        "created_at": utcnow().isoformat(),
    }
    _meta_path(upload_id).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    return {
        "data": {
            "upload_id": upload_id,
            "chunk_size": CHUNK_SIZE,
            "chunks": chunks,
            "upload_url": f"/api/v1/uploads/{upload_id}/chunk/{{index}}",
            "complete_url": f"/api/v1/uploads/{upload_id}/complete",
        }
    }


def _read_meta(upload_id: str) -> dict:
    path = _meta_path(upload_id)
    if not path.exists():
        raise AppError("UPLOAD_NOT_FOUND", "上传会话不存在或已过期", 404)
    return json.loads(path.read_text(encoding="utf-8"))


@router.put("/uploads/{upload_id}/chunk/{index}")
async def put_chunk(upload_id: str, index: int, request: Request, user: CurrentUser):
    meta = _read_meta(upload_id)
    if meta["uploader_id"] != user.id:
        raise PermissionError_("无权操作该上传")
    if index < 0 or index >= int(meta["chunks"]):
        raise AppError("VALIDATION_ERROR", "分片序号越界", 400)

    data = await request.body()
    if len(data) > int(meta["chunk_size"]) + 1024:
        raise AppError("FILE_TOO_LARGE", "分片过大", 413)
    received = storage.write_chunk(upload_id, index, data)
    return {"data": {"index": index, "received": received}}


@router.post("/uploads/{upload_id}/complete", status_code=201)
async def complete_upload(
    upload_id: str,
    user: ActiveUser,
    db: DbSession,
    background: BackgroundTasks,
):
    meta = _read_meta(upload_id)
    if meta["uploader_id"] != user.id:
        raise PermissionError_("无权操作该上传")

    key = storage.new_storage_key(meta["kind"], meta["ext"])
    dest = storage.safe_path(key)
    try:
        total = storage.assemble(upload_id, int(meta["chunks"]), dest)
    except FileNotFoundError as exc:
        raise AppError("UPLOAD_INCOMPLETE", "上传未完成，请重试", 422) from exc

    media = Media(
        album_id=meta.get("album_id"),
        kind=meta["kind"],
        title=Path(meta["filename"]).stem[:200] or None,
        status="processing",
        mime=meta.get("mime") or "application/octet-stream",
        ext=meta["ext"],
        size_bytes=total,
        storage_key=key,
        uploader_id=user.id,
    )
    db.add(media)
    await db.flush()
    await _touch_album(db, meta.get("album_id"), media)
    await db.commit()

    background.add_task(process_media_task, media.id)
    return {"data": {"media_id": media.id, "status": media.status, "estimated_seconds": 8}}


@router.get("/uploads/quota")
async def quota(user: CurrentUser, db: DbSession):
    used = await _used_bytes(db, user.id)
    quota_bytes = int(settings.user_storage_quota_gb * 1024 * 1024 * 1024)
    return {
        "data": {
            "used_bytes": used,
            "total_bytes": quota_bytes,
            "remaining_bytes": max(0, quota_bytes - used),
        }
    }


async def process_media_task(media_id: str) -> None:
    """后台处理：图片多尺寸 / 视频 HLS。独立 session，避免请求上下文失效。"""
    async with SessionLocal() as db:
        media = await db.get(Media, media_id)
        if media is None:
            return
        source = storage.safe_path(media.storage_key)
        out_dir = storage.derived_dir(media.id)
        try:
            if media.kind == "image":
                info = await asyncio.to_thread(process_image, source, out_dir)
                media.width = info["width"]
                media.height = info["height"]
                media.derived = json.dumps(info["variants"], ensure_ascii=False)
                if info.get("taken_at"):
                    try:
                        media.taken_at = datetime.fromisoformat(info["taken_at"])
                    except ValueError:
                        pass
            else:
                info = await process_video(source, out_dir)
                media.derived = json.dumps(info, ensure_ascii=False)
            media.status = MEDIA_READY
            media.updated_at = utcnow()
            await db.commit()
            await manager.send_to_user(
                media.uploader_id,
                {"type": "media.ready", "media_id": media.id, "status": MEDIA_READY},
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("媒体处理失败 %s: %s", media_id, exc)
            media.status = "failed"
            media.updated_at = utcnow()
            await db.commit()


# ---------------------------------------------------------------- 附件（聊天文件）


@router.post("/uploads/attachment", status_code=201)
async def upload_attachment(user: ActiveUser, db: DbSession, file: UploadFile = File(...)):
    ext = _ext_of(file.filename or "")
    kind = _kind_of(ext)
    if kind is None:
        raise AppError("FILE_TYPE_NOT_ALLOWED", "不支持的文件类型", 422)

    data = await file.read()
    limit = {
        "image": settings.max_image_mb,
        "video": settings.max_video_mb,
        "file": settings.max_file_mb,
    }[kind] * 1024 * 1024
    if len(data) > limit:
        raise AppError("FILE_TOO_LARGE", "文件过大", 413)
    await _check_quota(db, user, len(data))

    key = storage.new_storage_key("file" if kind == "file" else kind, ext)
    dest = storage.safe_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)

    attachment = Attachment(
        kind=kind,
        filename=(file.filename or "file")[:300],
        mime=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        storage_key=key,
        url=f"/media/{key}",
        uploader_id=user.id,
        created_at=utcnow(),
    )
    db.add(attachment)
    await db.flush()  # 先拿到 id，派生目录与 url 都依赖它

    if kind == "image":
        try:
            info = await asyncio.to_thread(
                process_image, dest, storage.derived_dir(f"att-{attachment.id}")
            )
            attachment.width = info["width"]
            attachment.height = info["height"]
            attachment.url = f"/media/derived/att-{attachment.id}/medium.webp"
        except Exception as exc:  # noqa: BLE001 - 附件处理失败不阻塞发送
            logger.warning("聊天图片处理失败: %s", exc)
            attachment.url = f"/media/{key}"

    await db.commit()
    return {"data": attachment_card(attachment)}


@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: str, user: CurrentUser, db: DbSession):
    attachment = await get_or_404(db, Attachment, attachment_id, "附件")
    path = storage.safe_path(attachment.storage_key)
    if not path.exists():
        raise NotFoundError("文件不存在")
    inline = attachment.kind in {"image", "video"}
    return FileResponse(
        path,
        media_type=attachment.mime,
        filename=None if inline else attachment.filename,
        content_disposition_type="inline" if inline else "attachment",
    )
