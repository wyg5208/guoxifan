from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = API_DIR.parent


class Settings(BaseSettings):
    """应用配置。所有字段均可由同名大写环境变量覆盖（见 .env.example）。"""

    model_config = SettingsConfigDict(
        env_file=(str(API_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_name: str = "过溪畈 · 老村记忆"
    secret_key: str = "dev-only-secret-change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    database_url: str = "sqlite+aiosqlite:///./village.db"
    media_root: str = "./media"
    public_base_url: str = "http://127.0.0.1:8000"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    admin_init_email: str = "admin@village.local"
    admin_init_password: str = "Village@2026"
    admin_init_nickname: str = "村长"

    max_image_mb: int = 20
    max_video_mb: int = 500
    max_file_mb: int = 100
    user_storage_quota_gb: float = 5.0

    ffmpeg_path: str = "ffmpeg"
    video_transcode_enabled: bool = True

    log_level: str = "INFO"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def media_path(self) -> Path:
        return Path(self.media_root).expanduser().resolve()

    @property
    def derived_path(self) -> Path:
        return self.media_path / "derived"

    @property
    def upload_path(self) -> Path:
        return self.media_path / "uploads"

    @property
    def video_path(self) -> Path:
        return self.media_path / "videos"

    @property
    def attachment_path(self) -> Path:
        return self.media_path / "attachments"

    @property
    def staging_path(self) -> Path:
        return self.media_path / "staging"

    def ensure_dirs(self) -> None:
        for path in (
            self.media_path,
            self.derived_path,
            self.upload_path,
            self.video_path,
            self.attachment_path,
            self.staging_path,
        ):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
