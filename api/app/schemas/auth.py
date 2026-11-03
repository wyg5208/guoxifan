from pydantic import Field, model_validator

from app.schemas.common import RequestModel


class VillagerBrief(RequestModel):
    name: str = Field(min_length=1, max_length=60)
    family_id: str | None = None
    relation_to_head: str | None = None
    gender: str | None = "unknown"
    generation: str | None = None


class RegisterRequest(RequestModel):
    email: str | None = None
    phone: str | None = None
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(min_length=2, max_length=20)
    invite_code: str | None = None
    villager: VillagerBrief | None = None

    @model_validator(mode="after")
    def _require_contact(self) -> "RegisterRequest":
        if not self.email and not self.phone:
            raise ValueError("邮箱和手机号至少填一个")
        return self


class LoginRequest(RequestModel):
    account: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(RequestModel):
    refresh_token: str


class LogoutRequest(RequestModel):
    refresh_token: str | None = None


class ChangePasswordRequest(RequestModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=72)


class ProfileUpdateRequest(RequestModel):
    nickname: str | None = Field(default=None, min_length=2, max_length=20)
    avatar_url: str | None = None
    bio: str | None = Field(default=None, max_length=500)
