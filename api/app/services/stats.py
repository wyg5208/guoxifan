"""站点统计：首页与后台共用。"""

from sqlalchemy import func, select

from app.api.serializers import dt, media_urls
from app.core.constants import MEDIA_READY, POST_PUBLISHED, ROLE_MEMBER, USER_ACTIVE
from app.models.content import Media, Post
from app.models.user import User
from app.models.village import Family, Villager


async def _count(db, model, *conditions) -> int:
    stmt = select(func.count()).select_from(model)
    for condition in conditions:
        stmt = stmt.where(condition)
    return int((await db.execute(stmt)).scalar() or 0)


async def compute_stats(db) -> dict:
    latest = (
        await db.execute(
            select(Media)
            .where(Media.status == MEDIA_READY, Media.visibility == "public", Media.deleted_at.is_(None))
            .order_by(Media.id.desc())
            .limit(6)
        )
    ).scalars().all()

    return {
        "media": await _count(db, Media, Media.status == MEDIA_READY),
        "images": await _count(db, Media, Media.status == MEDIA_READY, Media.kind == "image"),
        "videos": await _count(db, Media, Media.status == MEDIA_READY, Media.kind == "video"),
        "posts": await _count(db, Post, Post.status == POST_PUBLISHED),
        "villagers": await _count(db, Villager),
        "families": await _count(db, Family),
        "members": await _count(db, User, User.status == USER_ACTIVE, User.role == ROLE_MEMBER),
        "latest_media": [
            {
                "id": media.id,
                "kind": media.kind,
                "title": media.title,
                "caption": media.caption,
                "urls": media_urls(media),
                "width": media.width,
                "height": media.height,
                "created_at": dt(media.created_at),
            }
            for media in latest
        ],
    }
