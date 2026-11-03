"""内容审核：敏感词三级（1 提示 / 2 进审 / 3 拒绝），带 60s 内存缓存。"""

import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import SensitiveWord

_LEVEL_OK = 0
_cache: dict[str, object] = {"at": 0.0, "words": []}
_TTL = 60.0


async def _load(db: AsyncSession) -> list[tuple[str, int]]:
    now = time.time()
    if now - float(_cache["at"]) < _TTL:
        return _cache["words"]  # type: ignore[return-value]
    rows = (await db.execute(select(SensitiveWord.word, SensitiveWord.level))).all()
    words = [(row[0], int(row[1])) for row in rows if row[0]]
    _cache["at"] = now
    _cache["words"] = words
    return words


def invalidate_cache() -> None:
    _cache["at"] = 0.0


async def level_of(db: AsyncSession, text: str | None) -> int:
    """返回命中的最高级别：0 通过 / 2 进审 / 3 拒绝。"""
    if not text:
        return _LEVEL_OK
    lowered = text.lower()
    level = _LEVEL_OK
    for word, word_level in await _load(db):
        if word and word.lower() in lowered:
            level = max(level, int(word_level))
    return level


async def review_text(db: AsyncSession, text: str | None) -> tuple[str, str | None]:
    """返回 (status, message)。status: published / pending；命中 3 级直接抛由调用方处理。"""
    level = await level_of(db, text)
    if level >= 3:
        return "blocked", "内容包含不允许发布的词语"
    if level >= 2:
        return "pending", "内容已提交，等待管理员审核后显示"
    return "published", None
