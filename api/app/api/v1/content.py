import json

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from sqlalchemy import delete, or_, select

from app.api.serializers import (
    album_card,
    fetch_users,
    media_card,
    post_card,
)
from app.api.utils import get_or_404, pack, with_cursor
from app.core.constants import (
    MEDIA_READY,
    POST_DRAFT,
    POST_PUBLISHED,
    ROLE_EDITOR,
    VIS_MEMBER,
    VIS_PUBLIC,
)
from app.core.deps import AdminUser, CurrentUser, DbSession, OptionalUser, StaffUser, can
from app.core.errors import AppError, NotFoundError, PermissionError_
from app.db.base import utcnow
from app.models.content import Album, Favorite, Like, Media, Post, PostTag, Tag
from app.models.user import User
from app.schemas.content import (
    AlbumCreate,
    AlbumUpdate,
    MediaBatchRequest,
    MediaUpdate,
    PostCreate,
    PostUpdate,
)
from app.services import settings as site_settings
from app.services import storage
from app.services.moderation import review_text
from app.services.richtext import plain_text, render_content

router = APIRouter(tags=["内容"])


async def _flags(db: DbSession, viewer: User | None, target_type: str, ids: list[str]) -> tuple[set[str], set[str]]:
    if viewer is None or not ids:
        return set(), set()
    likes = (
        await db.execute(
            select(Like.target_id).where(
                Like.user_id == viewer.id, Like.target_type == target_type, Like.target_id.in_(ids)
            )
        )
    ).scalars().all()
    favorites = (
        await db.execute(
            select(Favorite.target_id).where(
                Favorite.user_id == viewer.id, Favorite.target_type == target_type, Favorite.target_id.in_(ids)
            )
        )
    ).scalars().all()
    return set(likes), set(favorites)


# ---------------------------------------------------------------- 文章 / 短文


@router.get("/posts")
async def list_posts(
    db: DbSession,
    viewer: OptionalUser,
    kind: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    author_id: str | None = None,
    status: str | None = None,
    limit: int = Query(default=12, ge=1, le=50),
    before_id: str | None = None,
):
    stmt = select(Post).where(Post.deleted_at.is_(None))
    if not can(viewer, ROLE_EDITOR):
        stmt = stmt.where(Post.status == POST_PUBLISHED)
        if viewer is None:
            stmt = stmt.where(Post.visibility == VIS_PUBLIC)
    elif status:
        stmt = stmt.where(Post.status == status)
    if kind:
        stmt = stmt.where(Post.kind == kind)
    if category:
        stmt = stmt.where(Post.category == category)
    if author_id:
        stmt = stmt.where(Post.author_id == author_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Post.title.like(like), Post.summary.like(like), Post.content.like(like)))
    if tag:
        tag_id = (await db.execute(select(Tag.id).where(Tag.name == tag))).scalar_one_or_none()
        if tag_id is None:
            return {"data": [], "meta": {"next_cursor": None, "has_more": False}}
        post_ids = (await db.execute(select(PostTag.post_id).where(PostTag.tag_id == tag_id))).scalars().all()
        stmt = stmt.where(Post.id.in_(post_ids))

    stmt = stmt.order_by(Post.is_pinned.desc(), Post.id.desc())
    if before_id:
        stmt = stmt.where(Post.id < before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)

    authors = await fetch_users(db, [p.author_id for p in page])
    liked, favorited = await _flags(db, viewer, "post", [p.id for p in page])

    return {
        "data": [
            post_card(p, authors.get(p.author_id), liked=p.id in liked, favorited=p.id in favorited)
            for p in page
        ],
        "meta": meta,
    }


@router.get("/posts/{post_id}")
async def get_post(post_id: str, db: DbSession, viewer: OptionalUser):
    post = await get_or_404(db, Post, post_id, "文章")
    if post.status != POST_PUBLISHED and not can(viewer, ROLE_EDITOR) and (viewer is None or post.author_id != viewer.id):
        raise NotFoundError("文章不存在")
    if post.visibility == VIS_MEMBER and viewer is None and not can(viewer, ROLE_EDITOR):
        raise PermissionError_("该内容仅村民可见")

    post.view_count += 1
    await db.commit()

    author = await db.get(User, post.author_id)
    liked, favorited = await _flags(db, viewer, "post", [post.id])
    data = post_card(post, author, liked=post.id in liked, favorited=post.id in favorited, with_content=True)

    tag_ids = (await db.execute(select(PostTag.tag_id).where(PostTag.post_id == post.id))).scalars().all()
    if tag_ids:
        data["tags"] = list((await db.execute(select(Tag.name).where(Tag.id.in_(tag_ids)))).scalars().all())
    else:
        data["tags"] = []
    return {"data": data}


async def _sync_tags(db: DbSession, post_id: str, tags: list[str]) -> None:
    await db.execute(delete(PostTag).where(PostTag.post_id == post_id))
    for name in {t.strip() for t in tags if t and t.strip()}:
        tag = (await db.execute(select(Tag).where(Tag.name == name))).scalar_one_or_none()
        if tag is None:
            tag = Tag(name=name, slug=name, use_count=0)
            db.add(tag)
            await db.flush()
        tag.use_count += 1
        db.add(PostTag(post_id=post_id, tag_id=tag.id))


@router.get("/posts/by-slug/tags")
async def list_tags(db: DbSession):
    rows = (await db.execute(select(Tag).order_by(Tag.use_count.desc()).limit(50))).scalars().all()
    return {"data": [{"id": t.id, "name": t.name, "use_count": t.use_count} for t in rows]}


@router.post("/posts", status_code=201)
async def create_post(payload: PostCreate, user: CurrentUser, db: DbSession):
    if user.status != "active":
        raise AppError("ACCOUNT_PENDING", "账号审核通过后才能发布", 403)

    body = payload.content
    html = render_content(body)
    text = payload.summary or plain_text(body, 160)
    status, message = await review_text(db, f"{payload.title or ''} {text}")
    if status == "blocked":
        raise AppError("CONTENT_BLOCKED", message or "内容不合规", 422)

    if payload.status == "draft":
        status = POST_DRAFT

    post = Post(
        kind=payload.kind,
        title=payload.title,
        summary=text,
        content=body if isinstance(body, str) else json.dumps(body, ensure_ascii=False),
        content_html=html,
        cover_url=payload.cover_url,
        images=json.dumps(payload.images, ensure_ascii=False),
        author_id=user.id,
        category=payload.category,
        status=status,
        visibility=payload.visibility,
        published_at=utcnow() if status == POST_PUBLISHED else None,
    )
    db.add(post)
    await db.flush()
    await _sync_tags(db, post.id, payload.tags)
    await db.commit()

    return {"data": {**post_card(post, user), "content_html": html, "message": message}}


@router.patch("/posts/{post_id}")
async def update_post(post_id: str, payload: PostUpdate, user: CurrentUser, db: DbSession):
    post = await get_or_404(db, Post, post_id, "文章")
    if post.author_id != user.id and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能编辑自己的文章")

    changes = payload.model_dump(exclude_unset=True)
    if "content" in changes and changes["content"] is not None:
        post.content_html = render_content(changes["content"])
        post.content = (
            changes["content"] if isinstance(changes["content"], str)
            else json.dumps(changes["content"], ensure_ascii=False)
        )
        changes.pop("content")
    if "images" in changes and changes["images"] is not None:
        post.images = json.dumps(changes["images"], ensure_ascii=False)
        changes.pop("images")
    if "tags" in changes and changes["tags"] is not None:
        await _sync_tags(db, post.id, changes.pop("tags"))
    for key in ("is_pinned", "is_featured"):
        if key in changes and changes[key] is not None:
            if not can(user, ROLE_EDITOR):
                changes.pop(key)
                continue
            changes[key] = 1 if changes[key] else 0
    if changes.get("status") == POST_PUBLISHED and post.published_at is None:
        post.published_at = utcnow()
    for key, value in changes.items():
        setattr(post, key, value)
    await db.commit()
    author = await db.get(User, post.author_id)
    return {"data": post_card(post, author, with_content=True)}


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: str, user: CurrentUser, db: DbSession):
    post = await get_or_404(db, Post, post_id, "文章")
    if post.author_id != user.id and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能删除自己的文章")
    post.deleted_at = utcnow()
    await db.commit()
    return None


@router.post("/posts/{post_id}/pin")
async def pin_post(post_id: str, user: AdminUser, db: DbSession):
    post = await get_or_404(db, Post, post_id, "文章")
    post.is_pinned = 0 if post.is_pinned else 1
    await db.commit()
    return {"data": {"is_pinned": bool(post.is_pinned)}}


@router.post("/posts/{post_id}/feature")
async def feature_post(post_id: str, user: StaffUser, db: DbSession):
    post = await get_or_404(db, Post, post_id, "文章")
    post.is_featured = 0 if post.is_featured else 1
    await db.commit()
    return {"data": {"is_featured": bool(post.is_featured)}}


# ---------------------------------------------------------------- 相册


@router.get("/albums")
async def list_albums(db: DbSession, viewer: OptionalUser):
    stmt = select(Album).where(Album.deleted_at.is_(None))
    if viewer is None:
        stmt = stmt.where(Album.visibility == VIS_PUBLIC)
    stmt = stmt.order_by(Album.sort_order, Album.id.desc())
    albums = (await db.execute(stmt)).scalars().all()

    result = []
    for album in albums:
        samples = (
            await db.execute(
                select(Media)
                .where(Media.album_id == album.id, Media.status == MEDIA_READY, Media.deleted_at.is_(None))
                .order_by(Media.id.desc())
                .limit(3)
            )
        ).scalars().all()
        result.append(album_card(album, list(samples)))
    return {"data": result, "meta": {"total": len(result)}}


@router.get("/albums/{album_id}")
async def get_album(album_id: str, db: DbSession, viewer: OptionalUser):
    album = await get_or_404(db, Album, album_id, "相册")
    if album.visibility == VIS_MEMBER and viewer is None:
        raise PermissionError_("该相册仅村民可见")
    data = album_card(album)
    media_rows = (
        await db.execute(
            select(Media)
            .where(Media.album_id == album.id, Media.deleted_at.is_(None), Media.status == MEDIA_READY)
            .order_by(Media.id.desc())
            .limit(30)
        )
    ).scalars().all()
    uploaders = await fetch_users(db, [m.uploader_id for m in media_rows])
    data["media"] = [media_card(m, uploaders.get(m.uploader_id), album) for m in media_rows]
    return {"data": data}


@router.get("/albums/{album_id}/media")
async def album_media(
    album_id: str,
    db: DbSession,
    viewer: OptionalUser,
    limit: int = Query(default=30, ge=1, le=60),
    before_id: str | None = None,
):
    await get_or_404(db, Album, album_id, "相册")
    stmt = select(Media).where(Media.album_id == album_id, Media.deleted_at.is_(None), Media.status == MEDIA_READY)
    stmt = with_cursor(stmt, Media, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    uploaders = await fetch_users(db, [m.uploader_id for m in page])
    return {
        "data": [media_card(m, uploaders.get(m.uploader_id)) for m in page],
        "meta": meta,
    }


@router.post("/albums", status_code=201)
async def create_album(payload: AlbumCreate, user: StaffUser, db: DbSession):
    album = Album(**payload.model_dump(), created_by=user.id)
    db.add(album)
    await db.commit()
    return {"data": album_card(album)}


@router.patch("/albums/{album_id}")
async def update_album(album_id: str, payload: AlbumUpdate, user: StaffUser, db: DbSession):
    album = await get_or_404(db, Album, album_id, "相册")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(album, key, value)
    await db.commit()
    return {"data": album_card(album)}


@router.delete("/albums/{album_id}", status_code=204)
async def delete_album(album_id: str, user: AdminUser, db: DbSession):
    album = await get_or_404(db, Album, album_id, "相册")
    album.deleted_at = utcnow()
    await db.commit()
    return None


# ---------------------------------------------------------------- 媒体


@router.get("/media")
async def list_media(
    db: DbSession,
    viewer: OptionalUser,
    kind: str | None = None,
    era: str | None = None,
    album_id: str | None = None,
    uploader_id: str | None = None,
    limit: int = Query(default=24, ge=1, le=60),
    before_id: str | None = None,
):
    stmt = select(Media).where(Media.deleted_at.is_(None))
    if can(viewer, ROLE_EDITOR):
        pass
    else:
        stmt = stmt.where(Media.status == MEDIA_READY)
        if viewer is None:
            stmt = stmt.where(Media.visibility == VIS_PUBLIC)
    if kind:
        stmt = stmt.where(Media.kind == kind)
    if era:
        stmt = stmt.where(Media.era == era)
    if album_id:
        stmt = stmt.where(Media.album_id == album_id)
    if uploader_id:
        stmt = stmt.where(Media.uploader_id == uploader_id)

    stmt = with_cursor(stmt, Media, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)

    uploaders = await fetch_users(db, [m.uploader_id for m in page])
    album_ids = {m.album_id for m in page if m.album_id}
    albums = {}
    if album_ids:
        for album in (await db.execute(select(Album).where(Album.id.in_(album_ids)))).scalars():
            albums[album.id] = album
    liked, favorited = await _flags(db, viewer, "media", [m.id for m in page])

    return {
        "data": [
            media_card(
                m,
                uploaders.get(m.uploader_id),
                albums.get(m.album_id or ""),
                liked=m.id in liked,
                favorited=m.id in favorited,
            )
            for m in page
        ],
        "meta": meta,
    }


@router.get("/media/{media_id}")
async def get_media(media_id: str, db: DbSession, viewer: OptionalUser):
    media = await get_or_404(db, Media, media_id, "照片")
    if media.visibility == VIS_MEMBER and viewer is None:
        raise PermissionError_("该照片仅村民可见")
    media.view_count += 1
    await db.commit()

    uploader = await db.get(User, media.uploader_id)
    album = await db.get(Album, media.album_id) if media.album_id else None
    liked, favorited = await _flags(db, viewer, "media", [media.id])
    return {"data": media_card(media, uploader, album, liked=media.id in liked, favorited=media.id in favorited)}


@router.get("/media/{media_id}/original")
async def download_original(media_id: str, db: DbSession, viewer: CurrentUser):
    media = await get_or_404(db, Media, media_id, "照片")
    feature = await site_settings.get_feature(db)
    if not feature.get("download_original") and not can(viewer, ROLE_EDITOR):
        raise PermissionError_("本站不允许下载原图")
    path = storage.safe_path(media.storage_key)
    if not path.exists():
        raise NotFoundError("原始文件不存在")
    return FileResponse(path, filename=path.name, media_type=media.mime)


@router.patch("/media/{media_id}")
async def update_media(media_id: str, payload: MediaUpdate, user: CurrentUser, db: DbSession):
    media = await get_or_404(db, Media, media_id, "照片")
    if media.uploader_id != user.id and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能编辑自己上传的照片")
    changes = payload.model_dump(exclude_unset=True)
    for key in ("tags", "villager_ids"):
        if key in changes and changes[key] is not None:
            changes[key] = json.dumps(changes.pop(key), ensure_ascii=False)
    for key, value in changes.items():
        setattr(media, key, value)
    await db.commit()
    uploader = await db.get(User, media.uploader_id)
    return {"data": media_card(media, uploader)}


@router.delete("/media/{media_id}", status_code=204)
async def delete_media(media_id: str, user: CurrentUser, db: DbSession):
    media = await get_or_404(db, Media, media_id, "照片")
    if media.uploader_id != user.id and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能删除自己上传的照片")
    media.deleted_at = utcnow()
    if media.album_id:
        album = await db.get(Album, media.album_id)
        if album and album.media_count > 0:
            album.media_count -= 1
    await db.commit()
    storage.remove_media_files(media.storage_key, media.id)
    return None


@router.post("/media/batch")
async def batch_media(payload: MediaBatchRequest, user: CurrentUser, db: DbSession):
    rows = (await db.execute(select(Media).where(Media.id.in_(payload.ids)))).scalars().all()
    touched = 0
    for media in rows:
        if media.uploader_id != user.id and not can(user, ROLE_EDITOR):
            continue
        touched += 1
        if payload.delete:
            media.deleted_at = utcnow()
        elif payload.album_id is not None:
            media.album_id = payload.album_id
    await db.commit()
    return {"data": {"touched": touched}}
