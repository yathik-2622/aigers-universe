"""
Network-facing A2A router.
Exposes local agent cards and a remote-invocation surface for federated agents.
"""
from urllib.parse import urljoin

import structlog
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from a2a.agent_communication import build_agent_card, fetch_remote_agent_card, send_a2a_message
from config import settings
from core.agent_registry import invoke_agent_by_id
from core.request_context import get_optional_user_id
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)
router = APIRouter()


class RemoteInvokeRequest(BaseModel):
    from_agent: str = Field(..., min_length=1)
    message_type: str = Field(default="delegation")
    workflow_run_id: str = Field(..., min_length=1)
    input_data: dict = Field(default_factory=dict)
    agent_card: dict | None = Field(default=None)


class ValidateRemoteCardRequest(BaseModel):
    agent_card_url: str = Field(..., min_length=1)


def _validate_shared_secret(secret: str | None) -> None:
    expected = settings.A2A_SHARED_SECRET.strip()
    if expected and secret != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid A2A shared secret")


def _public_base_url(request: Request) -> str:
    configured = settings.A2A_PUBLIC_BASE_URL.strip()
    if configured:
        return configured.rstrip("/") + "/"
    return str(request.base_url)


def _agent_card_from_doc(agent: dict, request: Request) -> dict:
    base_url = _public_base_url(request)
    card_url = urljoin(base_url, f"api/a2a/agents/{agent['agent_id']}/card")
    invoke_url = urljoin(base_url, f"api/a2a/agents/{agent['agent_id']}/invoke")
    card = build_agent_card(
        agent_name=agent["name"],
        agent_description=agent.get("description", ""),
        agent_skills=[
            {"name": tool_name, "description": f"Can use tool {tool_name}"} for tool_name in agent.get("tools", [])[:12]
        ],
        endpoint_url=card_url,
    )
    card["agent_id"] = agent["agent_id"]
    card["framework"] = agent.get("framework", "langgraph")
    card["invoke_url"] = invoke_url
    card["tools"] = agent.get("tools", [])
    card["tags"] = agent.get("tags", [])
    return card


@router.get("/agents/cards")
async def list_agent_cards(request: Request):
    query = {"status": "active"}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agents = await get_db().agents.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"cards": [_agent_card_from_doc(agent, request) for agent in agents], "count": len(agents)}


@router.get("/agents/{agent_id}/card")
async def get_agent_card(agent_id: str, request: Request):
    query = {"agent_id": agent_id, "status": "active"}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    agent = await get_db().agents.find_one(query, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return _agent_card_from_doc(agent, request)


@router.post("/validate-card")
async def validate_remote_card(body: ValidateRemoteCardRequest):
    try:
        card = await fetch_remote_agent_card(body.agent_card_url.strip())
    except Exception as exc:
        logger.warning("a2a.remote_card.validate_failed", url=body.agent_card_url, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Failed to fetch remote card: {exc}")

    required_fields = ["name", "url"]
    missing_fields = [field for field in required_fields if not card.get(field)]
    if missing_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Remote card is missing required fields: {', '.join(missing_fields)}",
        )

    return {
        "valid": True,
        "card": card,
        "summary": {
            "name": card.get("name"),
            "description": card.get("description", ""),
            "framework": card.get("framework", ""),
            "skills_count": len(card.get("skills", [])),
            "invoke_url": card.get("invoke_url", ""),
        },
    }


@router.post("/agents/{agent_id}/invoke")
async def invoke_agent_remote(
    agent_id: str,
    body: RemoteInvokeRequest,
    request: Request,
    x_aigers_a2a_secret: str | None = Header(default=None),
):
    _validate_shared_secret(x_aigers_a2a_secret)
    agent = await get_db().agents.find_one({"agent_id": agent_id, "status": "active"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    await send_a2a_message(
        from_agent=body.from_agent,
        to_agent=agent["name"],
        message_type=body.message_type,
        payload={"remote_input": body.input_data, "remote_agent_card": body.agent_card or {}},
        workflow_run_id=body.workflow_run_id,
    )
    result = await invoke_agent_by_id(
        agent_config=agent,
        input_data=body.input_data,
        workflow_run_id=body.workflow_run_id,
        step_number=0,
    )
    await send_a2a_message(
        from_agent=agent["name"],
        to_agent=body.from_agent,
        message_type="result",
        payload=result.get("output", {}),
        workflow_run_id=body.workflow_run_id,
    )
    logger.info("a2a.remote_invoke.complete", agent_id=agent_id, from_agent=body.from_agent, workflow_run_id=body.workflow_run_id)
    return {"agent_card": _agent_card_from_doc(agent, request), "result": result}
