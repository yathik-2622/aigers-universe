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

    # FAISS vector store
    FAISS_INDEX_PATH: str = Field(default="/app/backend/vectorstore/data/faiss_index")

    # HITL
    HITL_TIMEOUT_SECONDS: int = Field(default=300)

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Singleton — import this everywhere
settings = Settings()
