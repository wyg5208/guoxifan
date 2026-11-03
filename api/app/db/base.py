import os
import time
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def utcnow() -> datetime:
    """统一使用 naive UTC 存库，序列化时再补 Z。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    """ULID：26 位、字典序即时间序，导出/合并不撞号。"""
    ts = int(time.time() * 1000)
    chars = []
    for _ in range(10):
        chars.append(_ALPHABET[ts & 31])
        ts >>= 5
    randomness = "".join(_ALPHABET[b % 32] for b in os.urandom(16))
    return "".join(reversed(chars)) + randomness


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
