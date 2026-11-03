"""本地磁盘存储：原图/派生图/视频/附件/分片暂存。"""

import shutil
import uuid
from datetime import datetime
from pathlib import Path

from app.core.config import settings


def _ym() -> str:
    return datetime.utcnow().strftime("%Y/%m")


def new_storage_key(kind: str, ext: str = "") -> str:
    ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}" if ext else ""
    name = f"{uuid.uuid4().hex}{ext}"
    if kind == "video":
        return f"videos/{_ym()}/{name}"
    if kind == "file":
        return f"attachments/{_ym()}/{name}"
    return f"uploads/{_ym()}/{name}"


def safe_path(key: str) -> Path:
    root = settings.media_path
    target = (root / key).resolve()
    if root not in target.parents and target != root:
        raise ValueError("非法的存储路径")
    return target


def derived_dir(media_id: str) -> Path:
    path = settings.derived_path / media_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def staging_dir(upload_id: str) -> Path:
    path = settings.staging_path / upload_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_chunk(upload_id: str, index: int, data: bytes) -> int:
    path = staging_dir(upload_id) / f"{index:05d}.part"
    path.write_bytes(data)
    return len(data)


def assemble(upload_id: str, chunks: int, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with dest.open("wb") as out:
        for index in range(chunks):
            part = staging_dir(upload_id) / f"{index:05d}.part"
            if not part.exists():
                raise FileNotFoundError(f"分片缺失: {index}")
            with part.open("rb") as src:
                shutil.copyfileobj(src, out)
            total += part.stat().st_size
    cleanup_staging(upload_id)
    return total


def cleanup_staging(upload_id: str) -> None:
    path = settings.staging_path / upload_id
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def remove_media_files(storage_key: str, media_id: str) -> None:
    try:
        safe_path(storage_key).unlink(missing_ok=True)
    except (ValueError, OSError):
        pass
    target = settings.derived_path / media_id
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def media_url(media_id: str, name: str) -> str:
    return f"/media/derived/{media_id}/{name}"
