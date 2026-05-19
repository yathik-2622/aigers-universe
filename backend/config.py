"""
Application settings loaded from environment variables via pydantic-settings.
All configuration for AIger's Universe lives here — never import os.getenv() elsewhere.
"""
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """Pydantic-settings model that reads from .env file and environment variables."""

    # LLM Gateway (OpenAI-compatible endpoint)
    LLM_BASE_URL: str = Field(default="https://api.ai-gateway.tigeranalytics.com")
    LLM_API_KEY: str = Field(default="")
    LLM_MODEL: str = Field(default="gpt-4o")
    EMBEDDING_MODEL: str = Field(default="text-embedding-3-small")

    # MongoDB — uses Emergent-protected env var names
    MONGO_URL: str = Field(default="mongodb://localhost:27017")
    MONGO_URL_FALLBACK: str = Field(default="")
    DB_NAME: str = Field(default="aigers_universe")

    # Application
    APP_HOST: str = Field(default="0.0.0.0")
    APP_PORT: int = Field(default=8001)
    CORS_ORIGINS: str = Field(default="*")
    LOG_LEVEL: str = Field(default="INFO")
    LOG_JSON_FORMAT: bool = Field(default=False)
    JWT_SECRET: str = Field(default="change-me-super-secret")
    JWT_EXPIRES_HOURS: int = Field(default=12)
    ADMIN_EMAILS: str = Field(default="")
    GITHUB_TOKEN: str = Field(default="")
    SERPAPI_KEY: str = Field(default="")
    OPENWEATHER_API_KEY: str = Field(default="")
    A2A_SHARED_SECRET: str = Field(default="")
    A2A_PUBLIC_BASE_URL: str = Field(default="")
    OFFICIAL_DOCS_MAX_RESULTS: int = Field(default=5)

    # FAISS vector store
    FAISS_INDEX_PATH: str = Field(default=str(BASE_DIR / "vectorstore" / "data" / "faiss_index"))

    # HITL
    HITL_TIMEOUT_SECONDS: int = Field(default=300)

    # Workflow input governance
    WORKFLOW_INPUT_RETENTION_DAYS: int = Field(default=7)
    WORKFLOW_INPUT_MAX_FILES: int = Field(default=6)
    WORKFLOW_INPUT_MAX_TOTAL_BYTES: int = Field(default=50 * 1024 * 1024)
    WORKFLOW_INPUT_MAX_TEXT_CHARS: int = Field(default=120000)
    CHAT_INPUT_MAX_FILES: int = Field(default=10)
    CHAT_INPUT_MAX_TOTAL_BYTES: int = Field(default=50 * 1024 * 1024)
    CHAT_INPUT_MAX_TEXT_CHARS: int = Field(default=160000)

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Singleton — import this everywhere
settings = Settings()
