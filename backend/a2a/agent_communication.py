"""
A2A (Agent-to-Agent) communication for AIger's Universe.
Wraps python-a2a AgentCard/AgentSkill for capability description, and uses MongoDB
as the persistent message broker for inter-agent communication audit trail.
"""
import uuid
import datetime
import structlog
import httpx
from urllib.parse import urljoin

try:
    from python_a2a import AgentCard, AgentSkill  # noqa: F401  (capability descriptors)
    _A2A_AVAILABLE = True
except ImportError:
    _A2A_AVAILABLE = False

from config import settings
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

VALID_MESSAGE_TYPES = {"result", "context", "delegation", "alert"}


def build_agent_card(agent_name: str, agent_description: str, agent_skills: list[dict], endpoint_url: str) -> dict:
    """Build an A2A AgentCard describing this agent's capabilities."""
    if _A2A_AVAILABLE:
        try:
            skills = [AgentSkill(name=s["name"], description=s["description"]) for s in agent_skills]
            card = AgentCard(name=agent_name, description=agent_description, url=endpoint_url, skills=skills)
            # Return as dict for serialisation
            return {
                "name": card.name,
                "description": card.description,
                "url": card.url,
                "skills": [{"name": s.name, "description": s.description} for s in card.skills],
            }
        except Exception as exc:
            logger.warning("a2a.agent_card.build_failed", error=str(exc))
    # Fallback dict (still valid A2A-compatible card structure)
    return {
        "name": agent_name,
        "description": agent_description,
        "url": endpoint_url,
        "skills": agent_skills,
    }


async def send_a2a_message(
    from_agent: str,
    to_agent: str,
    message_type: str,
    payload: dict,
    workflow_run_id: str,
    correlation_id: str | None = None,
) -> dict:
    """Send an A2A protocol message between agents and persist for audit."""
    if message_type not in VALID_MESSAGE_TYPES:
        raise ValueError(f"Invalid message_type '{message_type}'. Must be one of {VALID_MESSAGE_TYPES}")

    db = get_db()
    message_id = str(uuid.uuid4())
    message_doc = {
        "message_id": message_id,
        "workflow_run_id": workflow_run_id,
        "from_agent": from_agent,
        "to_agent": to_agent,
        "message_type": message_type,
        "payload": payload,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
    await db.a2a_messages.insert_one(message_doc)
    logger.info(
        "a2a.message.sent",
        from_agent=from_agent,
        to_agent=to_agent,
        message_type=message_type,
        workflow_run_id=workflow_run_id,
    )
    # Strip ObjectId before returning
    return {k: v for k, v in message_doc.items() if k != "_id"}


async def get_a2a_messages(workflow_run_id: str, to_agent: str | None = None) -> list[dict]:
    """Retrieve A2A messages for a workflow run."""
    db = get_db()
    query: dict = {"workflow_run_id": workflow_run_id}
    if to_agent:
        query["to_agent"] = to_agent
    return await db.a2a_messages.find(query, {"_id": 0}).sort("timestamp", 1).to_list(500)


async def get_latest_a2a_message(workflow_run_id: str, from_agent: str) -> dict | None:
    """Get the latest message a given agent sent in a run."""
    db = get_db()
    msgs = await (
        db.a2a_messages
        .find({"workflow_run_id": workflow_run_id, "from_agent": from_agent}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(1)
        .to_list(1)
    )
    return msgs[0] if msgs else None


def _a2a_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if settings.A2A_SHARED_SECRET.strip():
        headers["X-AIGERS-A2A-SECRET"] = settings.A2A_SHARED_SECRET.strip()
    return headers


async def fetch_remote_agent_card(agent_card_url: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(agent_card_url, headers=_a2a_headers())
        response.raise_for_status()
        return response.json()


async def dispatch_remote_agent(
    agent_card_url: str,
    input_data: dict,
    workflow_run_id: str,
    from_agent: str,
    message_type: str = "delegation",
) -> dict:
    card = await fetch_remote_agent_card(agent_card_url)
    invoke_url = card.get("invoke_url") or urljoin(agent_card_url, "./invoke")
    payload = {
        "from_agent": from_agent,
        "message_type": message_type,
        "workflow_run_id": workflow_run_id,
        "input_data": input_data,
        "agent_card": card,
    }
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.post(invoke_url, json=payload, headers=_a2a_headers())
        response.raise_for_status()
        result = response.json()
    await send_a2a_message(
        from_agent=from_agent,
        to_agent=card.get("name", agent_card_url),
        message_type=message_type,
        payload={"remote_dispatch": payload, "remote_result": result},
        workflow_run_id=workflow_run_id,
    )
    return {"agent_card": card, "invoke_url": invoke_url, "result": result}
