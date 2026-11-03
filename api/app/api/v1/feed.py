"""首页聚合与全局搜索。"""

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.api.serializers import (
    album_card,
    family_brief,
    fetch_users,
    media_card,
    post_card,
    villager_card,
)
from app.api.utils import pack, with_cursor
from app.core.constants import MEDIA_READY, POST_PUBLISHED, ROLE_EDITOR, VIS_PUBLIC
from app.core.deps import DbSession, OptionalUser, can
from app.models.content import Album, Media, Post
from app.models.village import Family, TimelineEvent, Villager
from app.services import settings as site_settings
from app.services.stats import compute_stats

router = APIRouter(tags=["首页"])


async def _timeline(db) -> list[dict]:
    rows = (
        await db.execute(
            select(TimelineEvent)
            .order_by(func.coalesce(TimelineEvent.sort_year, 9999), TimelineEvent.sort_order, TimelineEvent.id)
            .limit(6)
        )
    ).scalars().all()
    return [
        {
            "id": e.id,
            "year_label": e.year_label,
            "sort_year": e.sort_year,
            "title": e.title,
            "description": e.description,
            "image_url": e.image_url,
            "category": e.category,
            "post_id": e.post_id,
        }
        for e in rows
    ]


@router.get("/home")
async def home(db: DbSession, viewer: OptionalUser):
    """一次请求凑齐首屏，减少手机端往返。"""
    stats = await compute_stats(db)

    album_rows = (
        await db.execute(
            select(Album)
            .where(Album.deleted_at.is_(None), Album.visibility == VIS_PUBLIC)
            .order_by(Album.sort_order, Album.id.desc())
            .limit(6)
        )
    ).scalars().all()
    albums = []
    for album in album_rows:
        samples = (
            await db.execute(
                select(Media)
                .where(Media.album_id == album.id, Media.status == MEDIA_READY, Media.deleted_at.is_(None))
                .order_by(Media.id.desc())
                .limit(3)
            )
        ).scalars().all()
        albums.append(album_card(album, list(samples)))

    post_stmt = select(Post).where(Post.deleted_at.is_(None), Post.status == POST_PUBLISHED)
    if viewer is None:
        post_stmt = post_stmt.where(Post.visibility == VIS_PUBLIC)
    posts = (
        await db.execute(
            post_stmt.order_by(Post.is_pinned.desc(), Post.is_featured.desc(), Post.id.desc()).limit(8)
        )
    ).scalars().all()
    authors = await fetch_users(db, [p.author_id for p in posts])

    media_rows = (
        await db.execute(
            select(Media)
            .where(Media.deleted_at.is_(None), Media.status == MEDIA_READY, Media.visibility == VIS_PUBLIC)
            .order_by(Media.id.desc())
            .limit(12)
        )
    ).scalars().all()
    uploaders = await fetch_users(db, [m.uploader_id for m in media_rows])

    villager_rows = (
        await db.execute(
            select(Villager)
            .where(Villager.deleted_at.is_(None), Villager.is_hidden == 0)
            .order_by(Villager.sort_order, Villager.id)
            .limit(8)
        )
    ).scalars().all()
    family_ids = {v.family_id for v in villager_rows if v.family_id}
    families = {}
    if family_ids:
        for family in (await db.execute(select(Family).where(Family.id.in_(family_ids)))).scalars():
            families[family.id] = family

    return {
        "data": {
            "config": await site_settings.get_public_config(db),
            "stats": stats,
            "albums": albums,
            "posts": [post_card(p, authors.get(p.author_id)) for p in posts],
            "media": [media_card(m, uploaders.get(m.uploader_id)) for m in media_rows],
            "villagers": [villager_card(v, families.get(v.family_id or "")) for v in villager_rows],
            "timeline": await _timeline(db),
        }
    }


@router.get("/search")
async def search(
    db: DbSession,
    viewer: OptionalUser,
    q: str = Query(min_length=1, max_length=60),
    limit: int = Query(default=8, ge=1, le=30),
):
    like = f"%{q.strip()}%"

    post_stmt = select(Post).where(
        Post.deleted_at.is_(None),
        Post.status == POST_PUBLISHED,
        or_(Post.title.like(like), Post.summary.like(like)),
    )
    if viewer is None:
        post_stmt = post_stmt.where(Post.visibility == VIS_PUBLIC)
    posts = (await db.execute(post_stmt.order_by(Post.id.desc()).limit(limit))).scalars().all()

    media_rows = (
        await db.execute(
            select(Media)
            .where(
                Media.deleted_at.is_(None),
                Media.status == MEDIA_READY,
                Media.visibility == VIS_PUBLIC,
                or_(Media.title.like(like), Media.caption.like(like), Media.era.like(like)),
            )
            .order_by(Media.id.desc())
            .limit(limit)
        )
    ).scalars().all()

    villager_stmt = select(Villager).where(
        Villager.deleted_at.is_(None),
        or_(Villager.name.like(like), Villager.alias.like(like), Villager.generation.like(like)),
    )
    if not can(viewer, ROLE_EDITOR):
        villager_stmt = villager_stmt.where(Villager.is_hidden == 0)
    villagers = (await db.execute(villager_stmt.order_by(Villager.id).limit(limit))).scalars().all()

    family_rows = (
        await db.execute(
            select(Family)
            .where(
                Family.deleted_at.is_(None),
                or_(Family.name.like(like), Family.householder.like(like), Family.door_no.like(like)),
            )
            .limit(limit)
        )
    ).scalars().all()

    authors = await fetch_users(db, [p.author_id for p in posts])
    uploaders = await fetch_users(db, [m.uploader_id for m in media_rows])

    return {
        "data": {
            "posts": [post_card(p, authors.get(p.author_id)) for p in posts],
            "media": [media_card(m, uploaders.get(m.uploader_id)) for m in media_rows],
            "villagers": [villager_card(v) for v in villagers],
            "families": [family_brief(f) for f in family_rows],
            "total": len(posts) + len(media_rows) + len(villagers) + len(family_rows),
        }
    }


@router.get("/photos/latest")
async def latest_media(
    db: DbSession,
    viewer: OptionalUser,
    kind: str | None = None,
    limit: int = Query(default=12, ge=1, le=48),
    before_id: str | None = None,
):
    stmt = select(Media).where(Media.deleted_at.is_(None), Media.status == MEDIA_READY)
    if viewer is None:
        stmt = stmt.where(Media.visibility == VIS_PUBLIC)
    if kind:
        stmt = stmt.where(Media.kind == kind)
    stmt = with_cursor(stmt, Media, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    uploaders = await fetch_users(db, [m.uploader_id for m in page])
    return {
        "data": [media_card(m, uploaders.get(m.uploader_id)) for m in page],
        "meta": meta,
    }
