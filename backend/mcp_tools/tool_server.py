"""
MCP Tool Server — built with FastMCP.
Defines 5 generic, domain-agnostic platform tools available to all registered agents.
"""
import json
import uuid
import datetime
import structlog

from fastmcp import FastMCP

from db.mongo_client import get_db
from vectorstore.faiss_store import search_similar, add_document  # noqa: F401  (add_document used elsewhere)
from core.llm_router import chat_completion

logger = structlog.get_logger(__name__)

mcp = FastMCP(
    name="AIger's Universe Tool Server",
)


def register_all_tools() -> None:
    """Log all registered MCP tools at startup."""
    try:
        # FastMCP 2.x: tools are registered via decorator; list via the manager
        tool_names = list(getattr(mcp, "_tool_manager", None).tools.keys()) if hasattr(mcp, "_tool_manager") else []
    except Exception:
        tool_names = ["semantic_search", "document_store", "rules_engine_check", "risk_scorer", "trigger_hitl"]
    logger.info("mcp.tools.registered", tools=tool_names, count=len(tool_names))


# ── Direct callable wrappers (used by agents executing inside the workflow engine) ──
# These mirror the @mcp.tool registrations so agent code can call them in-process
# without going through MCP transport. The same function bodies are exposed both ways.

async def semantic_search_impl(query: str, top_k: int = 5) -> dict:
    """Search indexed documents using FAISS semantic similarity."""
    logger.info("tool.semantic_search.called", query=query[:100], top_k=top_k)
    top_k = min(max(int(top_k), 1), 20)
    results = await search_similar(query=query, top_k=top_k)
    return {"results": results, "count": len(results)}


async def document_store_impl(action: str, collection: str, data: dict | None = None, query: dict | None = None, limit: int = 50) -> dict:
    """Generic MongoDB CRUD for agent-owned structured data."""
    logger.info("tool.document_store.called", action=action, collection=collection)
    safe_collection = f"agent_data_{collection}"
    db = get_db()

    if action == "store":
        if not data:
            raise ValueError("'data' field is required when action='store'")
        doc = {**data, "_doc_id": str(uuid.uuid4()), "_stored_at": datetime.datetime.utcnow().isoformat()}
        await db[safe_collection].insert_one(doc)
        return {"success": True, "id": doc["_doc_id"]}

    if action == "retrieve":
        docs = await db[safe_collection].find(query or {}, {"_id": 0}).limit(limit).to_list(limit)
        return {"success": True, "data": docs, "count": len(docs)}

    raise ValueError(f"Invalid action '{action}'. Must be 'store' or 'retrieve'.")


async def rules_engine_check_impl(text: str, rule_category: str | None = None, policy_ids: list[str] | None = None) -> dict:
    """Check text against governance rules in MongoDB via LLM reasoning."""
    logger.info("tool.rules_engine.called", category=rule_category, text_length=len(text))
    db = get_db()
    query_filter: dict = {}
    if policy_ids:
        query_filter["rule_id"] = {"$in": policy_ids}
    if rule_category:
        query_filter["applicable_to"] = {"$in": [rule_category, "all"]}

    rules = await db.governance_rules.find(query_filter, {"_id": 0}).to_list(100)
    if not rules:
        return {"matched_rules": [], "overall_status": "PASS", "note": "No rules found"}

    llm_response = await chat_completion(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a compliance expert. Check the provided text against the given rules. "
                    "Return ONLY valid JSON: "
                    "{\"matched_rules\": [{\"rule_id\": str, \"rule_name\": str, \"severity\": str, "
                    "\"is_violated\": bool, \"reason\": str}], \"overall_status\": \"PASS\"|\"FAIL\"|\"REVIEW\"}"
                ),
            },
            {"role": "user", "content": f"TEXT TO CHECK:\n{text[:3000]}\n\nRULES:\n{json.dumps(rules, default=str)}"},
        ],
        caller="rules_engine_tool",
        response_format={"type": "json_object"},
    )
    try:
        return json.loads(llm_response["content"])
    except json.JSONDecodeError as exc:
        logger.error("tool.rules_engine.json_parse_failed", error=str(exc))
        raise ValueError("LLM returned malformed JSON from rules engine check") from exc


async def policy_library_search_impl(query: str, policy_ids: list[str] | None = None, limit: int = 5) -> dict:
    """Search the stored policy library for matching rules or uploaded policy text."""
    db = get_db()
    mongo_query: dict = {}
    if policy_ids:
        mongo_query["rule_id"] = {"$in": policy_ids}
    docs = await db.governance_rules.find(mongo_query, {"_id": 0}).to_list(500)
    q = query.lower().strip()
    scored = []
    for doc in docs:
        haystack = " ".join([
            doc.get("rule_name", ""),
            doc.get("description", ""),
            doc.get("guidance", ""),
            doc.get("uploaded_text", ""),
        ]).lower()
        score = haystack.count(q) if q else 0
        if q in haystack or not q:
            scored.append((score, doc))
    scored.sort(key=lambda item: item[0], reverse=True)
    matches = [{
        "rule_id": doc["rule_id"],
        "rule_name": doc.get("rule_name"),
        "severity": doc.get("severity"),
        "category": doc.get("category"),
        "description": doc.get("description"),
        "guidance": doc.get("guidance", ""),
    } for _, doc in scored[: max(1, min(limit, 20))]]
    return {"matches": matches, "count": len(matches)}


async def risk_scorer_impl(text: str, context: str = "") -> dict:
    """Score text for risk level using LLM reasoning."""
    logger.info("tool.risk_scorer.called", text_length=len(text))
    llm_response = await chat_completion(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior risk assessment expert. Score the text for business and operational risk. "
                    "Return ONLY valid JSON: "
                    "{\"risk_score\": int 0-10, \"risk_level\": \"RED\"|\"AMBER\"|\"GREEN\", "
                    "\"rationale\": str, \"key_concerns\": [str]}. "
                    "RED = score > 7, AMBER = 4-7, GREEN = < 4."
                ),
            },
            {"role": "user", "content": f"CONTENT:\n{text[:3000]}\n\nCONTEXT:\n{context[:500] if context else 'None'}"},
        ],
        caller="risk_scorer_tool",
        response_format={"type": "json_object"},
    )
    try:
        result = json.loads(llm_response["content"])
        result["tokens_used"] = llm_response["tokens_used"]
        return result
    except json.JSONDecodeError as exc:
        logger.error("tool.risk_scorer.json_parse_failed", error=str(exc))
        raise ValueError("LLM returned malformed JSON from risk scorer") from exc


async def trigger_hitl_impl(
    workflow_run_id: str,
    agent_name: str,
    reason: str,
    severity: str,
    context: dict | None = None,
) -> dict:
    """Pause workflow and create a HITL record awaiting human review."""
    if severity not in ("HIGH", "MEDIUM", "LOW"):
        raise ValueError(f"severity must be HIGH/MEDIUM/LOW, got '{severity}'")

    db = get_db()
    hitl_id = str(uuid.uuid4())
    run = await db.workflow_runs.find_one({"run_id": workflow_run_id}, {"_id": 0, "owner_user_id": 1})
    record = {
        "hitl_id": hitl_id,
        "workflow_run_id": workflow_run_id,
        "owner_user_id": (run or {}).get("owner_user_id"),
        "agent_name": agent_name,
        "reason": reason,
        "severity": severity,
        "context": context or {},
        "status": "pending",
        "human_note": "",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "resolved_at": None,
    }
    await db.hitl_records.insert_one(record)
    await db.workflow_runs.update_one(
        {"run_id": workflow_run_id},
        {"$set": {"status": "paused", "hitl_id": hitl_id, "updated_at": datetime.datetime.utcnow().isoformat()}},
    )
    logger.info("tool.trigger_hitl.paused", hitl_id=hitl_id, workflow_run_id=workflow_run_id)
    return {"hitl_id": hitl_id, "status": "paused", "message": f"Workflow paused — awaiting {severity} approval"}


# ── MCP Tool registrations (exposed via FastApiMCP /mcp endpoint) ──

@mcp.tool
async def semantic_search(query: str, top_k: int = 5) -> dict:
    """Search indexed documents using semantic similarity via FAISS vector store."""
    return await semantic_search_impl(query=query, top_k=top_k)


@mcp.tool
async def document_store(action: str, collection: str, data: dict | None = None, query: dict | None = None, limit: int = 50) -> dict:
    """Generic MongoDB document store for agents (action='store' or 'retrieve')."""
    return await document_store_impl(action=action, collection=collection, data=data, query=query, limit=limit)


@mcp.tool
async def rules_engine_check(text: str, rule_category: str | None = None, policy_ids: list[str] | None = None) -> dict:
    """Check text against governance rules in MongoDB. Returns violations and overall status."""
    return await rules_engine_check_impl(text=text, rule_category=rule_category, policy_ids=policy_ids)


@mcp.tool
async def risk_scorer(text: str, context: str = "") -> dict:
    """Score any text for risk level (RED/AMBER/GREEN) with rationale and key concerns."""
    return await risk_scorer_impl(text=text, context=context)


@mcp.tool
async def policy_library_search(query: str, policy_ids: list[str] | None = None, limit: int = 5) -> dict:
    """Search uploaded and stored policy rules to support redlining and compliance review."""
    return await policy_library_search_impl(query=query, policy_ids=policy_ids, limit=limit)


@mcp.tool
async def trigger_hitl(workflow_run_id: str, agent_name: str, reason: str, severity: str, context: dict | None = None) -> dict:
    """Pause workflow execution and create a Human-in-the-Loop approval request."""
    return await trigger_hitl_impl(
        workflow_run_id=workflow_run_id,
        agent_name=agent_name,
        reason=reason,
        severity=severity,
        context=context,
    )


# Registry used by the workflow engine to invoke tools in-process by name
TOOL_REGISTRY = {
    "semantic_search": semantic_search_impl,
    "document_store": document_store_impl,
    "rules_engine_check": rules_engine_check_impl,
    "policy_library_search": policy_library_search_impl,
    "risk_scorer": risk_scorer_impl,
    "trigger_hitl": trigger_hitl_impl,
}
