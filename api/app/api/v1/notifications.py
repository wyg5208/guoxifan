"""站内通知。"""

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update

from app.api.serializers import notification_card
from app.api.utils import pack, with_cursor
from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.system import Notification
from app.schemas.admin import NotificationReadRequest

router = APIRouter(prefix="/notifications", tags=["通知"])


@router.get("")
async def list_notifications(
    db: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    limit: int = Query(default=20, ge=1, le=50),
    before_id: str | None = None,
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read == 0)
    stmt = with_cursor(stmt, Notification, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)
    return {"data": [notification_card(n) for n in page], "meta": meta}


@router.get("/unread-count")
async def unread_count(db: DbSession, user: CurrentUser):
    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user.id, Notification.is_read == 0)
            )
        ).scalar()
        or 0
    )
    return {"data": {"unread": total}}


@router.post("/read")
async def mark_read(db: DbSession, user: CurrentUser, payload: NotificationReadRequest | None = None):
    conditions = [Notification.user_id == user.id, Notification.is_read == 0]
    if payload is not None and payload.ids:
        conditions.append(Notification.id.in_(payload.ids))
    await db.execute(update(Notification).where(*conditions).values(is_read=1))
    await db.commit()
    return {"data": {"ok": True}}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(notification_id: str, db: DbSession, user: CurrentUser):
    item = await db.get(Notification, notification_id)
    if item is None or item.user_id != user.id:
        raise NotFoundError("通知不存在")
    await db.delete(item)
    await db.commit()
    return None


@router.post("/cleanup")
async def cleanup(db: DbSession, user: CurrentUser):
    """清空已读通知。"""
    await db.execute(
        Notification.__table__.delete().where(Notification.user_id == user.id, Notification.is_read == 1)
    )
    await db.commit()
    return {"data": {"ok": True, "at": utcnow().isoformat()}}
