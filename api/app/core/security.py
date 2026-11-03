import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings
from app.core.errors import AppError

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(hashed: str, raw: str) -> bool:
    try:
        return _hasher.verify(hashed, raw)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_problem(raw: str) -> str | None:
    """返回不合规原因，None 表示通过。"""
    if len(raw) < 8:
        return "密码至少 8 位"
    if len(raw) > 72:
        return "密码不能超过 72 位"
    if not any(c.isalpha() for c in raw):
        return "密码需包含字母"
    if not any(c.isdigit() for c in raw):
        return "密码需包含数字"
    return None


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AppError("AUTH_TOKEN_EXPIRED", "登录已过期", 401) from exc
    except jwt.PyJWTError as exc:
        raise AppError("AUTH_INVALID_TOKEN", "登录凭证无效", 401) from exc
    if payload.get("typ") != "access":
        raise AppError("AUTH_INVALID_TOKEN", "登录凭证无效", 401)
    return payload


def generate_refresh_token() -> tuple[str, str]:
    """返回 (明文, 哈希)。明文只出现在响应里，库里只存哈希。"""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
