from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PM System"
    app_env: str = "development"
    api_prefix: str = "/api"
    sqlite_path: Path = Path("data/pmsystem.db")
    auto_create_schema: bool = True
    orchestrator_api_base: str = "http://localhost:8100/api"
    common_volume_root: Path
    attachments_relative_path: Path
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_prefix="PMSYSTEM_",
        env_file=".env",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.sqlite_path}"

    @property
    def attachments_root(self) -> Path:
        return self.common_volume_root / self.attachments_relative_path


@lru_cache
def get_settings() -> Settings:
    return Settings()
