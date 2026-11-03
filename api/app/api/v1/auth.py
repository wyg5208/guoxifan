import re
from datetime import timedelta

from fastapi import APIRouter, Request
from sqlalchemy import or_, select

from app.api.serializers import user_self
from app.core.config import settings
from app.core.constants import (
    REG_CLOSED,
    REG_INVITE,
    USER_ACTIVE,
    USER_DISABLED,
    USER_PENDING,
)
from app.core.deps import ActiveUser, CurrentUser, DbSession
from app.core.errors import AppError, ConflictError, ValidationError_
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_problem,
    verify_password,
)
from app.db.base import new_id, utcnow
from app.models.user import InviteCode, RefreshToken, User
from app.models.village import Villager
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    ProfileUpdateRequest,
    RefreshRequest,
    RegisterRequest,
)
from app.services import settings as site_settings
from app.services.notify import notify_admins

router = APIRouter(prefix="/auth", tags=["认证"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_FAIL = 5
LOCK_MINUTES = 15


def _client_meta(request: Request) -> tuple[str | None, str | None]:
    ua = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    return (ua[:300] if ua else None), ip


def _issue_tokens(db: DbSession, user: User, request: Request) -> dict:
    access = create_access_token(user.id, user.role)
    raw, hashed = generate_refresh_token()
    ua, ip = _client_meta(request)
    db.add(
        RefreshToken(
            id=new_id(),
            user_id=user.id,
            token_hash=hashed,
            user_agent=ua,
            ip=ip,
            expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
            created_at=utcnow(),
        )
    )
    return {
        "access_token": access,
        "refresh_token": raw,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


async def _resolve_invite(db: DbSession, code: str | None) -> InviteCode | None:
    if not code:
        return None
    normalized = code.strip().upper()
    invite = (await db.execute(select(InviteCode).where(InviteCode.code == normalized))).scalar_one_or_none()
    now = utcnow()
    if invite is None:
        raise AppError("INVITE_INVALID", "邀请码无效", 422)
    if invite.disabled_at is not None:
        raise AppError("INVITE_INVALID", "邀请码已停用", 422)
    if invite.expires_at is not None and invite.expires_at < now:
        raise AppError("INVITE_INVALID", "邀请码已过期", 422)
    if invite.used_count >= invite.max_uses:
        raise AppError("INVITE_INVALID", "邀请码已用完", 422)
    return invite


@router.post("/register", status_code=201)
async def register(payload: RegisterRequest, request: Request, db: DbSession):
    feature = await site_settings.get_feature(db)
    mode = str(feature.get("reg_mode") or "open")

    if mode == REG_CLOSED:
        raise AppError("REGISTER_CLOSED", "本站暂未开放注册，请联系管理员", 403)
    if mode == REG_INVITE and not payload.invite_code:
        raise AppError("INVITE_REQUIRED", "本站需要邀请码才能注册", 422)

    invite = await _resolve_invite(db, payload.invite_code)

    problem = password_problem(payload.password)
    if problem:
        raise ValidationError_(problem)

    email = payload.email.lower().strip() if payload.email else None
    phone = payload.phone.strip() if payload.phone else None
    if email and not EMAIL_RE.match(email):
        raise ValidationError_("邮箱格式不正确")
    if phone and not re.fullmatch(r"1\d{10}", phone):
        raise ValidationError_("手机号格式不正确")

    conditions = []
    if email:
        conditions.append(User.email == email)
    if phone:
        conditions.append(User.phone == phone)
    if conditions:
        exists = (await db.execute(select(User.id).where(or_(*conditions)))).scalars().first()
        if exists:
            raise ConflictError("该邮箱或手机号已注册")

    auto = bool(feature.get("auto_approve")) or bool(invite and invite.auto_approve)
    status = USER_ACTIVE if auto else USER_PENDING

    user = User(
        email=email,
        phone=phone,
        password_hash=hash_password(payload.password),
        nickname=payload.nickname,
        role="member",
        status=status,
    )
    db.add(user)
    await db.flush()

    if payload.villager:
        villager = Villager(
            name=payload.villager.name,
            family_id=payload.villager.family_id,
            relation_to_head=payload.villager.relation_to_head,
            gender=payload.villager.gender or "unknown",
            generation=payload.villager.generation,
            user_id=user.id,
        )
        db.add(villager)
        await db.flush()
        user.villager_id = villager.id

    if invite:
        invite.used_count += 1

    if not auto:
        await notify_admins(
            db,
            type="review",
            title=f"新村民待审核：{user.nickname}",
            body="进入后台「用户与村民 → 待审核」处理",
            link="/admin/users?status=pending",
            actor_id=user.id,
        )

    tokens = _issue_tokens(db, user, request)
    await db.commit()

    return {
        "data": {
            **tokens,
            "user_id": user.id,
            "status": user.status,
            "auto_approved": auto,
            "message": "注册成功" if auto else "注册成功，等待管理员审核",
        }
    }


@router.post("/login")
async def login(payload: LoginRequest, request: Request, db: DbSession):
    account = payload.account.strip()
    user = (
        await db.execute(
            select(User).where(
                or_(User.email == account.lower(), User.phone == account, User.nickname == account),
                User.deleted_at.is_(None),
            )
        )
    ).scalars().first()
    if user is None:
        raise AppError("AUTH_INVALID_CREDENTIALS", "账号或密码错误", 401)

    now = utcnow()
    if user.locked_until and user.locked_until > now:
        remain = int((user.locked_until - now).total_seconds() // 60) + 1
        raise AppError("ACCOUNT_LOCKED", f"登录失败次数过多，请 {remain} 分钟后再试", 429)

    if not verify_password(user.password_hash, payload.password):
        user.login_fail_count += 1
        if user.login_fail_count >= MAX_FAIL:
            user.login_fail_count = 0
            user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        await db.commit()
        raise AppError("AUTH_INVALID_CREDENTIALS", "账号或密码错误", 401)

    if user.status == USER_DISABLED:
        raise AppError("ACCOUNT_DISABLED", "账号已被禁用，请联系管理员", 403)

    user.login_fail_count = 0
    user.locked_until = None
    user.last_login_at = now
    tokens = _issue_tokens(db, user, request)
    await db.commit()

    return {"data": {**tokens, "user": user_self(user)}}


@router.post("/refresh")
async def refresh(payload: RefreshRequest, request: Request, db: DbSession):
    token_hash = hash_refresh_token(payload.refresh_token)
    row = (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        raise AppError("AUTH_REFRESH_INVALID", "登录已失效，请重新登录", 401)
    if row.expires_at < utcnow():
        raise AppError("AUTH_REFRESH_INVALID", "登录已过期，请重新登录", 401)

    user = await db.get(User, row.user_id)
    if user is None or user.deleted_at is not None:
        raise AppError("AUTH_REFRESH_INVALID", "登录已失效，请重新登录", 401)
    if user.status == USER_DISABLED:
        raise AppError("ACCOUNT_DISABLED", "账号已被禁用", 403)

    row.revoked_at = utcnow()
    tokens = _issue_tokens(db, user, request)
    await db.commit()

    return {"data": {**tokens, "user": user_self(user)}}


@router.post("/logout", status_code=204)
async def logout(payload: LogoutRequest, db: DbSession):
    if payload.refresh_token:
        token_hash = hash_refresh_token(payload.refresh_token)
        row = (
            await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        ).scalar_one_or_none()
        if row and row.revoked_at is None:
            row.revoked_at = utcnow()
            await db.commit()
    return None


@router.get("/me")
async def me(user: CurrentUser, db: DbSession):
    data = user_self(user)
    if user.villager_id:
        villager = await db.get(Villager, user.villager_id)
        if villager is not None:
            data["villager_name"] = villager.name
    return {"data": data}


@router.patch("/me")
async def update_me(payload: ProfileUpdateRequest, user: ActiveUser, db: DbSession):
    data = payload.model_dump(exclude_unset=True)
    if "nickname" in data and data["nickname"]:
        clash = (
            await db.execute(select(User.id).where(User.nickname == data["nickname"], User.id != user.id))
        ).scalar_one_or_none()
        if clash:
            raise ConflictError("这个昵称已经有人用了")
        user.nickname = data["nickname"]
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"]
    if "bio" in data:
        user.bio = data["bio"]
    await db.commit()
    return {"data": user_self(user)}


@router.post("/password")
async def change_password(payload: ChangePasswordRequest, user: ActiveUser, db: DbSession, request: Request):
    if not verify_password(user.password_hash, payload.old_password):
        raise AppError("AUTH_INVALID_CREDENTIALS", "原密码不正确", 400)
    problem = password_problem(payload.new_password)
    if problem:
        raise ValidationError_(problem)
    user.password_hash = hash_password(payload.new_password)
    await db.execute(
        RefreshToken.__table__.update().where(RefreshToken.user_id == user.id).values(revoked_at=utcnow())
    )
    await db.commit()
    return {"data": {"ok": True}}
