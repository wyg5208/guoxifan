"""管理后台：站点配置、用户审核、邀请码、内容审核、举报、敏感词、审计日志。"""

import json
import secrets
import shutil
import string
from datetime import timedelta

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, or_, select

from app.api.serializers import (
    comment_card,
    dt,
    fetch_users,
    post_card,
    user_brief,
)
from app.api.utils import get_or_404, pack, with_cursor
from app.core.constants import (
    POST_PENDING,
    POST_PUBLISHED,
    ROLE_ADMIN,
    ROLE_SUPER_ADMIN,
    USER_ACTIVE,
    USER_DISABLED,
    USER_PENDING,
)
from app.core.config import settings
from app.core.deps import AdminUser, DbSession, StaffUser, SuperAdminUser
from app.core.errors import AppError, NotFoundError, PermissionError_
from app.core.security import hash_password
from app.db.base import utcnow
from app.models.chat import Attachment
from app.models.content import Comment, Media, Post
from app.models.system import AuditLog, Report, SensitiveWord, SiteSetting
from app.models.user import InviteCode, RefreshToken, User
from app.schemas.admin import (
    BatchIdsRequest,
    InviteCreateRequest,
    ReportResolveRequest,
    ResetPasswordRequest,
    ReviewRequest,
    SensitiveWordCreate,
    SettingsPatch,
    UserApproveRequest,
    UserRejectRequest,
    UserRoleRequest,
    UserStatusRequest,
)
from app.services import maintenance
from app.services import settings as site_settings
from app.services.moderation import invalidate_cache
from app.services.notify import notify
from app.services.stats import compute_stats

router = APIRouter(prefix="/admin", tags=["后台"])

CODE_ALPHABET = string.ascii_uppercase + string.digits


# ---------------------------------------------------------------- 基础工具


async def _audit(
    db,
    actor: User,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    detail=None,
    request: Request | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=json.dumps(detail, ensure_ascii=False) if isinstance(detail, (dict, list)) else detail,
            ip=(request.client.host if request and request.client else None),
            user_agent=(request.headers.get("user-agent") or "")[:300] or None,
            created_at=utcnow(),
        )
    )


async def _user_or_404(db, user_id: str) -> User:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("用户不存在")
    return user


def _user_admin_card(user: User) -> dict:
    return {
        **user_brief(user),
        "email": user.email,
        "phone": user.phone,
        "bio": user.bio,
        "status": user.status,
        "villager_id": user.villager_id,
        "last_login_at": dt(user.last_login_at),
        "created_at": dt(user.created_at),
    }


# ---------------------------------------------------------------- 概览


@router.get("/dashboard")
async def dashboard(db: DbSession, user: StaffUser):
    stats = await compute_stats(db)
    stats.update(
        {
            "users": int((await db.execute(select(func.count()).select_from(User))).scalar() or 0),
            "users_pending": int(
                (
                    await db.execute(
                        select(func.count()).select_from(User).where(User.status == USER_PENDING)
                    )
                ).scalar()
                or 0
            ),
            "users_active": int(
                (
                    await db.execute(
                        select(func.count()).select_from(User).where(User.status == USER_ACTIVE)
                    )
                ).scalar()
                or 0
            ),
            "posts_pending": int(
                (
                    await db.execute(
                        select(func.count()).select_from(Post).where(Post.status == POST_PENDING)
                    )
                ).scalar()
                or 0
            ),
            "comments_pending": int(
                (
                    await db.execute(
                        select(func.count()).select_from(Comment).where(Comment.status == "pending")
                    )
                ).scalar()
                or 0
            ),
            "reports_open": int(
                (
                    await db.execute(
                        select(func.count()).select_from(Report).where(Report.status == "open")
                    )
                ).scalar()
                or 0
            ),
        }
    )
    return {"data": stats}


@router.get("/storage")
async def storage_usage(db: DbSession, user: AdminUser):
    media_bytes = int(
        (await db.execute(select(func.coalesce(func.sum(Media.size_bytes), 0)))).scalar() or 0
    )
    attachment_bytes = int(
        (await db.execute(select(func.coalesce(func.sum(Attachment.size_bytes), 0)))).scalar() or 0
    )
    usage = shutil.disk_usage(settings.media_path)
    return {
        "data": {
            "media_bytes": media_bytes,
            "attachment_bytes": attachment_bytes,
            "total_bytes": media_bytes + attachment_bytes,
            "disk_total": usage.total,
            "disk_free": usage.free,
            "media_root": str(settings.media_path),
        }
    }


# ---------------------------------------------------------------- 站点配置


@router.get("/settings")
async def list_settings(db: DbSession, user: StaffUser):
    rows = {row.key: row for row in await site_settings.load_all(db)}
    data = []
    for item in site_settings.DEFAULTS:
        key = item["key"]
        row = rows.get(key)
        data.append(
            {
                "key": key,
                "value": site_settings.decode(row) if row is not None else item["value"],
                "type": item["type"],
                "group": item["group"],
                "label": item["label"],
                "description": row.description if row else None,
                "is_public": item["public"],
            }
        )
    known = {item["key"] for item in site_settings.DEFAULTS}
    for key, row in rows.items():
        if key in known:
            continue
        data.append(
            {
                "key": key,
                "value": site_settings.decode(row),
                "type": row.value_type,
                "group": row.group_name,
                "label": row.label or key,
                "description": row.description,
                "is_public": bool(row.is_public),
            }
        )
    group_order = {"site": 0, "feature": 1, "moderation": 2, "contact": 3}
    data.sort(key=lambda item: (group_order.get(item["group"], 9), item["key"]))
    return {"data": data, "meta": {"total": len(data)}}


@router.patch("/settings")
async def update_settings(payload: SettingsPatch, request: Request, db: DbSession, user: AdminUser):
    rows = {row.key: row for row in await site_settings.load_all(db)}
    changed = []
    for item in payload.items:
        default = site_settings.DEFAULTS_BY_KEY.get(item.key)
        value_type = default["type"] if default else _infer_type(item.value)
        encoded = site_settings.encode(item.value, value_type)
        row = rows.get(item.key)
        if row is None:
            row = SiteSetting(
                key=item.key,
                value=encoded,
                value_type=value_type,
                group_name=(default or {}).get("group", item.key.split(".")[0]),
                label=(default or {}).get("label", item.key),
                is_public=1 if (default or {}).get("public", True) else 0,
                updated_by=user.id,
                updated_at=utcnow(),
            )
            db.add(row)
        else:
            row.value = encoded
            row.updated_by = user.id
            row.updated_at = utcnow()
        changed.append(item.key)

    await _audit(db, user, "settings.update", detail={"keys": changed}, request=request)
    await db.commit()
    return {"data": {"updated": changed}}


def _infer_type(value) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, (list, dict)):
        return "json"
    return "string"


# ---------------------------------------------------------------- 用户


@router.get("/users")
async def list_users(
    db: DbSession,
    user: StaffUser,
    status: str | None = None,
    role: str | None = None,
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    before_id: str | None = None,
):
    stmt = select(User).where(User.deleted_at.is_(None))
    if status:
        stmt = stmt.where(User.status == status)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.nickname.like(like), User.email.like(like), User.phone.like(like)))

    pending = int(
        (await db.execute(select(func.count()).select_from(User).where(User.status == USER_PENDING))).scalar()
        or 0
    )
    stmt = with_cursor(stmt, User, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    return {
        "data": [_user_admin_card(u) for u in page],
        "meta": {**meta, "pending_total": pending},
    }


@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    payload: UserApproveRequest,
    request: Request,
    db: DbSession,
    user: AdminUser,
):
    target = await _user_or_404(db, user_id)
    if target.role == ROLE_SUPER_ADMIN and user.role != ROLE_SUPER_ADMIN:
        raise PermissionError_("不能操作超级管理员")
    target.status = USER_ACTIVE
    if payload.role:
        if payload.role == ROLE_ADMIN and user.role != ROLE_SUPER_ADMIN:
            raise PermissionError_("只有超级管理员可以设置管理员")
        target.role = payload.role

    await notify(
        db,
        target.id,
        type="system",
        title="账号审核通过",
        body="现在可以发照片、写文章、进聊天室了。",
        link="/me",
    )
    await _audit(db, user, "user.approve", target_type="user", target_id=target.id, request=request)
    await db.commit()
    return {"data": _user_admin_card(target)}


@router.post("/users/batch-approve")
async def batch_approve(payload: BatchIdsRequest, request: Request, db: DbSession, user: AdminUser):
    rows = (
        await db.execute(
            select(User).where(
                User.id.in_(payload.ids),
                User.status == USER_PENDING,
                User.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    for target in rows:
        target.status = USER_ACTIVE
        await notify(
            db,
            target.id,
            type="system",
            title="账号审核通过",
            body="现在可以发照片、写文章、进聊天室了。",
            link="/me",
        )
    await _audit(
        db, user, "user.batch_approve", detail={"ids": [t.id for t in rows]}, request=request
    )
    await db.commit()
    return {"data": {"approved": len(rows)}}


@router.post("/users/{user_id}/reject")
async def reject_user(
    user_id: str,
    payload: UserRejectRequest,
    request: Request,
    db: DbSession,
    user: AdminUser,
):
    target = await _user_or_404(db, user_id)
    if target.role == ROLE_SUPER_ADMIN:
        raise PermissionError_("不能操作超级管理员")
    target.status = USER_DISABLED
    await db.execute(
        RefreshToken.__table__.update().where(RefreshToken.user_id == target.id).values(revoked_at=utcnow())
    )
    await notify(
        db,
        target.id,
        type="system",
        title="注册申请未通过",
        body=payload.reason or "请联系管理员了解详情。",
    )
    await _audit(
        db,
        user,
        "user.reject",
        target_type="user",
        target_id=target.id,
        detail={"reason": payload.reason},
        request=request,
    )
    await db.commit()
    return {"data": _user_admin_card(target)}


@router.post("/users/{user_id}/role")
async def set_role(
    user_id: str,
    payload: UserRoleRequest,
    request: Request,
    db: DbSession,
    user: SuperAdminUser,
):
    target = await _user_or_404(db, user_id)
    if target.id == user.id:
        raise AppError("VALIDATION_ERROR", "不能修改自己的角色", 400)
    target.role = payload.role
    await _audit(
        db,
        user,
        "user.role",
        target_type="user",
        target_id=target.id,
        detail={"role": payload.role},
        request=request,
    )
    await db.commit()
    return {"data": _user_admin_card(target)}


@router.post("/users/{user_id}/status")
async def set_status(
    user_id: str,
    payload: UserStatusRequest,
    request: Request,
    db: DbSession,
    user: AdminUser,
):
    target = await _user_or_404(db, user_id)
    if target.id == user.id:
        raise AppError("VALIDATION_ERROR", "不能修改自己的状态", 400)
    if target.role == ROLE_SUPER_ADMIN and user.role != ROLE_SUPER_ADMIN:
        raise PermissionError_("不能操作超级管理员")
    target.status = payload.status
    if payload.status != USER_ACTIVE:
        await db.execute(
            RefreshToken.__table__.update()
            .where(RefreshToken.user_id == target.id)
            .values(revoked_at=utcnow())
        )
    await _audit(
        db,
        user,
        "user.status",
        target_type="user",
        target_id=target.id,
        detail={"status": payload.status},
        request=request,
    )
    await db.commit()
    return {"data": _user_admin_card(target)}


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    request: Request,
    db: DbSession,
    user: AdminUser,
):
    target = await _user_or_404(db, user_id)
    if target.role == ROLE_SUPER_ADMIN and user.role != ROLE_SUPER_ADMIN:
        raise PermissionError_("不能操作超级管理员")
    password = payload.new_password or "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    target.password_hash = hash_password(password)
    target.login_fail_count = 0
    target.locked_until = None
    await db.execute(
        RefreshToken.__table__.update().where(RefreshToken.user_id == target.id).values(revoked_at=utcnow())
    )
    await _audit(db, user, "user.reset_password", target_type="user", target_id=target.id, request=request)
    await db.commit()
    return {"data": {"user_id": target.id, "password": password}}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, request: Request, db: DbSession, user: SuperAdminUser):
    target = await _user_or_404(db, user_id)
    if target.id == user.id:
        raise AppError("VALIDATION_ERROR", "不能删除自己", 400)
    target.deleted_at = utcnow()
    target.status = USER_DISABLED
    await db.execute(
        RefreshToken.__table__.update().where(RefreshToken.user_id == target.id).values(revoked_at=utcnow())
    )
    await _audit(db, user, "user.delete", target_type="user", target_id=target.id, request=request)
    await db.commit()
    return None


# ---------------------------------------------------------------- 邀请码


def _invite_card(invite: InviteCode) -> dict:
    now = utcnow()
    expired = invite.expires_at is not None and invite.expires_at < now
    return {
        "id": invite.id,
        "code": invite.code,
        "max_uses": invite.max_uses,
        "used_count": invite.used_count,
        "auto_approve": bool(invite.auto_approve),
        "note": invite.note,
        "expires_at": dt(invite.expires_at),
        "disabled_at": dt(invite.disabled_at),
        "created_at": dt(invite.created_at),
        "status": "disabled"
        if invite.disabled_at
        else "expired"
        if expired
        else "used"
        if invite.used_count >= invite.max_uses
        else "active",
    }


@router.get("/invites")
async def list_invites(db: DbSession, user: AdminUser):
    rows = (await db.execute(select(InviteCode).order_by(InviteCode.id.desc()).limit(200))).scalars().all()
    return {"data": [_invite_card(i) for i in rows], "meta": {"total": len(rows)}}


@router.post("/invites", status_code=201)
async def create_invite(payload: InviteCreateRequest, request: Request, db: DbSession, user: AdminUser):
    code = (payload.code or "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))).upper()
    exists = (await db.execute(select(InviteCode.id).where(InviteCode.code == code))).scalar_one_or_none()
    if exists:
        raise AppError("ALREADY_EXISTS", "邀请码已存在", 409)
    invite = InviteCode(
        code=code,
        created_by=user.id,
        max_uses=payload.max_uses,
        used_count=0,
        auto_approve=1 if payload.auto_approve else 0,
        note=payload.note,
        expires_at=(utcnow() + timedelta(days=payload.expires_in_days)) if payload.expires_in_days else None,
        created_at=utcnow(),
    )
    db.add(invite)
    await _audit(db, user, "invite.create", detail={"code": code}, request=request)
    await db.commit()
    return {"data": _invite_card(invite)}


@router.post("/invites/{invite_id}/disable")
async def disable_invite(invite_id: str, db: DbSession, user: AdminUser):
    invite = await get_or_404(db, InviteCode, invite_id, "邀请码")
    invite.disabled_at = utcnow()
    await db.commit()
    return {"data": _invite_card(invite)}


@router.delete("/invites/{invite_id}", status_code=204)
async def delete_invite(invite_id: str, db: DbSession, user: AdminUser):
    invite = await get_or_404(db, InviteCode, invite_id, "邀请码")
    await db.delete(invite)
    await db.commit()
    return None


# ---------------------------------------------------------------- 内容审核


@router.get("/moderation/pending")
async def pending_content(db: DbSession, user: StaffUser):
    posts = (
        await db.execute(
            select(Post)
            .where(Post.status == POST_PENDING, Post.deleted_at.is_(None))
            .order_by(Post.id.desc())
            .limit(50)
        )
    ).scalars().all()
    comments = (
        await db.execute(
            select(Comment)
            .where(Comment.status == "pending", Comment.deleted_at.is_(None))
            .order_by(Comment.id.desc())
            .limit(50)
        )
    ).scalars().all()

    post_authors = await fetch_users(db, [p.author_id for p in posts])
    comment_authors = await fetch_users(db, [c.user_id for c in comments])
    return {
        "data": {
            "posts": [post_card(p, post_authors.get(p.author_id), with_content=True) for p in posts],
            "comments": [comment_card(c, comment_authors.get(c.user_id)) for c in comments],
        },
        "meta": {"posts": len(posts), "comments": len(comments)},
    }


@router.post("/posts/{post_id}/review")
async def review_post(
    post_id: str,
    payload: ReviewRequest,
    request: Request,
    db: DbSession,
    user: StaffUser,
):
    post = await get_or_404(db, Post, post_id, "文章")
    if payload.action == "approve":
        post.status = POST_PUBLISHED
        post.published_at = post.published_at or utcnow()
        await notify(
            db,
            post.author_id,
            type="system",
            title="你的内容已通过审核",
            body=(post.title or post.summary or "")[:120],
            link=f"/p/{post.id}",
        )
    else:
        post.status = "draft"
        await notify(
            db,
            post.author_id,
            type="system",
            title="你的内容未通过审核",
            body=payload.note or "可以修改后重新提交。",
            link=f"/p/{post.id}",
        )
    await _audit(
        db,
        user,
        f"post.{payload.action}",
        target_type="post",
        target_id=post.id,
        detail={"note": payload.note},
        request=request,
    )
    await db.commit()
    return {"data": {"id": post.id, "status": post.status}}


@router.post("/comments/{comment_id}/review")
async def review_comment(
    comment_id: str,
    payload: ReviewRequest,
    request: Request,
    db: DbSession,
    user: StaffUser,
):
    comment = await get_or_404(db, Comment, comment_id, "评论")
    if payload.action == "approve":
        comment.status = "published"
        target_model = Post if comment.target_type == "post" else Media
        target = await db.get(target_model, comment.target_id)
        if target is not None and hasattr(target, "comment_count"):
            target.comment_count += 1
        if comment.parent_id:
            parent = await db.get(Comment, comment.parent_id)
            if parent is not None:
                parent.reply_count += 1
        await notify(
            db,
            comment.user_id,
            type="system",
            title="你的评论已通过审核",
            body=comment.content[:120],
            link="/",
        )
    else:
        comment.status = "rejected"
        await notify(
            db,
            comment.user_id,
            type="system",
            title="你的评论未通过审核",
            body=payload.note or "内容不符合本站规范。",
        )
    await _audit(
        db,
        user,
        f"comment.{payload.action}",
        target_type="comment",
        target_id=comment.id,
        detail={"note": payload.note},
        request=request,
    )
    await db.commit()
    return {"data": {"id": comment.id, "status": comment.status}}


# ---------------------------------------------------------------- 举报


@router.get("/reports")
async def list_reports(
    db: DbSession,
    user: StaffUser,
    status: str | None = "open",
    limit: int = Query(default=20, ge=1, le=100),
    before_id: str | None = None,
):
    stmt = select(Report)
    if status:
        stmt = stmt.where(Report.status == status)
    stmt = with_cursor(stmt, Report, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    reporters = await fetch_users(db, [r.reporter_id for r in page])
    return {
        "data": [
            {
                "id": r.id,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "reason": r.reason,
                "detail": r.detail,
                "status": r.status,
                "reporter": user_brief(reporters.get(r.reporter_id)),
                "handled_at": dt(r.handled_at),
                "created_at": dt(r.created_at),
            }
            for r in page
        ],
        "meta": meta,
    }


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    payload: ReportResolveRequest,
    request: Request,
    db: DbSession,
    user: StaffUser,
):
    report = await get_or_404(db, Report, report_id, "举报")
    if payload.action == "hide":
        model = {"post": Post, "media": Media, "comment": Comment}.get(report.target_type)
        if model is not None:
            target = await db.get(model, report.target_id)
            if target is not None:
                target.deleted_at = utcnow()
    elif payload.action == "warn":
        model = {"post": Post, "media": Media}.get(report.target_type)
        target = await db.get(model, report.target_id) if model else None
        owner_id = getattr(target, "author_id", None) or getattr(target, "uploader_id", None)
        if owner_id:
            await notify(
                db,
                owner_id,
                type="system",
                title="内容提醒",
                body=payload.note or "你的内容被举报，请注意发布规范。",
            )

    report.status = "resolved"
    report.handled_by = user.id
    report.handled_at = utcnow()
    await _audit(
        db,
        user,
        f"report.{payload.action}",
        target_type=report.target_type,
        target_id=report.target_id,
        detail={"note": payload.note},
        request=request,
    )
    await db.commit()
    return {"data": {"id": report.id, "status": report.status}}


# ---------------------------------------------------------------- 敏感词


@router.get("/sensitive-words")
async def list_sensitive_words(db: DbSession, user: StaffUser):
    rows = (
        await db.execute(select(SensitiveWord).order_by(SensitiveWord.level.desc(), SensitiveWord.word))
    ).scalars().all()
    return {
        "data": [
            {"id": w.id, "word": w.word, "level": w.level, "created_at": dt(w.created_at)} for w in rows
        ],
        "meta": {"total": len(rows)},
    }


@router.post("/sensitive-words", status_code=201)
async def create_sensitive_word(
    payload: SensitiveWordCreate, db: DbSession, user: StaffUser
):
    word = payload.word.strip()
    exists = (await db.execute(select(SensitiveWord.id).where(SensitiveWord.word == word))).scalar_one_or_none()
    if exists:
        raise AppError("ALREADY_EXISTS", "这个词已经在列表里了", 409)
    item = SensitiveWord(word=word, level=payload.level, created_at=utcnow())
    db.add(item)
    await db.commit()
    invalidate_cache()
    return {"data": {"id": item.id, "word": item.word, "level": item.level}}


@router.delete("/sensitive-words/{word_id}", status_code=204)
async def delete_sensitive_word(word_id: str, db: DbSession, user: StaffUser):
    item = await get_or_404(db, SensitiveWord, word_id, "敏感词")
    await db.delete(item)
    await db.commit()
    invalidate_cache()
    return None


# ---------------------------------------------------------------- 审计日志


@router.get("/audit-logs")
async def list_audit_logs(
    db: DbSession,
    user: AdminUser,
    actor_id: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    before_id: str | None = None,
):
    stmt = select(AuditLog)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    stmt = with_cursor(stmt, AuditLog, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    actors = await fetch_users(db, [log.actor_id for log in page])
    return {
        "data": [
            {
                "id": log.id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "detail": log.detail,
                "ip": log.ip,
                "actor": user_brief(actors.get(log.actor_id)),
                "created_at": dt(log.created_at),
            }
            for log in page
        ],
        "meta": meta,
    }


# ---------------------------------------------------------------- 批量维护


@router.post("/maintenance/cleanup-staging")
async def cleanup_staging(db: DbSession, user: AdminUser):
    """清理超时未完成的分片上传目录。"""
    removed = maintenance.purge_staging(older_than_days=2)
    await _audit(db, user, "maintenance.cleanup_staging", detail={"removed": removed})
    await db.commit()
    return {"data": {"removed": removed}}


@router.post("/maintenance/recount")
async def recount(db: DbSession, user: AdminUser):
    """重算点赞/收藏/评论数，修复历史漂移。"""
    fixed = await maintenance.recount_counters(db)
    await _audit(db, user, "maintenance.recount", detail={"fixed": fixed})
    await db.commit()
    return {"data": {"fixed": fixed}}
