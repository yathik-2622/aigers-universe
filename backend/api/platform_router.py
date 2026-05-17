"""
Platform API router — agent registration, listing, retrieval, update, invocation.
"""
import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from db.repositories.agent_repo import AgentRepository
from core.agent_registry import invoke_agent_by_id

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = AgentRepository()

VALID_FRAMEWORKS = {"langgraph", "crewai", "langchain"}


class RegisterAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    framework: str = Field(..., description="langgraph | crewai | langchain")
    description: str = Field(default="")
    system_prompt: str = Field(..., min_length=10)
    tools: list[str] = Field(default_factory=list)
    hitl_enabled: bool = Field(default=False)


class InvokeAgentRequest(BaseModel):
    input_data: dict = Field(...)
    workflow_run_id: str = Field(default="direct_invoke")


@router.post("/agents", status_code=status.HTTP_201_CREATED)
async def register_agent(request: RegisterAgentRequest):
    if request.framework not in VALID_FRAMEWORKS:
        raise HTTPException(status_code=422, detail=f"Invalid framework. Must be one of: {VALID_FRAMEWORKS}")
    try:
        agent_id = await repo.create(request.model_dump())
        logger.info("api.agent.registered", agent_id=agent_id, name=request.name)
        return {"agent_id": agent_id, "name": request.name, "status": "active"}
    except Exception as exc:
        logger.error("api.agent.register_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to register agent")


@router.get("/agents")
async def list_agents():
    agents = await repo.list_all()
    return {"agents": agents, "count": len(agents)}


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    agent = await repo.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, updates: dict):
    updated = await repo.update(agent_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return updated


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_agent(agent_id: str):
    success = await repo.deactivate(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")


@router.post("/agents/{agent_id}/invoke")
async def invoke_agent(agent_id: str, request: InvokeAgentRequest):
    agent = await repo.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    try:
        result = await invoke_agent_by_id(
            agent_config=agent,
            input_data=request.input_data,
            workflow_run_id=request.workflow_run_id,
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
