from typing import Any

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError


def with_cursor(stmt: Select, model: Any, before_id: str | None) -> Select:
    if before_id:
        stmt = stmt.where(model.id < before_id)
    return stmt.order_by(model.id.desc())


def pack(items: list, limit: int, key: str = "id") -> tuple[list, dict]:
    has_more = len(items) > limit
    page = items[:limit]
    next_cursor = str(getattr(page[-1], key)) if (has_more and page) else None
    return page, {"next_cursor": next_cursor, "has_more": has_more}


async def get_or_404(db: AsyncSession, model: Any, obj_id: str, label: str = "资源") -> Any:
    obj = await db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None) is not None:
        raise NotFoundError(f"{label}不存在")
    return obj


def clean_limit(limit: int, maximum: int = 50) -> int:
    return max(1, min(limit, maximum))
