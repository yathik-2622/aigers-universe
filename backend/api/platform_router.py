"""
Platform API router — agent registration, listing, retrieval, update, invocation.
"""
import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from core.request_context import get_optional_user_id
from db.repositories.agent_repo import AgentRepository
from core.agent_registry import invoke_agent_by_id
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = AgentRepository()

VALID_FRAMEWORKS = {"langgraph", "crewai", "langchain"}
AVAILABLE_MODELS = [
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-chat",
    "gpt-5-mini", "gpt-5-nano", "o3", "o3-mini", "o4-mini", "text-embedding-3-large",
    "text-embedding-3-small", "text-embedding-ada-002", "gpt-image-1.5", "gpt-image-1",
    "gpt-image-1-mini", "gpt-5.4", "gpt-5.4-pro", "gpt-5.3-codex", "phi-4-mini-reasoning",
    "phi-4-multimodal-instruct", "phi-4-reasoning", "amazon-nova-lite", "amazon-nova-micro",
    "amazon-nova-pro", "claude-3.5-haiku", "claude-3.5-sonnet", "claude-3.7-sonnet",
    "claude-3.7-sonnet-thinking", "claude-haiku-4.5", "claude-opus-4.1", "claude-sonnet-4",
    "claude-sonnet-4-thinking", "claude-sonnet-4.5", "cohere-rerank-3.5", "gpt-oss-120b",
    "gpt-oss-20b", "llama-3.1-8b-instruct", "llama-3.2-11b-instruct", "llama-3.2-1b-instruct",
    "llama-3.2-90b-instruct", "llama-3.3-70b-instruct", "llama-4-maverick-17b-instruct",
    "llama-4-scout-17b-instruct", "titan-embed-text-v2", "claude-opus-4.5", "minimax-m2",
    "claude-opus-4.6", "claude-sonnet-4.6", "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash-thinking", "gemini-2.5-pro",
    "gemini-embedding-001", "multimodal-embedding", "text-embedding-005",
    "text-multilingual-embedding-002", "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001",
    "imagen-4.0-fast-generate-001", "gemini-3-flash-preview", "gemini-3-pro-preview",
    "gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview",
]


class RegisterAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    framework: str = Field(..., description="langgraph | crewai | langchain")
    description: str = Field(default="")
    system_prompt: str = Field(..., min_length=10)
    model_name: str = Field(default="gpt-4o")
    tools: list[str] = Field(default_factory=list)
    hitl_enabled: bool = Field(default=False)


class InvokeAgentRequest(BaseModel):
    input_data: dict = Field(...)
    workflow_run_id: str = Field(default="direct_invoke")


@router.post("/agents", status_code=status.HTTP_201_CREATED)
async def register_agent(request: Request, body: RegisterAgentRequest):
    if body.framework not in VALID_FRAMEWORKS:
        raise HTTPException(status_code=422, detail=f"Invalid framework. Must be one of: {VALID_FRAMEWORKS}")
    try:
        agent_id = await repo.create({**body.model_dump(), "owner_user_id": get_optional_user_id(request)})
        logger.info("api.agent.registered", agent_id=agent_id, name=body.name)
        return {"agent_id": agent_id, "name": body.name, "status": "active"}
    except Exception as exc:
        logger.error("api.agent.register_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to register agent")


@router.get("/agents")
async def list_agents(request: Request):
    query = {"status": "active"}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agents = await get_db().agents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"agents": agents, "count": len(agents)}


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, request: Request):
    query = {"agent_id": agent_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agent = await get_db().agents.find_one(query, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, updates: dict, request: Request):
    query = {"agent_id": agent_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    existing = await get_db().agents.find_one(query, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    updated = await repo.update(agent_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return updated


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_agent(agent_id: str, request: Request):
    query = {"agent_id": agent_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    existing = await get_db().agents.find_one(query, {"_id": 0})
    success = bool(existing) and await repo.deactivate(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")


@router.post("/agents/{agent_id}/invoke")
async def invoke_agent(agent_id: str, request: Request, body: InvokeAgentRequest):
    query = {"agent_id": agent_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agent = await get_db().agents.find_one(query, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    try:
        result = await invoke_agent_by_id(
            agent_config=agent,
            input_data=body.input_data,
            workflow_run_id=body.workflow_run_id,
            step_number=0,
        )
        return result
    except Exception as exc:
        logger.error("api.agent.invoke_failed", agent_id=agent_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Agent invocation failed: {exc}")


@router.get("/tools")
async def list_available_tools():
    """List all MCP tool names available on the platform."""
    from mcp_tools.tool_server import TOOL_REGISTRY
    return {"tools": list(TOOL_REGISTRY.keys())}


@router.get("/models")
async def list_available_models():
    return {"models": AVAILABLE_MODELS, "default": "gpt-4o"}



@router.post("/agents/dedupe", status_code=200)
async def dedupe_agents():
    """
    One-shot maintenance: collapse duplicate agents into a single canonical row.

    Steps:
      1. Backfill `template_id` on legacy agents by matching `name` to marketplace_templates.
      2. Group active agents by (template_id, name).
      3. Keep the OLDEST agent in each group active; deactivate the rest.

    Custom variants installed with `custom_name` retain a unique (template_id, name)
    pair and are never collapsed with the default install.
    """
    from db.mongo_client import get_db
    db = get_db()

    # 1) Backfill template_id on legacy rows
    templates = await db.marketplace_templates.find({}, {"_id": 0, "template_id": 1, "name": 1}).to_list(100)
    name_to_template = {t["name"]: t["template_id"] for t in templates}

    backfilled = 0
    async for agent in db.agents.find({"template_id": {"$exists": False}, "status": "active"}, {"_id": 0}):
        tpl_id = name_to_template.get(agent["name"])
        if tpl_id:
            await db.agents.update_one({"agent_id": agent["agent_id"]}, {"$set": {"template_id": tpl_id}})
            backfilled += 1

    # 2) Group + dedupe
    active = await db.agents.find({"status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    groups: dict[tuple, list[str]] = {}
    for a in active:
        key = (a.get("template_id") or f"__custom__::{a['name']}", a["name"], a.get("framework", "langgraph"))
        groups.setdefault(key, []).append(a["agent_id"])

    deactivated_ids: list[str] = []
    kept_ids: list[str] = []
    for ids in groups.values():
        kept_ids.append(ids[0])  # oldest wins
        deactivated_ids.extend(ids[1:])

    if deactivated_ids:
        await db.agents.update_many(
            {"agent_id": {"$in": deactivated_ids}},
            {"$set": {"status": "inactive", "deactivated_reason": "duplicate_cleanup"}},
        )

    logger.info(
        "api.agents.dedupe.complete",
        backfilled=backfilled,
        groups=len(groups),
        deactivated=len(deactivated_ids),
        kept=len(kept_ids),
    )
    return {
        "backfilled_template_ids": backfilled,
        "groups_found": len(groups),
        "agents_kept": len(kept_ids),
        "agents_deactivated": len(deactivated_ids),
    }
