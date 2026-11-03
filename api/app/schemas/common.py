from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, PlainSerializer


def iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDatetime = Annotated[datetime, PlainSerializer(iso_utc, return_type=str, when_used="json")]


class RequestModel(BaseModel):
    """请求体基类：去首尾空白、忽略未知字段（前端多传不算错）。"""

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def meta_of(next_cursor: str | None = None, has_more: bool = False, **extra: Any) -> dict:
    return {"next_cursor": next_cursor, "has_more": has_more, **extra}
