from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, new_id


class Family(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "families"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    householder: Mapped[str | None] = mapped_column(String(60))
    village_area: Mapped[str | None] = mapped_column(String(60), index=True)
    door_no: Mapped[str | None] = mapped_column(String(40))
    address_text: Mapped[str | None] = mapped_column(String(300))
    map_x: Mapped[float | None] = mapped_column(Float)
    map_y: Mapped[float | None] = mapped_column(Float)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    intro: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(500))
    relocated_at: Mapped[str | None] = mapped_column(String(40))
    current_loc: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Villager(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "villagers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    family_id: Mapped[str | None] = mapped_column(String(32), index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    alias: Mapped[str | None] = mapped_column(String(60))
    gender: Mapped[str | None] = mapped_column(String(10), default="unknown")
    generation: Mapped[str | None] = mapped_column(String(40))
    relation_to_head: Mapped[str | None] = mapped_column(String(40))
    birth_date: Mapped[str | None] = mapped_column(String(40))
    death_date: Mapped[str | None] = mapped_column(String(40))
    is_deceased: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    occupation: Mapped[str | None] = mapped_column(String(100))
    intro: Mapped[str | None] = mapped_column(Text)
    contact: Mapped[str | None] = mapped_column(String(200))
    contact_visibility: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    is_hidden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class VillagerRelation(Base):
    __tablename__ = "villager_relations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    from_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    to_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    relation: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class TimelineEvent(Base, TimestampMixin):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    year_label: Mapped[str] = mapped_column(String(40), nullable=False)
    sort_year: Mapped[int | None] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    category: Mapped[str | None] = mapped_column(String(40))
    post_id: Mapped[str | None] = mapped_column(String(32))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
