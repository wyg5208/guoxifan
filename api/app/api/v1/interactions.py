"""互动：评论（两级）、点赞、收藏、举报。"""

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.serializers import comment_card, dt, fetch_users, media_card, post_card
from app.api.utils import get_or_404, pack, with_cursor
from app.core.constants import (
    NOTIFY_COMMENT,
    NOTIFY_LIKE,
    NOTIFY_REPLY,
    ROLE_EDITOR,
    TARGET_COMMENT,
    TARGET_MEDIA,
    TARGET_POST,
    VIS_MEMBER,
)
from app.core.deps import ActiveUser, CurrentUser, DbSession, OptionalUser, can
from app.core.errors import AppError, NotFoundError, PermissionError_
from app.db.base import new_id, utcnow
from app.models.content import Comment, Favorite, Like, Media, Post
from app.models.system import Report
from app.models.user import User
from app.schemas.content import CommentCreate, ReportCreate, ToggleRequest
from app.services import settings as site_settings
from app.services.moderation import review_text
from app.services.notify import notify, notify_admins

router = APIRouter(prefix="/interactions", tags=["互动"])

TARGET_MODELS = {TARGET_POST: Post, TARGET_MEDIA: Media, TARGET_COMMENT: Comment}


def _link_of(target) -> str:
    """通知里的站内跳转地址，必须和前端路由对得上（/p/:id、/albums/:id）。"""
    if isinstance(target, Post):
        return f"/p/{target.id}"
    if isinstance(target, Media):
        album_id = getattr(target, "album_id", None)
        return f"/albums/{album_id}" if album_id else "/albums"
    return "/"


def _author_of(target) -> str | None:
    if isinstance(target, Post):
        return target.author_id
    if isinstance(target, Media):
        return target.uploader_id
    if isinstance(target, Comment):
        return target.user_id
    return None


async def _load_target(db, target_type: str, target_id: str, viewer: User | None):
    model = TARGET_MODELS.get(target_type)
    if model is None:
        raise AppError("VALIDATION_ERROR", "不支持的互动对象", 400)
    target = await db.get(model, target_id)
    if target is None or getattr(target, "deleted_at", None) is not None:
        raise NotFoundError("内容不存在")
    if isinstance(target, Comment) and target.status != "published":
        raise NotFoundError("评论不存在")
    if getattr(target, "visibility", None) == VIS_MEMBER and viewer is None:
        raise PermissionError_("该内容仅村民可见")
    if isinstance(target, Post) and target.status != "published" and not can(viewer, ROLE_EDITOR):
        raise NotFoundError("内容不存在")
    return target


# ---------------------------------------------------------------- 评论


@router.get("/comments")
async def list_comments(
    db: DbSession,
    viewer: OptionalUser,
    target_type: str,
    target_id: str,
    limit: int = Query(default=20, ge=1, le=50),
    before_id: str | None = None,
):
    await _load_target(db, target_type, target_id, viewer)

    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Comment)
                .where(
                    Comment.target_type == target_type,
                    Comment.target_id == target_id,
                    Comment.status == "published",
                    Comment.deleted_at.is_(None),
                )
            )
        ).scalar()
        or 0
    )

    stmt = select(Comment).where(
        Comment.target_type == target_type,
        Comment.target_id == target_id,
        Comment.parent_id.is_(None),
        Comment.status == "published",
        Comment.deleted_at.is_(None),
    )
    stmt = with_cursor(stmt, Comment, before_id)
    roots = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(roots, limit)

    replies: dict[str, list[Comment]] = {}
    if page:
        rows = (
            await db.execute(
                select(Comment)
                .where(
                    Comment.root_id.in_([c.id for c in page]),
                    Comment.status == "published",
                    Comment.deleted_at.is_(None),
                )
                .order_by(Comment.id.asc())
            )
        ).scalars().all()
        for row in rows:
            bucket = replies.setdefault(row.root_id or "", [])
            if len(bucket) < 3:
                bucket.append(row)

    authors = await fetch_users(
        db,
        [c.user_id for c in page] + [r.user_id for bucket in replies.values() for r in bucket],
    )
    return {
        "data": [
            comment_card(
                c,
                authors.get(c.user_id),
                [comment_card(r, authors.get(r.user_id)) for r in replies.get(c.id, [])],
            )
            for c in page
        ],
        "meta": {**meta, "total": total},
    }


@router.get("/comments/{comment_id}/replies")
async def list_replies(
    comment_id: str,
    db: DbSession,
    viewer: OptionalUser,
    limit: int = Query(default=20, ge=1, le=50),
    before_id: str | None = None,
):
    root = await get_or_404(db, Comment, comment_id, "评论")
    stmt = select(Comment).where(
        Comment.root_id == root.id,
        Comment.status == "published",
        Comment.deleted_at.is_(None),
    )
    stmt = with_cursor(stmt, Comment, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    authors = await fetch_users(db, [c.user_id for c in page])
    return {"data": [comment_card(c, authors.get(c.user_id)) for c in page], "meta": meta}


@router.post("/comments", status_code=201)
async def create_comment(payload: CommentCreate, user: ActiveUser, db: DbSession):
    feature = await site_settings.get_feature(db)
    if not feature.get("comment_enabled", True):
        raise AppError("COMMENT_DISABLED", "评论功能暂未开放", 403)

    target = await _load_target(db, payload.target_type, payload.target_id, user)

    parent = None
    if payload.parent_id:
        parent = await get_or_404(db, Comment, payload.parent_id, "评论")
        if parent.target_type != payload.target_type or parent.target_id != payload.target_id:
            raise AppError("VALIDATION_ERROR", "回复的评论不属于该内容", 400)

    status, message = await review_text(db, payload.content)
    if status == "blocked":
        raise AppError("CONTENT_BLOCKED", message or "内容不合规", 422)

    comment = Comment(
        target_type=payload.target_type,
        target_id=payload.target_id,
        parent_id=parent.id if parent else None,
        root_id=(parent.root_id or parent.id) if parent else None,
        user_id=user.id,
        content=payload.content,
        status="published" if status == "published" else "pending",
        created_at=utcnow(),
    )
    db.add(comment)
    await db.flush()

    if comment.status == "published":
        if payload.target_type in {TARGET_POST, TARGET_MEDIA}:
            target.comment_count += 1
        if parent is not None:
            parent.reply_count += 1

    link = _link_of(target)
    if parent is not None:
        await notify(
            db,
            parent.user_id,
            type=NOTIFY_REPLY,
            title=f"{user.nickname} 回复了你的评论",
            body=payload.content[:120],
            link=link,
            actor_id=user.id,
            target_type=payload.target_type,
            target_id=payload.target_id,
        )
    else:
        author_id = _author_of(target)
        if author_id:
            await notify(
                db,
                author_id,
                type=NOTIFY_COMMENT,
                title=f"{user.nickname} 评论了你的内容",
                body=payload.content[:120],
                link=link,
                actor_id=user.id,
                target_type=payload.target_type,
                target_id=payload.target_id,
            )

    await db.commit()
    return {"data": {**comment_card(comment, user), "message": message}}


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(comment_id: str, user: CurrentUser, db: DbSession):
    comment = await get_or_404(db, Comment, comment_id, "评论")
    if comment.user_id != user.id and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能删除自己的评论")

    comment.deleted_at = utcnow()
    if comment.status == "published":
        if comment.parent_id is None:
            target = TARGET_MODELS.get(comment.target_type)
            if target is not None:
                obj = await db.get(target, comment.target_id)
                if obj is not None and hasattr(obj, "comment_count"):
                    obj.comment_count = max(0, obj.comment_count - 1)
        else:
            parent = await db.get(Comment, comment.parent_id)
            if parent is not None:
                parent.reply_count = max(0, parent.reply_count - 1)
    await db.commit()
    return None


# ---------------------------------------------------------------- 点赞 / 收藏


async def _find_mark(db, model, target_type: str, target_id: str, user_id: str):
    """找出已存在的点赞/收藏记录（模型结构一致，按三元组唯一）。"""
    return (
        await db.execute(
            select(model).where(
                model.target_type == target_type,
                model.target_id == target_id,
                model.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


@router.post("/likes")
async def toggle_like(payload: ToggleRequest, user: ActiveUser, db: DbSession):
    target = await _load_target(db, payload.target_type, payload.target_id, user)

    existing = await _find_mark(db, Like, payload.target_type, payload.target_id, user.id)
    if existing is not None:
        await db.delete(existing)
        target.like_count = max(0, target.like_count - 1)
        active = False
    else:
        db.add(
            Like(
                id=new_id(),
                target_type=payload.target_type,
                target_id=payload.target_id,
                user_id=user.id,
                created_at=utcnow(),
            )
        )
        target.like_count += 1
        active = True
        author_id = _author_of(target)
        if author_id:
            await notify(
                db,
                author_id,
                type=NOTIFY_LIKE,
                title=f"{user.nickname} 赞了你",
                link=_link_of(target),
                actor_id=user.id,
                target_type=payload.target_type,
                target_id=payload.target_id,
            )

    await db.commit()
    return {"data": {"active": active, "like_count": target.like_count}}


@router.post("/favorites")
async def toggle_favorite(payload: ToggleRequest, user: ActiveUser, db: DbSession):
    target = await _load_target(db, payload.target_type, payload.target_id, user)

    existing = await _find_mark(db, Favorite, payload.target_type, payload.target_id, user.id)
    if existing is not None:
        await db.delete(existing)
        target.favorite_count = max(0, target.favorite_count - 1)
        active = False
    else:
        db.add(
            Favorite(
                id=new_id(),
                target_type=payload.target_type,
                target_id=payload.target_id,
                user_id=user.id,
                created_at=utcnow(),
            )
        )
        target.favorite_count += 1
        active = True

    await db.commit()
    return {"data": {"active": active, "favorite_count": target.favorite_count}}


@router.get("/favorites")
async def list_favorites(
    db: DbSession,
    user: CurrentUser,
    target_type: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    before_id: str | None = None,
):
    stmt = select(Favorite).where(Favorite.user_id == user.id)
    if target_type:
        stmt = stmt.where(Favorite.target_type == target_type)
    stmt = with_cursor(stmt, Favorite, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)

    post_ids = [f.target_id for f in page if f.target_type == TARGET_POST]
    media_ids = [f.target_id for f in page if f.target_type == TARGET_MEDIA]
    posts = {}
    medias = {}
    if post_ids:
        for post in (await db.execute(select(Post).where(Post.id.in_(post_ids)))).scalars():
            posts[post.id] = post
    if media_ids:
        for media in (await db.execute(select(Media).where(Media.id.in_(media_ids)))).scalars():
            medias[media.id] = media
    authors = await fetch_users(
        db,
        [p.author_id for p in posts.values()] + [m.uploader_id for m in medias.values()],
    )

    items = []
    for favorite in page:
        if favorite.target_type == TARGET_POST and favorite.target_id in posts:
            post = posts[favorite.target_id]
            items.append(
                {
                    "target_type": TARGET_POST,
                    "created_at": dt(favorite.created_at),
                    "post": post_card(post, authors.get(post.author_id), favorited=True),
                }
            )
        elif favorite.target_type == TARGET_MEDIA and favorite.target_id in medias:
            media = medias[favorite.target_id]
            items.append(
                {
                    "target_type": TARGET_MEDIA,
                    "created_at": dt(favorite.created_at),
                    "media": media_card(media, authors.get(media.uploader_id), favorited=True),
                }
            )

    return {"data": items, "meta": {**meta, "total": len(items)}}


# ---------------------------------------------------------------- 举报


@router.post("/reports", status_code=201)
async def create_report(payload: ReportCreate, user: ActiveUser, db: DbSession):
    report = Report(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        detail=payload.detail,
        status="open",
        created_at=utcnow(),
    )
    db.add(report)
    await notify_admins(
        db,
        type="review",
        title="收到一条举报",
        body=f"{payload.target_type}: {payload.reason}",
        link="/admin/reports",
        actor_id=user.id,
    )
    await db.commit()
    return {"data": {"id": report.id, "status": report.status}}
