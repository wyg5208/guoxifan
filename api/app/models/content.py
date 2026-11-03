from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import POST_PUBLISHED, VIS_PUBLIC
from app.db.base import Base, SoftDeleteMixin, TimestampMixin, new_id


class Post(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(20), default="article", index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    content_html: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(500))
    images: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20), default=POST_PUBLISHED, index=True, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default=VIS_PUBLIC, nullable=False)
    is_pinned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_featured: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    favorite_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class PostTag(Base):
    __tablename__ = "post_tags"

    post_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    tag_id: Mapped[str] = mapped_column(String(32), primary_key=True, index=True)


class Album(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "albums"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(500))
    era: Mapped[str | None] = mapped_column(String(40))
    visibility: Mapped[str] = mapped_column(String(20), default=VIS_PUBLIC, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    media_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str] = mapped_column(String(32), nullable=False)


class Media(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    album_id: Mapped[str | None] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="image", index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    caption: Mapped[str | None] = mapped_column(Text)
    era: Mapped[str | None] = mapped_column(String(40), index=True)
    tags: Mapped[str | None] = mapped_column(Text)
    villager_ids: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="processing", index=True, nullable=False)
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    ext: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_sec: Mapped[float | None] = mapped_column(Float)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    derived: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default=VIS_PUBLIC, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    favorite_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploader_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    target_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    target_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(32), index=True)
    root_id: Mapped[str | None] = mapped_column(String(32), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reply_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("target_type", "target_id", "user_id", name="uq_like_target_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("target_type", "target_id", "user_id", name="uq_fav_target_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
