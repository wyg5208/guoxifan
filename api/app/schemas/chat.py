from typing import Literal

from pydantic import Field

from app.schemas.common import RequestModel


class RoomCreate(RequestModel):
    type: Literal["hall", "group", "direct"] = "group"
    name: str | None = Field(default=None, max_length=120)
    peer_user_id: str | None = None
    member_ids: list[str] = Field(default_factory=list)
    description: str | None = None
    is_public: bool = True


class RoomUpdate(RequestModel):
    name: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = None
    description: str | None = None


class MessageCreate(RequestModel):
    kind: Literal["text", "image", "video", "file", "system"] = "text"
    content: str | None = Field(default=None, max_length=4000)
    attachment_id: str | None = None
    client_id: str | None = Field(default=None, max_length=64)
    reply_to_id: str | None = None


class ReadRequest(RequestModel):
    seq: int = Field(ge=0)


class MemberAddRequest(RequestModel):
    user_ids: list[str] = Field(min_length=1, max_length=100)
