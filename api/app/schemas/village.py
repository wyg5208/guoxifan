from pydantic import Field

from app.schemas.common import RequestModel


class FamilyCreate(RequestModel):
    name: str = Field(min_length=1, max_length=80)
    householder: str | None = None
    village_area: str | None = None
    door_no: str | None = None
    address_text: str | None = None
    map_x: float | None = None
    map_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    intro: str | None = None
    cover_url: str | None = None
    relocated_at: str | None = None
    current_loc: str | None = None
    sort_order: int = 0


class FamilyUpdate(RequestModel):
    name: str | None = Field(default=None, max_length=80)
    householder: str | None = None
    village_area: str | None = None
    door_no: str | None = None
    address_text: str | None = None
    map_x: float | None = None
    map_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    intro: str | None = None
    cover_url: str | None = None
    relocated_at: str | None = None
    current_loc: str | None = None
    sort_order: int | None = None


class VillagerCreate(RequestModel):
    name: str = Field(min_length=1, max_length=60)
    family_id: str | None = None
    alias: str | None = None
    gender: str | None = "unknown"
    generation: str | None = None
    relation_to_head: str | None = None
    birth_date: str | None = None
    death_date: str | None = None
    is_deceased: bool = False
    avatar_url: str | None = None
    occupation: str | None = None
    intro: str | None = None
    contact: str | None = None
    contact_visibility: str = "member"
    sort_order: int = 0


class VillagerUpdate(RequestModel):
    name: str | None = Field(default=None, max_length=60)
    family_id: str | None = None
    alias: str | None = None
    gender: str | None = None
    generation: str | None = None
    relation_to_head: str | None = None
    birth_date: str | None = None
    death_date: str | None = None
    is_deceased: bool | None = None
    avatar_url: str | None = None
    occupation: str | None = None
    intro: str | None = None
    contact: str | None = None
    contact_visibility: str | None = None
    is_hidden: bool | None = None
    sort_order: int | None = None


class RelationCreate(RequestModel):
    to_id: str
    relation: str = Field(pattern="^(spouse|parent|child|sibling)$")


class TimelineCreate(RequestModel):
    year_label: str = Field(min_length=1, max_length=40)
    sort_year: int | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    image_url: str | None = None
    category: str | None = None
    post_id: str | None = None
    sort_order: int = 0


class TimelineUpdate(RequestModel):
    year_label: str | None = None
    sort_year: int | None = None
    title: str | None = None
    description: str | None = None
    image_url: str | None = None
    category: str | None = None
    post_id: str | None = None
    sort_order: int | None = None
