"""聊天：大厅、群聊、私聊，消息支持文本/图片/视频/文件。"""

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update

from app.api.serializers import (
    attachment_card,
    dt,
    fetch_users,
    message_card,
    room_card,
    user_brief,
)
from app.api.utils import get_or_404, pack
from app.core.constants import (
    MSG_FILE,
    MSG_IMAGE,
    MSG_RECALLED,
    MSG_SENT,
    MSG_TEXT,
    MSG_VIDEO,
    ROOM_DIRECT,
    ROOM_GROUP,
    ROOM_HALL,
    ROLE_ADMIN,
    USER_ACTIVE,
)
from app.core.deps import ActiveUser, CurrentUser, DbSession, can
from app.core.errors import AppError, NotFoundError, PermissionError_
from app.db.base import utcnow
from app.models.chat import Attachment, Message, Room, RoomMember
from app.models.user import User
from app.schemas.chat import MemberAddRequest, MessageCreate, ReadRequest, RoomCreate, RoomUpdate
from app.services import settings as site_settings
from app.services.moderation import review_text
from app.ws.manager import manager

router = APIRouter(prefix="/chat", tags=["聊天"])

MESSAGE_KINDS = {MSG_TEXT: MSG_TEXT, MSG_IMAGE: MSG_IMAGE, MSG_VIDEO: MSG_VIDEO, MSG_FILE: MSG_FILE}


async def _room(db, room_id: str) -> Room:
    return await get_or_404(db, Room, room_id, "会话")


async def _member(db, room_id: str, user_id: str) -> RoomMember | None:
    return (
        await db.execute(
            select(RoomMember).where(
                RoomMember.room_id == room_id,
                RoomMember.user_id == user_id,
                RoomMember.left_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def _require_member(db, room: Room, user: User) -> RoomMember:
    member = await _member(db, room.id, user.id)
    if member is None:
        raise PermissionError_("你不在这个会话里")
    return member


async def _participant(db, room: Room, user: User) -> RoomMember:
    """公开会话（大厅/公开群）直接放行并自动加入，其余必须是成员。"""
    member = await _member(db, room.id, user.id)
    if member is not None:
        return member
    if not room.is_public:
        raise PermissionError_("你不在这个会话里")
    member = await _add_member(db, room.id, user.id)
    await db.commit()
    return member


async def _add_member(db, room_id: str, user_id: str, role: str = "member") -> RoomMember:
    existing = (
        await db.execute(
            select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.left_at = None
        existing.last_read_seq = max(existing.last_read_seq, 0)
        return existing
    member = RoomMember(
        room_id=room_id,
        user_id=user_id,
        role=role,
        last_read_seq=0,
        joined_at=utcnow(),
    )
    db.add(member)
    return member


async def _member_count(db, room_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(RoomMember)
                .where(RoomMember.room_id == room_id, RoomMember.left_at.is_(None))
            )
        ).scalar()
        or 0
    )


async def _unread(db, room_id: str, last_read_seq: int, user_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(Message)
                .where(
                    Message.room_id == room_id,
                    Message.seq > last_read_seq,
                    Message.sender_id != user_id,
                    Message.status == MSG_SENT,
                )
            )
        ).scalar()
        or 0
    )


async def _peer_of(db, room: Room, user_id: str) -> dict | None:
    if room.type != ROOM_DIRECT:
        return None
    row = (
        await db.execute(
            select(RoomMember.user_id).where(
                RoomMember.room_id == room.id,
                RoomMember.user_id != user_id,
                RoomMember.left_at.is_(None),
            )
        )
    ).scalars().first()
    if row is None:
        return None
    peer = await db.get(User, row)
    return user_brief(peer)


async def _ensure_hall(db, user: User) -> Room:
    """大厅始终存在，新用户首次进入聊天自动加入。"""
    room = (
        await db.execute(
            select(Room).where(Room.type == ROOM_HALL, Room.deleted_at.is_(None)).order_by(Room.id).limit(1)
        )
    ).scalar_one_or_none()
    created = False
    if room is None:
        room = Room(type=ROOM_HALL, name="村口大槐树", description="谁都能来的村口闲聊", is_public=1)
        db.add(room)
        await db.flush()
        created = True

    member = await _member(db, room.id, user.id)
    if member is None:
        await _add_member(db, room.id, user.id)
        created = True
    if created:
        await db.commit()
    return room


def _preview(kind: str, content: str | None, attachment: Attachment | None) -> str:
    if kind == MSG_IMAGE:
        return "[图片]"
    if kind == MSG_VIDEO:
        return "[视频]"
    if kind == MSG_FILE:
        return f"[文件] {attachment.filename if attachment else ''}".strip()
    return (content or "").replace("\n", " ")[:120]


# ---------------------------------------------------------------- 会话


@router.get("/rooms")
async def list_rooms(db: DbSession, user: CurrentUser):
    feature = await site_settings.get_feature(db)
    if not feature.get("chat_enabled", True):
        raise AppError("CHAT_DISABLED", "聊天功能暂未开放", 403)

    await _ensure_hall(db, user)

    memberships = (
        await db.execute(select(RoomMember).where(RoomMember.user_id == user.id, RoomMember.left_at.is_(None)))
    ).scalars().all()
    if not memberships:
        return {"data": [], "meta": {"total": 0}}

    room_ids = [m.room_id for m in memberships]
    rooms = {
        room.id: room
        for room in (
            await db.execute(select(Room).where(Room.id.in_(room_ids), Room.deleted_at.is_(None)))
        ).scalars()
    }

    data = []
    for member in memberships:
        room = rooms.get(member.room_id)
        if room is None:
            continue
        data.append(
            room_card(
                room,
                unread=await _unread(db, room.id, member.last_read_seq, user.id),
                member_count=await _member_count(db, room.id),
                peer=await _peer_of(db, room, user.id),
            )
        )

    # 最近有消息的会话排前面
    data.sort(key=lambda item: item["last_message_at"] or "", reverse=True)

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/rooms", status_code=201)
async def create_room(payload: RoomCreate, user: ActiveUser, db: DbSession):
    feature = await site_settings.get_feature(db)
    if not feature.get("chat_enabled", True):
        raise AppError("CHAT_DISABLED", "聊天功能暂未开放", 403)

    if payload.type == ROOM_DIRECT:
        if not payload.peer_user_id:
            raise AppError("VALIDATION_ERROR", "请选择私聊对象", 400)
        if payload.peer_user_id == user.id:
            raise AppError("VALIDATION_ERROR", "不能和自己私聊", 400)
        peer = await db.get(User, payload.peer_user_id)
        if peer is None or peer.deleted_at is not None or peer.status != USER_ACTIVE:
            raise NotFoundError("对方账号不可用")
        direct_key = ":".join(sorted([user.id, peer.id]))
        room = (await db.execute(select(Room).where(Room.direct_key == direct_key))).scalar_one_or_none()
        if room is not None and room.deleted_at is None:
            await _add_member(db, room.id, user.id)
            await _add_member(db, room.id, peer.id)
            await db.commit()
            return {
                "data": room_card(room, member_count=2, peer=user_brief(peer)),
                "meta": {"created": False},
            }

        room = Room(type=ROOM_DIRECT, name=None, direct_key=direct_key, is_public=0, owner_id=user.id)
        db.add(room)
        await db.flush()
        await _add_member(db, room.id, user.id)
        await _add_member(db, room.id, peer.id)
        await db.commit()
        return {"data": room_card(room, member_count=2, peer=user_brief(peer)), "meta": {"created": True}}

    if payload.type == ROOM_HALL:
        if not can(user, ROLE_ADMIN):
            raise PermissionError_("只有管理员可以创建大厅")
        room = Room(
            type=ROOM_HALL,
            name=payload.name or "村口大槐树",
            description=payload.description,
            is_public=1,
            owner_id=user.id,
        )
        db.add(room)
        await db.flush()
        await _add_member(db, room.id, user.id, role="owner")
        await db.commit()
        return {"data": room_card(room, member_count=1), "meta": {"created": True}}

    if not payload.name:
        raise AppError("VALIDATION_ERROR", "请填写群名称", 400)
    room = Room(
        type=ROOM_GROUP,
        name=payload.name,
        description=payload.description,
        is_public=1 if payload.is_public else 0,
        owner_id=user.id,
    )
    db.add(room)
    await db.flush()
    await _add_member(db, room.id, user.id, role="owner")
    added = 0
    for member_id in dict.fromkeys(payload.member_ids):
        if member_id == user.id:
            continue
        target = await db.get(User, member_id)
        if target is None or target.deleted_at is not None:
            continue
        await _add_member(db, room.id, member_id)
        added += 1
    await db.commit()
    return {
        "data": room_card(room, member_count=added + 1),
        "meta": {"created": True, "added": added},
    }


@router.get("/rooms/{room_id}")
async def get_room(room_id: str, db: DbSession, user: CurrentUser):
    room = await _room(db, room_id)
    member = await _require_member(db, room, user)
    return {
        "data": room_card(
            room,
            unread=await _unread(db, room.id, member.last_read_seq, user.id),
            member_count=await _member_count(db, room.id),
            peer=await _peer_of(db, room, user.id),
        )
    }


@router.patch("/rooms/{room_id}")
async def update_room(room_id: str, payload: RoomUpdate, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    member = await _require_member(db, room, user)
    if member.role != "owner" and not can(user, ROLE_ADMIN):
        raise PermissionError_("只有群主可以修改会话信息")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, key, value)
    await db.commit()
    return {"data": room_card(room, member_count=await _member_count(db, room.id))}


@router.delete("/rooms/{room_id}", status_code=204)
async def delete_room(room_id: str, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    if room.type == ROOM_DIRECT:
        raise AppError("VALIDATION_ERROR", "私聊会话不能删除，可以直接退出", 400)
    member = await _require_member(db, room, user)
    if member.role != "owner" and not can(user, ROLE_ADMIN):
        raise PermissionError_("只有群主可以解散会话")
    room.deleted_at = utcnow()
    await db.commit()
    return None


@router.post("/rooms/{room_id}/join")
async def join_room(room_id: str, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    if not room.is_public:
        raise PermissionError_("该会话需要邀请才能加入")
    member = await _member(db, room.id, user.id)
    if member is None:
        await _add_member(db, room.id, user.id)
        await db.commit()
    return {"data": room_card(room, member_count=await _member_count(db, room.id))}


@router.post("/rooms/{room_id}/leave", status_code=204)
async def leave_room(room_id: str, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    if room.type == ROOM_HALL:
        raise AppError("VALIDATION_ERROR", "大厅不能退出", 400)
    member = await _require_member(db, room, user)
    member.left_at = utcnow()
    await db.commit()
    return None


@router.get("/rooms/{room_id}/members")
async def list_members(room_id: str, db: DbSession, user: CurrentUser):
    room = await _room(db, room_id)
    await _participant(db, room, user)
    rows = (
        await db.execute(
            select(RoomMember)
            .where(RoomMember.room_id == room.id, RoomMember.left_at.is_(None))
            .order_by(RoomMember.joined_at)
        )
    ).scalars().all()
    users = await fetch_users(db, [m.user_id for m in rows])
    return {
        "data": [
            {
                "user": user_brief(users.get(m.user_id)),
                "role": m.role,
                "is_muted": bool(m.is_muted),
                "last_read_seq": m.last_read_seq,
                "joined_at": dt(m.joined_at),
            }
            for m in rows
        ],
        "meta": {"total": len(rows)},
    }


@router.post("/rooms/{room_id}/members")
async def add_members(room_id: str, payload: MemberAddRequest, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    if room.type == ROOM_DIRECT:
        raise AppError("VALIDATION_ERROR", "私聊会话不能添加成员", 400)
    member = await _require_member(db, room, user)
    if member.role != "owner" and not can(user, ROLE_ADMIN):
        raise PermissionError_("只有群主可以添加成员")

    added = 0
    for user_id in dict.fromkeys(payload.user_ids):
        target = await db.get(User, user_id)
        if target is None or target.deleted_at is not None or target.status != USER_ACTIVE:
            continue
        if await _member(db, room.id, user_id) is None:
            await _add_member(db, room.id, user_id)
            added += 1
    await db.commit()
    return {"data": {"added": added, "member_count": await _member_count(db, room.id)}}


@router.delete("/rooms/{room_id}/members/{user_id}", status_code=204)
async def remove_member(room_id: str, user_id: str, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    member = await _require_member(db, room, user)
    if user_id != user.id:
        if member.role != "owner" and not can(user, ROLE_ADMIN):
            raise PermissionError_("只有群主可以移除成员")
    target = await _member(db, room.id, user_id)
    if target is None:
        raise NotFoundError("该成员不在会话中")
    target.left_at = utcnow()
    await db.commit()
    return None


# ---------------------------------------------------------------- 消息


@router.get("/rooms/{room_id}/messages")
async def list_messages(
    room_id: str,
    db: DbSession,
    user: CurrentUser,
    before_seq: int | None = None,
    after_seq: int | None = None,
    limit: int = Query(default=30, ge=1, le=100),
):
    room = await _room(db, room_id)
    await _participant(db, room, user)

    stmt = select(Message).where(Message.room_id == room.id)
    if after_seq is not None:
        stmt = stmt.where(Message.seq > after_seq).order_by(Message.seq.asc())
    elif before_seq is not None:
        stmt = stmt.where(Message.seq < before_seq).order_by(Message.seq.desc())
    else:
        stmt = stmt.order_by(Message.seq.desc())

    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    has_more = len(rows) > limit
    page = rows[:limit]

    attachment_ids = [m.attachment_id for m in page if m.attachment_id]
    attachments: dict[str, Attachment] = {}
    if attachment_ids:
        for att in (
            await db.execute(select(Attachment).where(Attachment.id.in_(attachment_ids)))
        ).scalars():
            attachments[att.id] = att

    senders = await fetch_users(db, [m.sender_id for m in page])
    cards = [
        message_card(
            message,
            senders.get(message.sender_id),
            attachments.get(message.attachment_id or ""),
        )
        for message in page
    ]
    cards.sort(key=lambda item: item["seq"])

    return {
        "data": cards,
        "meta": {
            "has_more": has_more,
            "next_seq": page[-1].seq if page else None,
            "room_last_seq": room.last_seq,
        },
    }


@router.post("/rooms/{room_id}/messages", status_code=201)
async def send_message(room_id: str, payload: MessageCreate, user: ActiveUser, db: DbSession):
    feature = await site_settings.get_feature(db)
    if not feature.get("chat_enabled", True):
        raise AppError("CHAT_DISABLED", "聊天功能暂未开放", 403)

    room = await _room(db, room_id)
    member = await _participant(db, room, user)
    if member.is_muted:
        raise PermissionError_("你已被禁言")

    if payload.kind not in MESSAGE_KINDS:
        raise AppError("VALIDATION_ERROR", "不支持的消息类型", 400)

    attachment: Attachment | None = None
    if payload.kind in {MSG_IMAGE, MSG_VIDEO, MSG_FILE}:
        if not payload.attachment_id:
            raise AppError("VALIDATION_ERROR", "缺少附件", 400)
        attachment = await get_or_404(db, Attachment, payload.attachment_id, "附件")
        if attachment.uploader_id != user.id and not can(user, ROLE_ADMIN):
            raise PermissionError_("附件不属于你")
    elif not (payload.content or "").strip():
        raise AppError("VALIDATION_ERROR", "消息不能为空", 400)

    if payload.reply_to_id:
        reply = await db.get(Message, payload.reply_to_id)
        if reply is None or reply.room_id != room.id:
            raise AppError("VALIDATION_ERROR", "引用的消息不存在", 400)

    status, message = await review_text(db, payload.content)
    if status == "blocked":
        raise AppError("CONTENT_BLOCKED", message or "内容不合规", 422)

    seq = int(
        (
            await db.execute(
                update(Room)
                .where(Room.id == room.id)
                .values(last_seq=Room.last_seq + 1)
                .returning(Room.last_seq)
                .execution_options(synchronize_session=False)
            )
        ).scalar_one()
    )

    item = Message(
        room_id=room.id,
        seq=seq,
        sender_id=user.id,
        client_id=payload.client_id,
        kind=payload.kind,
        content=payload.content,
        attachment_id=attachment.id if attachment else None,
        reply_to_id=payload.reply_to_id,
        status=MSG_SENT,
        created_at=utcnow(),
    )
    db.add(item)
    await db.flush()

    room.last_seq = seq
    room.last_message_at = item.created_at
    room.last_message_preview = _preview(payload.kind, payload.content, attachment)
    member.last_read_seq = seq
    await db.commit()

    card = message_card(item, user, attachment)
    await manager.broadcast_room(room.id, {"type": "message", "room_id": room.id, "message": card})
    return {"data": card}


@router.post("/rooms/{room_id}/read")
async def mark_read(room_id: str, payload: ReadRequest, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    member = await _participant(db, room, user)
    if payload.seq > member.last_read_seq:
        member.last_read_seq = min(payload.seq, room.last_seq)
        await db.commit()
    return {"data": {"last_read_seq": member.last_read_seq}}


@router.post("/rooms/{room_id}/messages/{message_id}/recall", status_code=200)
async def recall_message(room_id: str, message_id: str, user: ActiveUser, db: DbSession):
    room = await _room(db, room_id)
    await _require_member(db, room, user)
    message = await get_or_404(db, Message, message_id, "消息")
    if message.room_id != room.id:
        raise NotFoundError("消息不存在")
    if message.sender_id != user.id and not can(user, ROLE_ADMIN):
        raise PermissionError_("只能撤回自己的消息")
    message.status = MSG_RECALLED
    message.content = None
    message.attachment_id = None
    await db.commit()
    await manager.broadcast_room(
        room.id,
        {"type": "message.recalled", "room_id": room.id, "message_id": message.id},
    )
    return {"data": {"ok": True}}


@router.get("/unread")
async def unread_summary(db: DbSession, user: CurrentUser):
    memberships = (
        await db.execute(select(RoomMember).where(RoomMember.user_id == user.id, RoomMember.left_at.is_(None)))
    ).scalars().all()
    items = []
    total = 0
    for member in memberships:
        count = await _unread(db, member.room_id, member.last_read_seq, user.id)
        if count:
            total += count
            items.append({"room_id": member.room_id, "unread": count})
    return {"data": {"total": total, "rooms": items}}


@router.post("/direct/{target_user_id}", status_code=201)
async def open_direct(target_user_id: str, user: ActiveUser, db: DbSession):
    return await create_room(
        RoomCreate(type=ROOM_DIRECT, peer_user_id=target_user_id, member_ids=[], is_public=False),
        user,
        db,
    )
