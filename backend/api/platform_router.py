"""
Platform API router — agent registration, listing, retrieval, update, invocation.
"""
import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from core.agent_code_export import export_agent_code
from core.request_context import get_optional_user_id
from core.runtime_settings import discover_models_for_user
from db.repositories.agent_repo import AgentRepository
from core.agent_registry import invoke_agent_by_id
from core.framework_runners import get_framework_runtime_health
from db.mongo_client import get_db
from mcp_tools.tool_server import TOOL_METADATA, TOOL_REGISTRY, get_all_tool_health

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = AgentRepository()

VALID_FRAMEWORKS = {"langgraph", "crewai", "langchain", "agno"}
class RegisterAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    framework: str = Field(..., description="langgraph | crewai | langchain | agno")
    description: str = Field(default="")
    system_prompt: str = Field(..., min_length=10)
    model_name: str = Field(default="gpt-4o")
    tools: list[str] = Field(default_factory=list)
    hitl_enabled: bool = Field(default=False)
    tags: list[str] = Field(default_factory=list)
    a2a_enabled: bool = Field(default=True)
    a2a_mode: str = Field(default="local", description="local | remote")
    remote_agent_card_url: str = Field(default="")


class InvokeAgentRequest(BaseModel):
    input_data: dict = Field(...)
    workflow_run_id: str = Field(default="direct_invoke")


@router.post("/agents", status_code=status.HTTP_201_CREATED)
async def register_agent(request: Request, body: RegisterAgentRequest):
    if body.framework not in VALID_FRAMEWORKS:
        raise HTTPException(status_code=422, detail=f"Invalid framework. Must be one of: {VALID_FRAMEWORKS}")
    if body.a2a_mode not in {"local", "remote"}:
        raise HTTPException(status_code=422, detail="Invalid a2a_mode. Must be 'local' or 'remote'")
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
    tools = [{"name": name, **TOOL_METADATA.get(name, {})} for name in TOOL_REGISTRY.keys()]
    return {"tools": [tool["name"] for tool in tools], "items": tools}


@router.get("/tools/health")
async def tool_health():
    return await get_all_tool_health()


@router.get("/frameworks/health")
async def framework_health():
    return {"frameworks": get_framework_runtime_health()}


@router.get("/models")
async def list_available_models(request: Request):
    return await discover_models_for_user(get_optional_user_id(request))


@router.get("/marketplace/smoke-test")
async def marketplace_smoke_test():
    db = get_db()
    templates = await db.marketplace_templates.find({}, {"_id": 0}).to_list(1000)
    frameworks = get_framework_runtime_health()
    tool_health = await get_all_tool_health()
    tool_health_by_name = {item["name"]: item for item in tool_health["items"]}
    items = []
    blocking = []

    for template in templates:
        framework = (template.get("framework") or "langgraph").lower()
        template_tools = template.get("suggested_tools", []) or []
        missing_tools = [tool for tool in template_tools if tool not in TOOL_REGISTRY]
        unhealthy_tools = [tool for tool in template_tools if tool_health_by_name.get(tool, {}).get("status") == "unhealthy"]
        framework_health = frameworks.get(framework, {"status": "unhealthy", "native_available": False, "fallback_available": False, "error": "Unknown framework"})
        template_status = "healthy"
        if missing_tools or (framework_health.get("status") == "unhealthy" and not framework_health.get("fallback_available")):
            template_status = "unhealthy"
        elif unhealthy_tools or framework_health.get("status") == "degraded":
            template_status = "degraded"
        item = {
            "template_id": template.get("template_id"),
            "name": template.get("name"),
            "framework": framework,
            "status": template_status,
            "framework_health": framework_health,
            "missing_tools": missing_tools,
            "unhealthy_tools": unhealthy_tools,
            "tools": template_tools,
        }
        items.append(item)
        if template_status == "unhealthy":
            blocking.append(template.get("template_id"))

    return {"count": len(items), "blocking_templates": blocking, "items": items, "frameworks": frameworks, "tool_health": tool_health}


@router.get("/agents/{agent_id}/code")
async def export_agent(agent_id: str, request: Request, framework: str | None = None):
    query = {"agent_id": agent_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agent = await get_db().agents.find_one(query, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    content, ext = export_agent_code(agent, framework)
    media_type = "application/json" if ext == "json" else "text/plain"
    return PlainTextResponse(content, media_type=media_type)



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
