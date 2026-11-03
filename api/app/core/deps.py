from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    ROLE_ADMIN,
    ROLE_EDITOR,
    ROLE_RANK,
    ROLE_SUPER_ADMIN,
    USER_ACTIVE,
    USER_DISABLED,
    USER_PENDING,
)
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False, description="Access Token")

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: DbSession,
) -> User | None:
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    user = await db.get(User, payload.get("sub"))
    if user is None or user.deleted_at is not None:
        raise AppError("AUTH_INVALID_TOKEN", "登录凭证无效", 401)
    if user.status == USER_DISABLED:
        raise AppError("ACCOUNT_DISABLED", "账号已被禁用", 403)
    return user


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise AppError("AUTH_REQUIRED", "请先登录", 401)
    return user


async def active_user(user: Annotated[User, Depends(current_user)]) -> User:
    """写操作要求审核通过。pending 用户可登录浏览，但不能产生内容。"""
    if user.status == USER_PENDING:
        raise AppError("ACCOUNT_PENDING", "账号正在审核中，通过后即可使用", 403)
    if user.status != USER_ACTIVE:
        raise AppError("ACCOUNT_DISABLED", "账号不可用", 403)
    return user


def _rank(user: User) -> int:
    return ROLE_RANK.get(user.role, 0)


async def staff_user(user: Annotated[User, Depends(active_user)]) -> User:
    if _rank(user) < ROLE_RANK[ROLE_EDITOR]:
        raise AppError("PERMISSION_DENIED", "需要编辑及以上权限", 403)
    return user


async def admin_user(user: Annotated[User, Depends(active_user)]) -> User:
    if _rank(user) < ROLE_RANK[ROLE_ADMIN]:
        raise AppError("PERMISSION_DENIED", "需要管理员权限", 403)
    return user


async def super_admin_user(user: Annotated[User, Depends(active_user)]) -> User:
    if user.role != ROLE_SUPER_ADMIN:
        raise AppError("PERMISSION_DENIED", "需要超级管理员权限", 403)
    return user


def can(user: User | None, min_role: str) -> bool:
    return user is not None and _rank(user) >= ROLE_RANK[min_role]


def is_staff(user: User | None) -> bool:
    return can(user, ROLE_EDITOR)


CurrentUser = Annotated[User, Depends(current_user)]
ActiveUser = Annotated[User, Depends(active_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
StaffUser = Annotated[User, Depends(staff_user)]
AdminUser = Annotated[User, Depends(admin_user)]
SuperAdminUser = Annotated[User, Depends(super_admin_user)]
