from typing import Any, Literal

from pydantic import Field

from app.schemas.common import RequestModel


class PostCreate(RequestModel):
    kind: Literal["article", "short"] = "article"
    title: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    content: Any = ""
    cover_url: str | None = None
    images: list[str] = Field(default_factory=list, max_length=9)
    category: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=8)
    visibility: Literal["public", "member"] = "public"
    status: Literal["draft", "published"] = "published"


class PostUpdate(RequestModel):
    title: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    content: Any | None = None
    cover_url: str | None = None
    images: list[str] | None = None
    category: str | None = None
    tags: list[str] | None = None
    visibility: Literal["public", "member"] | None = None
    status: Literal["draft", "pending", "published", "archived"] | None = None
    is_pinned: bool | None = None
    is_featured: bool | None = None


class AlbumCreate(RequestModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = None
    cover_url: str | None = None
    era: str | None = Field(default=None, max_length=40)
    visibility: Literal["public", "member"] = "public"
    sort_order: int = 0


class AlbumUpdate(RequestModel):
    title: str | None = Field(default=None, max_length=120)
    description: str | None = None
    cover_url: str | None = None
    era: str | None = None
    visibility: Literal["public", "member"] | None = None
    sort_order: int | None = None


class MediaUpdate(RequestModel):
    title: str | None = Field(default=None, max_length=200)
    caption: str | None = None
    era: str | None = Field(default=None, max_length=40)
    tags: list[str] | None = None
    villager_ids: list[str] | None = None
    album_id: str | None = None
    visibility: Literal["public", "member"] | None = None


class MediaBatchRequest(RequestModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    album_id: str | None = None
    delete: bool = False


class UploadInitRequest(RequestModel):
    filename: str = Field(min_length=1, max_length=300)
    size: int = Field(ge=1)
    mime: str | None = Field(default=None, max_length=120)
    album_id: str | None = None


class CommentCreate(RequestModel):
    target_type: Literal["post", "media", "comment"]
    target_id: str
    content: str = Field(min_length=1, max_length=1000)
    parent_id: str | None = None


class ToggleRequest(RequestModel):
    target_type: Literal["post", "media", "comment"]
    target_id: str


class ReportCreate(RequestModel):
    target_type: Literal["post", "media", "comment", "message", "villager"]
    target_id: str
    reason: str = Field(min_length=2, max_length=120)
    detail: str | None = Field(default=None, max_length=1000)
