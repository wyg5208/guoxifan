"""WebSocket 入口：/ws?token=<access_token>

协议（客户端 → 服务端）：
    {"type": "ping"}                       心跳
    {"type": "join", "room_id": "..."}     订阅房间消息
    {"type": "leave", "room_id": "..."}    取消订阅
    {"type": "typing", "room_id": "..."}   正在输入（转发给同房间其他人）

协议（服务端 → 客户端）：
    {"type": "ready", "user_id": "..."}
    {"type": "ping" | "pong", "ts": "..."}
    {"type": "joined" | "message" | "typing" | "notification" | "media.ready", ...}

心跳 25s 一次：Cloudflare Tunnel 空闲 100s 会断流，必须主动保活。
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.constants import USER_DISABLED
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.chat import RoomMember
from app.models.user import User
from app.ws.manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()

HEARTBEAT_SECONDS = 25


async def _authenticate(token: str) -> User | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except AppError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None or user.status == USER_DISABLED:
        return None
    return user


async def _my_rooms(user_id: str) -> set[str]:
    async with SessionLocal() as db:
        rows = await db.execute(
            select(RoomMember.room_id).where(
                RoomMember.user_id == user_id,
                RoomMember.left_at.is_(None),
            )
        )
        return set(rows.scalars().all())


@router.websocket("/ws")
async def chat_socket(websocket: WebSocket) -> None:
    user = await _authenticate(websocket.query_params.get("token", ""))
    if user is None:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, user.id)
    stop = asyncio.Event()

    async def heartbeat() -> None:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                await manager.send_socket(websocket, {"type": "ping", "ts": utcnow().isoformat()})

    beat = asyncio.create_task(heartbeat())
    try:
        for room_id in await _my_rooms(user.id):
            manager.join_room(websocket, room_id)
        await manager.send_socket(websocket, {"type": "ready", "user_id": user.id})

        while True:
            try:
                data = await websocket.receive_json()
            except ValueError:
                continue
            event = str(data.get("type") or "")
            if event == "ping":
                await manager.send_socket(websocket, {"type": "pong", "ts": utcnow().isoformat()})
            elif event == "join":
                room_id = data.get("room_id")
                if isinstance(room_id, str) and room_id in (await _my_rooms(user.id)):
                    manager.join_room(websocket, room_id)
                    await manager.send_socket(websocket, {"type": "joined", "room_id": room_id})
            elif event == "leave":
                room_id = data.get("room_id")
                if isinstance(room_id, str):
                    manager.leave_room(websocket, room_id)
            elif event == "typing":
                room_id = data.get("room_id")
                if isinstance(room_id, str):
                    await manager.broadcast_room(
                        room_id,
                        {"type": "typing", "room_id": room_id, "user_id": user.id},
                        exclude=websocket,
                    )
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001 - 断连原因不需要打断服务
        logger.debug("WebSocket 关闭 %s: %s", user.id, exc)
    finally:
        stop.set()
        beat.cancel()
        await manager.disconnect(websocket)
