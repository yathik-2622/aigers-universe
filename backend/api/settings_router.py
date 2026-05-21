from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from core.request_context import require_user_id
from core.runtime_settings import (
    discover_models_for_user,
    get_user_runtime_settings,
    merge_settings_update,
    sanitize_user_settings,
)
from db.mongo_client import get_db

router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    provider: str = Field(default="gateway")
    base_url: str = Field(default="")
    default_model: str = Field(default="gpt-4o")
    embedding_model: str = Field(default="text-embedding-3-small")
    theme: str = Field(default="dark")
    api_key: str = Field(default="")
    openrouter_api_key: str = Field(default="")
    groq_api_key: str = Field(default="")
    nvidia_api_key: str = Field(default="")
    github_token: str = Field(default="")
    serpapi_key: str = Field(default="")
    openweather_api_key: str = Field(default="")


@router.get("")
async def get_settings(request: Request):
    user_id = require_user_id(request)
    stored = await get_user_runtime_settings(user_id)
    return {
        "settings": {
            "provider": stored.get("provider", "gateway"),
            "base_url": stored.get("base_url", ""),
            "default_model": stored.get("default_model", "gpt-4o"),
            "embedding_model": stored.get("embedding_model", "text-embedding-3-small"),
            "theme": stored.get("theme", "dark"),
            **sanitize_user_settings(stored),
        }
    }


@router.put("")
async def update_settings(request: Request, body: UpdateSettingsRequest):
    user_id = require_user_id(request)
    db = get_db()
    existing = await get_user_runtime_settings(user_id)
    merged = merge_settings_update(existing, body.model_dump())
    merged["user_id"] = user_id
    await db.user_settings.update_one({"user_id": user_id}, {"$set": merged}, upsert=True)
    stored = await get_user_runtime_settings(user_id)
    return {
        "settings": {
            "provider": stored.get("provider", "gateway"),
            "base_url": stored.get("base_url", ""),
            "default_model": stored.get("default_model", "gpt-4o"),
            "embedding_model": stored.get("embedding_model", "text-embedding-3-small"),
            "theme": stored.get("theme", "dark"),
            **sanitize_user_settings(stored),
        }
    }


@router.get("/models")
async def discover_models(request: Request):
    user_id = require_user_id(request)
    return await discover_models_for_user(user_id)
