from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.api.serializers import family_card, media_urls, post_card, villager_card
from app.api.utils import get_or_404, pack, with_cursor
from app.core.constants import ROLE_EDITOR, VIS_PUBLIC
from app.core.deps import AdminUser, CurrentUser, DbSession, OptionalUser, StaffUser, can
from app.core.errors import PermissionError_
from app.db.base import utcnow
from app.models.content import Media, Post
from app.models.user import User
from app.models.village import Family, TimelineEvent, Villager, VillagerRelation
from app.schemas.village import (
    FamilyCreate,
    FamilyUpdate,
    RelationCreate,
    TimelineCreate,
    TimelineUpdate,
    VillagerCreate,
    VillagerUpdate,
)

router = APIRouter(tags=["村民与家庭"])

RELATION_WEIGHT = {"本人": 0, "户主": 0, "妻": 1, "夫": 1, "长子": 2, "次子": 3, "长女": 2, "次女": 3}


def _relation_weight(villager: Villager) -> tuple[int, str]:
    label = (villager.relation_to_head or "").strip()
    return RELATION_WEIGHT.get(label, 5), villager.birth_date or ""


def _can_see_contact(viewer: User | None, villager: Villager) -> bool:
    if can(viewer, ROLE_EDITOR):
        return True
    if viewer is not None and viewer.id == villager.user_id:
        return True
    if villager.contact_visibility == "public":
        return True
    if villager.contact_visibility == "member" and viewer is not None:
        return True
    return False


# ---------------------------------------------------------------- 家庭


@router.get("/families")
async def list_families(
    db: DbSession,
    q: str | None = None,
    area: str | None = None,
):
    stmt = select(Family).where(Family.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Family.name.like(like), Family.householder.like(like), Family.door_no.like(like)))
    if area:
        stmt = stmt.where(Family.village_area == area)
    stmt = stmt.order_by(Family.sort_order, Family.name)
    families = (await db.execute(stmt)).scalars().all()

    counts = dict(
        (await db.execute(
            select(Villager.family_id, func.count())
            .where(Villager.deleted_at.is_(None), Villager.is_hidden == 0)
            .group_by(Villager.family_id)
        )).all()
    )

    return {
        "data": [family_card(f, int(counts.get(f.id, 0))) for f in families],
        "meta": {"total": len(families), "has_more": False, "next_cursor": None},
    }


@router.get("/families/{family_id}")
async def get_family(family_id: str, db: DbSession):
    family = await get_or_404(db, Family, family_id, "家庭")
    members = (
        await db.execute(select(Villager).where(Villager.family_id == family_id, Villager.deleted_at.is_(None)))
    ).scalars().all()
    members = sorted(members, key=_relation_weight)
    data = family_card(family, len(members))
    data["members"] = [villager_card(m) for m in members]
    return {"data": data}


@router.post("/families", status_code=201)
async def create_family(payload: FamilyCreate, user: StaffUser, db: DbSession):
    family = Family(**payload.model_dump())
    db.add(family)
    await db.commit()
    return {"data": family_card(family, 0)}


@router.patch("/families/{family_id}")
async def update_family(family_id: str, payload: FamilyUpdate, user: StaffUser, db: DbSession):
    family = await get_or_404(db, Family, family_id, "家庭")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(family, key, value)
    await db.commit()
    return {"data": family_card(family, 0)}


@router.delete("/families/{family_id}", status_code=204)
async def delete_family(family_id: str, user: AdminUser, db: DbSession):
    family = await get_or_404(db, Family, family_id, "家庭")
    family.deleted_at = utcnow()
    await db.commit()
    return None


# ---------------------------------------------------------------- 村民


@router.get("/villagers")
async def list_villagers(
    db: DbSession,
    viewer: OptionalUser,
    q: str | None = None,
    family_id: str | None = None,
    generation: str | None = None,
    deceased: bool | None = None,
    limit: int = Query(default=24, ge=1, le=60),
    before_id: str | None = None,
):
    stmt = select(Villager).where(Villager.deleted_at.is_(None))
    if not can(viewer, ROLE_EDITOR):
        stmt = stmt.where(Villager.is_hidden == 0)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Villager.name.like(like), Villager.alias.like(like), Villager.generation.like(like)))
    if family_id:
        stmt = stmt.where(Villager.family_id == family_id)
    if generation:
        stmt = stmt.where(Villager.generation == generation)
    if deceased is not None:
        stmt = stmt.where(Villager.is_deceased == (1 if deceased else 0))

    stmt = with_cursor(stmt, Villager, before_id)
    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    page, meta = pack(rows, limit)

    families = {}
    family_ids = {v.family_id for v in page if v.family_id}
    if family_ids:
        for family in (await db.execute(select(Family).where(Family.id.in_(family_ids)))).scalars():
            families[family.id] = family

    return {
        "data": [villager_card(v, families.get(v.family_id or ""), _can_see_contact(viewer, v)) for v in page],
        "meta": meta,
    }


@router.get("/villagers/{villager_id}")
async def get_villager(villager_id: str, db: DbSession, viewer: OptionalUser):
    villager = await get_or_404(db, Villager, villager_id, "村民")
    if villager.is_hidden and not can(viewer, ROLE_EDITOR):
        raise PermissionError_("该名片未公开")

    family = await db.get(Family, villager.family_id) if villager.family_id else None
    data = villager_card(villager, family, _can_see_contact(viewer, villager))

    relations = (
        await db.execute(
            select(VillagerRelation).where(
                or_(VillagerRelation.from_id == villager_id, VillagerRelation.to_id == villager_id)
            )
        )
    ).scalars().all()
    related_ids = {r.to_id if r.from_id == villager_id else r.from_id for r in relations}
    related = {}
    if related_ids:
        for item in (await db.execute(select(Villager).where(Villager.id.in_(related_ids)))).scalars():
            related[item.id] = item
    data["relations"] = [
        {
            "relation": r.relation,
            "villager": villager_card(related[r.to_id if r.from_id == villager_id else r.from_id])
            if (r.to_id if r.from_id == villager_id else r.from_id) in related
            else None,
        }
        for r in relations
    ]

    media_rows = (
        await db.execute(
            select(Media)
            .where(
                Media.deleted_at.is_(None),
                Media.status == "ready",
                Media.visibility == VIS_PUBLIC,
                Media.villager_ids.like(f"%{villager_id}%"),
            )
            .order_by(Media.id.desc())
            .limit(12)
        )
    ).scalars().all()
    data["photos"] = [
        {"id": m.id, "title": m.title, "urls": media_urls(m), "width": m.width, "height": m.height}
        for m in media_rows
    ]

    if villager.user_id:
        posts = (
            await db.execute(
                select(Post)
                .where(Post.author_id == villager.user_id, Post.status == "published", Post.deleted_at.is_(None))
                .order_by(Post.id.desc())
                .limit(6)
            )
        ).scalars().all()
        author = await db.get(User, villager.user_id)
        data["posts"] = [post_card(p, author) for p in posts]
    else:
        data["posts"] = []

    data["photo_count"] = len(media_rows)
    return {"data": data}


@router.post("/villagers", status_code=201)
async def create_villager(payload: VillagerCreate, user: StaffUser, db: DbSession):
    data = payload.model_dump()
    data["is_deceased"] = 1 if data.get("is_deceased") else 0
    villager = Villager(**data)
    db.add(villager)
    await db.commit()
    family = await db.get(Family, villager.family_id) if villager.family_id else None
    return {"data": villager_card(villager, family, True)}


@router.patch("/villagers/{villager_id}")
async def update_villager(villager_id: str, payload: VillagerUpdate, user: CurrentUser, db: DbSession):
    villager = await get_or_404(db, Villager, villager_id, "村民")
    owner = villager.user_id == user.id
    if not owner and not can(user, ROLE_EDITOR):
        raise PermissionError_("只能编辑自己的名片")
    changes = payload.model_dump(exclude_unset=True)
    if "is_deceased" in changes:
        changes["is_deceased"] = 1 if changes["is_deceased"] else 0
    if "is_hidden" in changes:
        changes["is_hidden"] = 1 if changes["is_hidden"] else 0
    if owner and not can(user, ROLE_EDITOR):
        for blocked in ("family_id", "is_hidden", "sort_order", "is_deceased"):
            changes.pop(blocked, None)
    for key, value in changes.items():
        setattr(villager, key, value)
    await db.commit()
    family = await db.get(Family, villager.family_id) if villager.family_id else None
    return {"data": villager_card(villager, family, True)}


@router.delete("/villagers/{villager_id}", status_code=204)
async def delete_villager(villager_id: str, user: AdminUser, db: DbSession):
    villager = await get_or_404(db, Villager, villager_id, "村民")
    villager.deleted_at = utcnow()
    await db.commit()
    return None


@router.post("/villagers/{villager_id}/relations", status_code=201)
async def add_relation(villager_id: str, payload: RelationCreate, user: StaffUser, db: DbSession):
    await get_or_404(db, Villager, villager_id, "村民")
    target = await get_or_404(db, Villager, payload.to_id, "关联村民")
    exists = (
        await db.execute(
            select(VillagerRelation.id).where(
                VillagerRelation.from_id == villager_id,
                VillagerRelation.to_id == payload.to_id,
                VillagerRelation.relation == payload.relation,
            )
        )
    ).scalar_one_or_none()
    if exists:
        return {"data": {"ok": True}}
    db.add(
        VillagerRelation(
            from_id=villager_id,
            to_id=payload.to_id,
            relation=payload.relation,
            created_at=utcnow(),
        )
    )
    await db.commit()
    return {"data": {"ok": True, "name": target.name}}


# ---------------------------------------------------------------- 村史时间轴


@router.get("/timeline")
async def list_timeline(db: DbSession, category: str | None = None):
    stmt = select(TimelineEvent)
    if category:
        stmt = stmt.where(TimelineEvent.category == category)
    stmt = stmt.order_by(
        func.coalesce(TimelineEvent.sort_year, 9999), TimelineEvent.sort_order, TimelineEvent.id
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "data": [
            {
                "id": e.id,
                "year_label": e.year_label,
                "sort_year": e.sort_year,
                "title": e.title,
                "description": e.description,
                "image_url": e.image_url,
                "category": e.category,
                "post_id": e.post_id,
                "sort_order": e.sort_order,
            }
            for e in rows
        ],
        "meta": {"total": len(rows)},
    }


@router.post("/timeline", status_code=201)
async def create_timeline(payload: TimelineCreate, user: StaffUser, db: DbSession):
    event = TimelineEvent(**payload.model_dump())
    db.add(event)
    await db.commit()
    return {"data": {"id": event.id}}


@router.patch("/timeline/{event_id}")
async def update_timeline(event_id: str, payload: TimelineUpdate, user: StaffUser, db: DbSession):
    event = await get_or_404(db, TimelineEvent, event_id, "时间轴节点")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    await db.commit()
    return {"data": {"id": event.id}}


@router.delete("/timeline/{event_id}", status_code=204)
async def delete_timeline(event_id: str, user: StaffUser, db: DbSession):
    event = await get_or_404(db, TimelineEvent, event_id, "时间轴节点")
    await db.delete(event)
    await db.commit()
    return None


@router.post("/timeline/reorder")
async def reorder_timeline(payload: dict, user: StaffUser, db: DbSession):
    ids: list[str] = payload.get("ids") or []
    for index, event_id in enumerate(ids):
        event = await db.get(TimelineEvent, event_id)
        if event is not None:
            event.sort_order = index
    await db.commit()
    return {"data": {"ok": True}}
