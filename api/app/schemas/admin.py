from typing import Any, Literal

from pydantic import Field

from app.schemas.common import RequestModel


class SettingItem(RequestModel):
    key: str
    value: Any


class SettingsPatch(RequestModel):
    items: list[SettingItem] = Field(min_length=1, max_length=100)


class UserApproveRequest(RequestModel):
    role: Literal["member", "editor", "admin"] | None = None


class UserRejectRequest(RequestModel):
    reason: str | None = Field(default=None, max_length=200)


class UserRoleRequest(RequestModel):
    role: Literal["member", "editor", "admin", "super_admin"]


class InviteCreateRequest(RequestModel):
    code: str | None = Field(default=None, max_length=64)
    max_uses: int = Field(default=1, ge=1, le=10000)
    auto_approve: bool = False
    note: str | None = Field(default=None, max_length=200)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class SensitiveWordCreate(RequestModel):
    word: str = Field(min_length=1, max_length=40)
    level: int = Field(default=2, ge=1, le=3)


class ReportResolveRequest(RequestModel):
    action: Literal["hide", "ignore", "warn"] = "ignore"
    note: str | None = Field(default=None, max_length=300)


class ResetPasswordRequest(RequestModel):
    new_password: str | None = Field(default=None, min_length=8, max_length=72)


class BatchIdsRequest(RequestModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class NotificationReadRequest(RequestModel):
    ids: list[str] | None = None


class UserStatusRequest(RequestModel):
    status: Literal["active", "disabled", "pending"]


class ReviewRequest(RequestModel):
    action: Literal["approve", "reject"] = "approve"
    note: str | None = Field(default=None, max_length=300)
