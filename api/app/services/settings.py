"""站点配置：默认项、读写、公开暴露。"""

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ROLE_SUPER_ADMIN, USER_ACTIVE
from app.core.security import hash_password
from app.db.base import utcnow
from app.models.system import SiteSetting
from app.models.user import User

DEFAULTS: list[dict[str, Any]] = [
    # 站点信息
    {"key": "site.title", "value": "过溪畈 · 老村记忆", "type": "string", "group": "site", "label": "站点名称", "public": True},
    {"key": "site.subtitle", "value": "过了溪，就是田畈。", "type": "string", "group": "site", "label": "副标题", "public": True},
    {"key": "site.description", "value": "一条小溪，一片田畈，314 户人家。村子要拆了，我们把照片、名字和故事留在这里。", "type": "string", "group": "site", "label": "站点简介", "public": True},
    {"key": "site.logo_url", "value": "", "type": "string", "group": "site", "label": "Logo 地址", "public": True},
    {"key": "site.hero_images", "value": "[]", "type": "json", "group": "site", "label": "首页大图", "public": True},
    {"key": "site.hero_slogan", "value": "过溪畈", "type": "string", "group": "site", "label": "首页标语", "public": True},
    {"key": "site.founded_year", "value": 0, "type": "number", "group": "site", "label": "建村年份（0 表示待考，不展示）", "public": True},
    {"key": "site.demolition_date", "value": "2026", "type": "string", "group": "site", "label": "拆迁年月（如 2026 或 2026-11）", "public": True},
    {"key": "site.footer_text", "value": "留住记忆，就是留住我们自己的来处。", "type": "string", "group": "site", "label": "页脚文案", "public": True},
    {"key": "site.icp", "value": "", "type": "string", "group": "site", "label": "ICP 备案号", "public": True},
    {"key": "site.share_image", "value": "", "type": "string", "group": "site", "label": "默认分享图", "public": True},
    {"key": "site.theme_color", "value": "#B4793F", "type": "string", "group": "site", "label": "主题色", "public": True},
    # 功能开关
    {"key": "feature.reg_mode", "value": "open", "type": "string", "group": "feature", "label": "注册模式 open/invite/closed", "public": True},
    {"key": "feature.auto_approve", "value": False, "type": "bool", "group": "feature", "label": "新注册自动通过", "public": True},
    {"key": "feature.guest_browse", "value": True, "type": "bool", "group": "feature", "label": "游客可浏览", "public": True},
    {"key": "feature.comment_enabled", "value": True, "type": "bool", "group": "feature", "label": "评论开关", "public": True},
    {"key": "feature.download_original", "value": False, "type": "bool", "group": "feature", "label": "允许下载原图", "public": True},
    {"key": "feature.chat_enabled", "value": True, "type": "bool", "group": "feature", "label": "聊天室开关", "public": True},
    # 审核
    {"key": "moderation.mode", "value": "post_then_review", "type": "string", "group": "moderation", "label": "内容审核模式", "public": False},
    # 联系方式
    {"key": "contact.admin_name", "value": "管理员", "type": "string", "group": "contact", "label": "联系人称呼", "public": True},
    {"key": "contact.admin_phone", "value": "", "type": "string", "group": "contact", "label": "联系电话", "public": True},
]

DEFAULTS_BY_KEY = {item["key"]: item for item in DEFAULTS}


_MISSING = object()


def _try_loads(raw: Any) -> Any:
    """能解就解，解不动返回 _MISSING（和「真的是空数组」区分开）。"""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return _MISSING
    # 历史数据里出现过 "\"[]\"" 这种双层编码，多剥一层
    if isinstance(data, str):
        try:
            return json.loads(data)
        except (TypeError, ValueError):
            return _MISSING
    return data


def decode(row: SiteSetting) -> Any:
    raw = row.value
    if row.value_type == "bool":
        return str(raw).lower() in {"true", "1", "yes", "on"}
    if row.value_type == "number":
        try:
            return int(raw)
        except (TypeError, ValueError):
            try:
                return float(raw)
            except (TypeError, ValueError):
                return 0
    if row.value_type == "json":
        parsed = _try_loads(raw)
        return [] if parsed is _MISSING else parsed
    return raw


def encode(value: Any, value_type: str) -> str:
    if value_type == "json":
        if isinstance(value, str):
            # 表单可能直接回传 JSON 文本或单个地址，两种都收下
            text = value.strip()
            if not text:
                return "[]"
            parsed = _try_loads(text)
            return json.dumps(parsed if parsed is not _MISSING else [text], ensure_ascii=False)
        return json.dumps(value, ensure_ascii=False)
    if value_type == "bool":
        return "true" if value else "false"
    if value is None:
        return ""
    return str(value)


async def load_all(db: AsyncSession) -> list[SiteSetting]:
    rows = (await db.execute(select(SiteSetting))).scalars().all()
    return list(rows)


async def get_public_config(db: AsyncSession) -> dict[str, dict[str, Any]]:
    rows = await load_all(db)
    result: dict[str, dict[str, Any]] = {"site": {}, "feature": {}, "contact": {}}
    for row in rows:
        if not row.is_public:
            continue
        group, _, name = row.key.partition(".")
        if group in result:
            result[group][name] = decode(row)
    return result


async def get_feature(db: AsyncSession) -> dict[str, Any]:
    config = await get_public_config(db)
    return config.get("feature", {})


async def get_settings_map(db: AsyncSession) -> dict[str, Any]:
    rows = await load_all(db)
    return {row.key: decode(row) for row in rows}


async def ensure_seed(db: AsyncSession, admin_email: str, admin_password: str, admin_nickname: str) -> None:
    existing = {row.key for row in await load_all(db)}
    now = utcnow()
    for item in DEFAULTS:
        if item["key"] in existing:
            continue
        db.add(
            SiteSetting(
                key=item["key"],
                value=encode(item["value"], item["type"]),
                value_type=item["type"],
                group_name=item["group"],
                label=item["label"],
                description=None,
                is_public=1 if item["public"] else 0,
                updated_at=now,
            )
        )

    has_super = (
        await db.execute(select(User.id).where(User.role == ROLE_SUPER_ADMIN).limit(1))
    ).scalar_one_or_none()
    if has_super is None:
        db.add(
            User(
                email=admin_email.lower(),
                password_hash=hash_password(admin_password),
                nickname=admin_nickname,
                role=ROLE_SUPER_ADMIN,
                status=USER_ACTIVE,
            )
        )
    await db.commit()
