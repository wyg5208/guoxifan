"""站内通知。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ROLE_ADMIN, ROLE_SUPER_ADMIN
from app.db.base import utcnow
from app.models.system import Notification
from app.models.user import User


async def notify(
    db: AsyncSession,
    user_id: str,
    *,
    type: str = "system",
    title: str,
    body: str | None = None,
    link: str | None = None,
    actor_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
) -> Notification | None:
    if actor_id and actor_id == user_id:
        return None
    item = Notification(
        user_id=user_id,
        type=type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        title=title[:200],
        body=(body or "")[:500] or None,
        link=link,
        is_read=0,
        created_at=utcnow(),
    )
    db.add(item)
    return item


async def notify_admins(
    db: AsyncSession,
    *,
    type: str = "system",
    title: str,
    body: str | None = None,
    link: str | None = None,
    actor_id: str | None = None,
) -> None:
    rows = (
        await db.execute(
            select(User.id).where(
                User.role.in_([ROLE_ADMIN, ROLE_SUPER_ADMIN]),
                User.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    for user_id in rows:
        await notify(db, user_id, type=type, title=title, body=body, link=link, actor_id=actor_id)
