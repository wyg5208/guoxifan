"""响应序列化：统一把 ORM 对象转成前端契约结构。"""

import json
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import USER_ACTIVE
from app.models.chat import Attachment, Message, Room
from app.models.content import Album, Media, Post
from app.models.user import User
from app.models.village import Family, Villager
from app.schemas.common import iso_utc


def dt(value) -> str | None:
    return iso_utc(value) if value else None


def _json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []


async def fetch_users(db: AsyncSession, ids: Iterable[str]) -> dict[str, User]:
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    rows = (await db.execute(select(User).where(User.id.in_(wanted)))).scalars().all()
    return {row.id: row for row in rows}


def user_brief(user: User | None) -> dict | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "role": user.role,
    }


def permissions_of(user: User) -> dict:
    return {
        "can_write": user.status == USER_ACTIVE,
        "is_staff": user.role in {"editor", "admin", "super_admin"},
        "is_admin": user.role in {"admin", "super_admin"},
        "is_super": user.role == "super_admin",
    }


def user_self(user: User) -> dict:
    # 登录、/me、改资料都走这一个壳，前端才能始终拿到 permissions
    return {
        **user_brief(user),
        "email": user.email,
        "phone": user.phone,
        "bio": user.bio,
        "status": user.status,
        "villager_id": user.villager_id,
        "created_at": dt(user.created_at),
        "permissions": permissions_of(user),
    }


def family_brief(family: Family | None) -> dict | None:
    if family is None:
        return None
    return {
        "id": family.id,
        "name": family.name,
        "householder": family.householder,
        "village_area": family.village_area,
        "door_no": family.door_no,
        "cover_url": family.cover_url,
    }


def family_card(family: Family, member_count: int = 0) -> dict:
    return {
        **family_brief(family),
        "address_text": family.address_text,
        "map_x": family.map_x,
        "map_y": family.map_y,
        "lat": family.lat,
        "lng": family.lng,
        "intro": family.intro,
        "relocated_at": family.relocated_at,
        "current_loc": family.current_loc,
        "sort_order": family.sort_order,
        "member_count": member_count,
        "created_at": dt(family.created_at),
    }


def villager_card(villager: Villager, family: Family | None = None, include_contact: bool = False) -> dict:
    return {
        "id": villager.id,
        "name": villager.name,
        "alias": villager.alias,
        "gender": villager.gender,
        "generation": villager.generation,
        "relation_to_head": villager.relation_to_head,
        "birth_date": villager.birth_date,
        "death_date": villager.death_date,
        "is_deceased": bool(villager.is_deceased),
        "avatar_url": villager.avatar_url,
        "occupation": villager.occupation,
        "intro": villager.intro,
        "family": family_brief(family),
        "family_id": villager.family_id,
        "contact": villager.contact if include_contact else None,
        "contact_visibility": villager.contact_visibility,
        "user_id": villager.user_id,
        "sort_order": villager.sort_order,
    }


def media_urls(media: Media) -> dict[str, str | None]:
    base = f"/media/derived/{media.id}"
    if media.status != "ready":
        return {}
    if media.kind == "image":
        return {
            "thumb": f"{base}/thumb.webp",
            "small": f"{base}/small.webp",
            "medium": f"{base}/medium.webp",
            "original": f"{base}/original.webp",
            "lqip": f"{base}/lqip.webp",
        }
    derived: dict = {}
    if media.derived:
        try:
            parsed = json.loads(media.derived)
            derived = parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            derived = {}
    return {
        "poster": f"{base}/{derived['poster']}" if derived.get("poster") else None,
        "hls": f"{base}/{derived['hls']}" if derived.get("hls") else None,
        "mp4": f"{base}/{derived['fallback']}" if derived.get("fallback") else None,
        "original": f"/api/v1/media/{media.id}/original",
    }


def media_card(
    media: Media,
    uploader: User | None = None,
    album: Album | None = None,
    *,
    liked: bool = False,
    favorited: bool = False,
) -> dict:
    return {
        "id": media.id,
        "kind": media.kind,
        "title": media.title,
        "caption": media.caption,
        "era": media.era,
        "tags": _json_list(media.tags),
        "status": media.status,
        "width": media.width,
        "height": media.height,
        "duration_sec": media.duration_sec,
        "taken_at": dt(media.taken_at),
        "urls": media_urls(media),
        "album": {"id": album.id, "title": album.title} if album else None,
        "album_id": media.album_id,
        "villager_ids": _json_list(media.villager_ids),
        "visibility": media.visibility,
        "like_count": media.like_count,
        "favorite_count": media.favorite_count,
        "comment_count": media.comment_count,
        "view_count": media.view_count,
        "is_liked": liked,
        "is_favorited": favorited,
        "uploader": user_brief(uploader),
        "uploader_id": media.uploader_id,
        "created_at": dt(media.created_at),
    }


def post_card(
    post: Post,
    author: User | None = None,
    *,
    liked: bool = False,
    favorited: bool = False,
    with_content: bool = False,
) -> dict:
    data: dict[str, Any] = {
        "id": post.id,
        "kind": post.kind,
        "title": post.title,
        "summary": post.summary,
        "cover_url": post.cover_url,
        "images": _json_list(post.images),
        "author": user_brief(author),
        "author_id": post.author_id,
        "category": post.category,
        "status": post.status,
        "visibility": post.visibility,
        "is_pinned": bool(post.is_pinned),
        "is_featured": bool(post.is_featured),
        "like_count": post.like_count,
        "favorite_count": post.favorite_count,
        "comment_count": post.comment_count,
        "view_count": post.view_count,
        "is_liked": liked,
        "is_favorited": favorited,
        "published_at": dt(post.published_at or post.created_at),
        "created_at": dt(post.created_at),
    }
    if with_content:
        data["content"] = post.content
        data["content_html"] = post.content_html
    return data


def album_card(album: Album, sample: list[Media] | None = None) -> dict:
    return {
        "id": album.id,
        "title": album.title,
        "description": album.description,
        "cover_url": album.cover_url or (media_urls(sample[0]).get("thumb") if sample else None),
        "era": album.era,
        "visibility": album.visibility,
        "sort_order": album.sort_order,
        "media_count": album.media_count,
        "samples": [media_urls(m).get("thumb") for m in (sample or [])[:3]],
        "created_at": dt(album.created_at),
    }


def comment_card(comment, author: User | None, replies: list | None = None) -> dict:
    return {
        "id": comment.id,
        "target_type": comment.target_type,
        "target_id": comment.target_id,
        "parent_id": comment.parent_id,
        "root_id": comment.root_id,
        "content": comment.content,
        "author": user_brief(author),
        "like_count": comment.like_count,
        "reply_count": comment.reply_count,
        "replies": replies or [],
        "created_at": dt(comment.created_at),
    }


def attachment_card(att: Attachment | None) -> dict | None:
    if att is None:
        return None
    return {
        "id": att.id,
        "kind": att.kind,
        "filename": att.filename,
        "mime": att.mime,
        "size": att.size_bytes,
        "url": att.url,
        "width": att.width,
        "height": att.height,
        "duration_sec": att.duration_sec,
    }


def message_card(
    message: Message,
    sender: User | None,
    attachment: Attachment | None = None,
    reply: dict | None = None,
) -> dict:
    return {
        "id": message.id,
        "room_id": message.room_id,
        "seq": message.seq,
        "sender": user_brief(sender),
        "sender_id": message.sender_id,
        "kind": message.kind,
        "content": message.content,
        "attachment": attachment_card(attachment),
        "reply_to": reply,
        "status": message.status,
        "created_at": dt(message.created_at),
    }


def room_card(room: Room, unread: int = 0, member_count: int = 0, peer: dict | None = None) -> dict:
    return {
        "id": room.id,
        "type": room.type,
        "name": room.name,
        "avatar_url": room.avatar_url,
        "description": room.description,
        "is_public": bool(room.is_public),
        "owner_id": room.owner_id,
        "last_seq": room.last_seq,
        "last_message_at": dt(room.last_message_at),
        "last_message_preview": room.last_message_preview,
        "unread": unread,
        "member_count": member_count,
        "peer": peer,
        "created_at": dt(room.created_at),
    }


def notification_card(n) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "target_type": n.target_type,
        "target_id": n.target_id,
        "is_read": bool(n.is_read),
        "created_at": dt(n.created_at),
    }
