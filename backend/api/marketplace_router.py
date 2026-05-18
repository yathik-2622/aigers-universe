"""
Agent Marketplace API router.
"""
import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.request_context import get_optional_user_id
from db.mongo_client import get_db
from db.repositories.agent_repo import AgentRepository

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = AgentRepository()


class InstallTemplateRequest(BaseModel):
    custom_name: str | None = Field(default=None)
    custom_system_prompt: str | None = Field(default=None)


@router.get("/templates")
async def list_templates(request: Request, search: str | None = Query(default=None)):
    db = get_db()
    user_id = get_optional_user_id(request)
    query: dict = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    templates = await db.marketplace_templates.find(query, {"_id": 0}).to_list(100)
    if user_id:
        installed = await db.agents.find({"owner_user_id": user_id, "status": "active", "template_id": {"$exists": True}}, {"_id": 0, "template_id": 1, "agent_id": 1}).to_list(500)
        installed_map = {row["template_id"]: row["agent_id"] for row in installed}
        for tpl in templates:
            tpl["installed"] = tpl["template_id"] in installed_map
            tpl["installed_agent_id"] = installed_map.get(tpl["template_id"])
    else:
        for tpl in templates:
            tpl["installed"] = False
            tpl["installed_agent_id"] = None
    return {"templates": templates, "count": len(templates)}


@router.post("/templates/{template_id}/install", status_code=201)
async def install_template(template_id: str, request: Request, body: InstallTemplateRequest):
    """
    Install a marketplace template as a new registered agent.

    Idempotent for the default case: if `custom_name` and `custom_system_prompt`
    are both omitted and an active agent already exists for this template,
    the existing agent_id is returned (HTTP 200) instead of creating a duplicate.
    Pass `custom_name` or `custom_system_prompt` to explicitly create a new
    variant copy.
    """
    db = get_db()
    tpl = await db.marketplace_templates.find_one({"template_id": template_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    user_id = get_optional_user_id(request)
    is_default_install = not body.custom_name and not body.custom_system_prompt

    # Idempotency check — only when caller is not customising the install
    if is_default_install:
        existing = await db.agents.find_one(
            {"template_id": template_id, "status": "active", "owner_user_id": user_id},
            {"_id": 0, "agent_id": 1, "name": 1},
        )
        if existing:
            logger.info("api.marketplace.install_idempotent", template_id=template_id, agent_id=existing["agent_id"])
            return {
                "agent_id": existing["agent_id"],
                "name": existing["name"],
                "message": f"Template '{tpl['name']}' already installed",
                "already_installed": True,
            }

    agent_data = {
        "name": body.custom_name or tpl["name"],
        "framework": tpl["framework"],
        "description": tpl["description"],
        "system_prompt": body.custom_system_prompt or tpl["default_system_prompt"],
        "model_name": tpl.get("default_model_name", "gpt-4o"),
        "tools": tpl.get("suggested_tools", []),
        "hitl_enabled": tpl.get("hitl_enabled", False),
        "template_id": template_id,
        "owner_user_id": user_id,
    }
    agent_id = await repo.create(agent_data)
    return {
        "agent_id": agent_id,
        "name": agent_data["name"],
        "message": f"Installed '{tpl['name']}'",
        "already_installed": False,
    }
