"""定时维护任务：计数校准与分片暂存清理（docs/06 §6.4）。

后台接口与 `python -m scripts.maintenance` 共用这里的实现，避免两套逻辑走偏。
调用方负责 commit。
"""

import json
import shutil
import time
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import utcnow
from app.models.chat import Attachment
from app.models.content import Comment, Favorite, Like, Media, Post


async def recount_counters(db: AsyncSession) -> int:
    """按实际互动记录重算点赞/收藏/评论数，返回被修正的条目数。"""
    likes = {
        (row[0], row[1]): int(row[2])
        for row in (
            await db.execute(
                select(Like.target_type, Like.target_id, func.count()).group_by(
                    Like.target_type, Like.target_id
                )
            )
        ).all()
    }
    favorites = {
        (row[0], row[1]): int(row[2])
        for row in (
            await db.execute(
                select(Favorite.target_type, Favorite.target_id, func.count()).group_by(
                    Favorite.target_type, Favorite.target_id
                )
            )
        ).all()
    }
    comments = {
        (row[0], row[1]): int(row[2])
        for row in (
            await db.execute(
                select(Comment.target_type, Comment.target_id, func.count())
                .where(
                    Comment.deleted_at.is_(None),
                    Comment.status == "published",
                    Comment.parent_id.is_(None),
                )
                .group_by(Comment.target_type, Comment.target_id)
            )
        ).all()
    }

    fixed = 0
    for post in (await db.execute(select(Post))).scalars():
        before = (post.like_count, post.favorite_count, post.comment_count)
        post.like_count = likes.get(("post", post.id), 0)
        post.favorite_count = favorites.get(("post", post.id), 0)
        post.comment_count = comments.get(("post", post.id), 0)
        if before != (post.like_count, post.favorite_count, post.comment_count):
            fixed += 1
    for media in (await db.execute(select(Media))).scalars():
        before = (media.like_count, media.favorite_count, media.comment_count)
        media.like_count = likes.get(("media", media.id), 0)
        media.favorite_count = favorites.get(("media", media.id), 0)
        media.comment_count = comments.get(("media", media.id), 0)
        if before != (media.like_count, media.favorite_count, media.comment_count):
            fixed += 1
    return fixed


def purge_staging(older_than_days: int = 2, dry_run: bool = False) -> int:
    """删除超时未完成的分片上传目录，返回命中数量（dry_run 时只数不删）。"""
    removed = 0
    staging = settings.staging_path
    if not staging.exists():
        return removed
    cutoff = utcnow() - timedelta(days=older_than_days)
    for child in staging.iterdir():
        if not child.is_dir():
            continue
        meta_path = child / "meta.json"
        try:
            created = json.loads(meta_path.read_text(encoding="utf-8")).get("created_at")
            if created and created >= cutoff.isoformat():
                continue
        except (OSError, ValueError):
            pass
        removed += 1
        if not dry_run:
            shutil.rmtree(child, ignore_errors=True)
    return removed


async def purge_orphan_derived(db: AsyncSession, dry_run: bool = False) -> int:
    """删掉数据库里已不存在的派生图目录（改名/误删留下的残渣）。"""
    known = {row[0] for row in (await db.execute(select(Media.id))).all()}
    # 聊天附件的派生图目录名带 att- 前缀，别误删
    known |= {f"att-{row[0]}" for row in (await db.execute(select(Attachment.id))).all()}
    derived: Path = settings.derived_path
    if not derived.exists():
        return 0
    removed = 0
    for child in derived.iterdir():
        if not child.is_dir() or child.name in known:
            continue
        removed += 1
        if not dry_run:
            shutil.rmtree(child, ignore_errors=True)
    return removed


async def purge_orphan_originals(
    db: AsyncSession, older_than_days: int = 7, dry_run: bool = False
) -> int:
    """删掉数据库里没有记录的原始文件。

    只动「旧于 older_than_days」的文件：上传时文件先落盘再写库，
    留出安全窗口，免得把正在上传的东西误删。
    """
    known = {row[0] for row in (await db.execute(select(Media.storage_key))).all()}
    known |= {row[0] for row in (await db.execute(select(Attachment.storage_key))).all()}
    root = settings.media_path
    # 用 epoch 秒比较：utcnow() 是 naive UTC，直接 .timestamp() 会按本地时区算，差出 8 小时
    cutoff = time.time() - older_than_days * 86400
    removed = 0
    for folder in ("uploads", "videos", "attachments"):
        base = root / folder
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            try:
                key = path.relative_to(root).as_posix()
                if key in known or path.stat().st_mtime >= cutoff:
                    continue
            except OSError:
                continue
            removed += 1
            if not dry_run:
                path.unlink(missing_ok=True)
    return removed
