"""WebSocket 连接管理。

单进程内存实现：uvicorn 跑 1 个 worker 时完全正确。
将来横向扩容时把 broadcast_* / send_to_user 换成 Redis pub/sub 即可，调用方无需改动。
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._by_user: dict[str, set[WebSocket]] = defaultdict(set)
        self._by_room: dict[str, set[WebSocket]] = defaultdict(set)
        self._owner: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------ 生命周期
    async def connect(self, ws: WebSocket, user_id: str) -> None:
        await ws.accept()
        async with self._lock:
            self._by_user[user_id].add(ws)
            self._owner[ws] = user_id

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            user_id = self._owner.pop(ws, None)
            if user_id:
                sockets = self._by_user.get(user_id)
                if sockets is not None:
                    sockets.discard(ws)
                    if not sockets:
                        self._by_user.pop(user_id, None)
            for sockets in list(self._by_room.values()):
                sockets.discard(ws)

    # ------------------------------------------------------------ 房间订阅
    def join_room(self, ws: WebSocket, room_id: str) -> None:
        self._by_room[room_id].add(ws)

    def leave_room(self, ws: WebSocket, room_id: str) -> None:
        sockets = self._by_room.get(room_id)
        if sockets is None:
            return
        sockets.discard(ws)
        if not sockets:
            self._by_room.pop(room_id, None)

    # ------------------------------------------------------------ 发送
    async def _safe_send(self, ws: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await ws.send_json(payload)
        except Exception:  # noqa: BLE001 - 对端已断开属于正常情况
            await self.disconnect(ws)

    async def send_socket(self, ws: WebSocket, payload: dict[str, Any]) -> None:
        await self._safe_send(ws, payload)

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        for ws in list(self._by_user.get(user_id, ())):
            await self._safe_send(ws, payload)

    async def send_to_users(self, user_ids: Iterable[str], payload: dict[str, Any]) -> None:
        for user_id in {uid for uid in user_ids if uid}:
            await self.send_to_user(user_id, payload)

    async def broadcast_room(
        self,
        room_id: str,
        payload: dict[str, Any],
        exclude: WebSocket | None = None,
    ) -> None:
        for ws in list(self._by_room.get(room_id, ())):
            if ws is exclude:
                continue
            await self._safe_send(ws, payload)

    # ------------------------------------------------------------ 状态
    def online_users(self) -> list[str]:
        return list(self._by_user.keys())

    def online_count(self) -> int:
        return len(self._by_user)

    def room_connections(self, room_id: str) -> int:
        return len(self._by_room.get(room_id, ()))


manager = ConnectionManager()
