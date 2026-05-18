"""
MCP Tool Server — built with FastMCP.
Defines 5 generic, domain-agnostic platform tools available to all registered agents.
"""
import json
import uuid
import datetime
import re
import structlog
import httpx
from urllib.parse import quote_plus, unquote, urlparse

from fastmcp import FastMCP

from a2a.agent_communication import dispatch_remote_agent, fetch_remote_agent_card
from config import settings
from db.mongo_client import get_db
from vectorstore.faiss_store import search_similar, add_document  # noqa: F401  (add_document used elsewhere)
from core.llm_router import chat_completion

logger = structlog.get_logger(__name__)

mcp = FastMCP(
    name="AIger's Universe Tool Server",
)

OFFICIAL_DOCS_PROVIDERS = {
    "java": {"label": "Oracle Java", "domains": ["docs.oracle.com"]},
    "python": {"label": "Python", "domains": ["docs.python.org"]},
    "spring": {"label": "Spring", "domains": ["docs.spring.io", "spring.io"]},
    "dotnet": {"label": ".NET", "domains": ["learn.microsoft.com"]},
}


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


async def knowledge_base_search_impl(query: str, top_k: int = 5) -> dict:
    """Alias for semantic search positioned as a reusable knowledge-base tool."""
    result = await semantic_search_impl(query=query, top_k=top_k)
    return {"matches": result["results"], "count": result["count"], "source": "knowledge_base"}


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


async def wikipedia_search_impl(query: str, limit: int = 5) -> dict:
    """Search Wikipedia for official-ish encyclopedia context."""
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "opensearch",
                "search": query,
                "limit": max(1, min(limit, 10)),
                "namespace": 0,
                "format": "json",
            },
        )
        response.raise_for_status()
        payload = response.json()
    titles = payload[1] if len(payload) > 1 else []
    descriptions = payload[2] if len(payload) > 2 else []
    links = payload[3] if len(payload) > 3 else []
    results = []
    for idx, title in enumerate(titles):
        results.append({
            "title": title,
            "description": descriptions[idx] if idx < len(descriptions) else "",
            "url": links[idx] if idx < len(links) else "",
        })
    return {"results": results, "count": len(results)}


async def weather_current_impl(latitude: float, longitude: float, timezone: str = "auto") -> dict:
    """Fetch current weather from Open-Meteo without an API key."""
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": ["temperature_2m", "relative_humidity_2m", "precipitation", "wind_speed_10m", "weather_code"],
                "timezone": timezone,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return {
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "timezone": payload.get("timezone"),
        "current": payload.get("current", {}),
        "units": payload.get("current_units", {}),
    }


async def openweather_current_impl(latitude: float, longitude: float, units: str = "metric") -> dict:
    """Fetch current weather from OpenWeather using API key."""
    if not settings.OPENWEATHER_API_KEY.strip():
        raise ValueError("OPENWEATHER_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": latitude,
                "lon": longitude,
                "appid": settings.OPENWEATHER_API_KEY,
                "units": units,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return payload


async def serpapi_search_impl(query: str, num: int = 5, location: str | None = None) -> dict:
    """Fetch live Google-style search results through SerpAPI."""
    if not settings.SERPAPI_KEY.strip():
        raise ValueError("SERPAPI_KEY is not configured")
    params = {
        "engine": "google",
        "q": query,
        "api_key": settings.SERPAPI_KEY,
        "num": max(1, min(num, 10)),
    }
    if location:
        params["location"] = location
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        response = await client.get("https://serpapi.com/search.json", params=params)
        response.raise_for_status()
        payload = response.json()
    results = []
    for item in payload.get("organic_results", [])[: max(1, min(num, 10))]:
        results.append({
            "title": item.get("title", ""),
            "link": item.get("link", ""),
            "snippet": item.get("snippet", ""),
            "source": item.get("source", ""),
        })
    return {"results": results, "count": len(results), "search_information": payload.get("search_information", {})}


async def webpage_fetch_impl(url: str, max_chars: int = 5000) -> dict:
    """Fetch a web page and return a cleaned text excerpt."""
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "AIGERS-Universe/1.0"})
        response.raise_for_status()
        html = response.text
    cleaned = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return {"url": url, "content": cleaned[:max(200, min(max_chars, 15000))], "content_length": len(cleaned)}


def _decode_duckduckgo_href(href: str) -> str:
    match = re.search(r"uddg=([^&]+)", href)
    return unquote(match.group(1)) if match else href


async def official_docs_search_impl(provider: str, query: str, max_results: int = 5, fetch_excerpts: bool = True) -> dict:
    provider_key = (provider or "").strip().lower()
    if provider_key not in OFFICIAL_DOCS_PROVIDERS:
        raise ValueError(f"Unsupported provider '{provider}'. Must be one of {sorted(OFFICIAL_DOCS_PROVIDERS)}")
    config = OFFICIAL_DOCS_PROVIDERS[provider_key]
    max_results = max(1, min(max_results, settings.OFFICIAL_DOCS_MAX_RESULTS))
    search_query = " OR ".join([f"site:{domain}" for domain in config["domains"]]) + f" {query}"
    search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_query)}"

    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        response = await client.get(search_url, headers={"User-Agent": "AIGERS-Universe/1.0"})
        response.raise_for_status()
        html = response.text

    matches = re.findall(
        r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)</a>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    results = []
    for href, raw_title, raw_snippet in matches:
        url = _decode_duckduckgo_href(href)
        host = urlparse(url).netloc.lower()
        if not any(domain in host for domain in config["domains"]):
            continue
        title = re.sub(r"<[^>]+>", "", raw_title).strip()
        snippet = re.sub(r"<[^>]+>", "", raw_snippet)
        item = {
            "title": title,
            "url": url,
            "snippet": re.sub(r"\s+", " ", snippet).strip(),
            "provider": provider_key,
        }
        if fetch_excerpts:
            try:
                fetched = await webpage_fetch_impl(url=url, max_chars=1800)
                item["excerpt"] = fetched.get("content", "")
            except Exception as exc:
                logger.warning("tool.official_docs_fetch_excerpt_failed", provider=provider_key, url=url, error=str(exc))
        results.append(item)
        if len(results) >= max_results:
            break

    return {"provider": provider_key, "provider_label": config["label"], "query": query, "results": results, "count": len(results)}


async def java_docs_search_impl(query: str, max_results: int = 5) -> dict:
    return await official_docs_search_impl(provider="java", query=query, max_results=max_results)


async def python_docs_search_impl(query: str, max_results: int = 5) -> dict:
    return await official_docs_search_impl(provider="python", query=query, max_results=max_results)


async def spring_docs_search_impl(query: str, max_results: int = 5) -> dict:
    return await official_docs_search_impl(provider="spring", query=query, max_results=max_results)


async def dotnet_docs_search_impl(query: str, max_results: int = 5) -> dict:
    return await official_docs_search_impl(provider="dotnet", query=query, max_results=max_results)


async def remote_agent_discover_impl(agent_card_url: str) -> dict:
    return {"agent_card_url": agent_card_url, "card": await fetch_remote_agent_card(agent_card_url)}


async def remote_agent_dispatch_impl(
    agent_card_url: str,
    input_data: dict,
    workflow_run_id: str,
    from_agent: str,
    message_type: str = "delegation",
) -> dict:
    return await dispatch_remote_agent(
        agent_card_url=agent_card_url,
        input_data=input_data,
        workflow_run_id=workflow_run_id,
        from_agent=from_agent,
        message_type=message_type,
    )


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
async def knowledge_base_search(query: str, top_k: int = 5) -> dict:
    """Search uploaded workspace documents as a reusable knowledge base."""
    return await knowledge_base_search_impl(query=query, top_k=top_k)


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
async def wikipedia_search(query: str, limit: int = 5) -> dict:
    """Search Wikipedia for quick background and reference links."""
    return await wikipedia_search_impl(query=query, limit=limit)


@mcp.tool
async def webpage_fetch(url: str, max_chars: int = 5000) -> dict:
    """Fetch and clean a web page into plain text for downstream reasoning."""
    return await webpage_fetch_impl(url=url, max_chars=max_chars)


@mcp.tool
async def weather_current(latitude: float, longitude: float, timezone: str = "auto") -> dict:
    """Fetch current weather from Open-Meteo."""
    return await weather_current_impl(latitude=latitude, longitude=longitude, timezone=timezone)


@mcp.tool
async def openweather_current(latitude: float, longitude: float, units: str = "metric") -> dict:
    """Fetch current weather from OpenWeather using API key."""
    return await openweather_current_impl(latitude=latitude, longitude=longitude, units=units)


@mcp.tool
async def serpapi_search(query: str, num: int = 5, location: str | None = None) -> dict:
    """Fetch live search results using SerpAPI."""
    return await serpapi_search_impl(query=query, num=num, location=location)


@mcp.tool
async def policy_library_search(query: str, policy_ids: list[str] | None = None, limit: int = 5) -> dict:
    """Search uploaded and stored policy rules to support redlining and compliance review."""
    return await policy_library_search_impl(query=query, policy_ids=policy_ids, limit=limit)


@mcp.tool
async def official_docs_search(provider: str, query: str, max_results: int = 5) -> dict:
    """Search official documentation sources for languages and frameworks."""
    return await official_docs_search_impl(provider=provider, query=query, max_results=max_results)


@mcp.tool
async def java_docs_search(query: str, max_results: int = 5) -> dict:
    """Search official Oracle Java documentation."""
    return await java_docs_search_impl(query=query, max_results=max_results)


@mcp.tool
async def python_docs_search(query: str, max_results: int = 5) -> dict:
    """Search official Python documentation."""
    return await python_docs_search_impl(query=query, max_results=max_results)


@mcp.tool
async def spring_docs_search(query: str, max_results: int = 5) -> dict:
    """Search official Spring documentation."""
    return await spring_docs_search_impl(query=query, max_results=max_results)


@mcp.tool
async def dotnet_docs_search(query: str, max_results: int = 5) -> dict:
    """Search official .NET documentation."""
    return await dotnet_docs_search_impl(query=query, max_results=max_results)


@mcp.tool
async def remote_agent_discover(agent_card_url: str) -> dict:
    """Fetch a remote A2A agent card over HTTP."""
    return await remote_agent_discover_impl(agent_card_url=agent_card_url)


@mcp.tool
async def remote_agent_dispatch(agent_card_url: str, input_data: dict, workflow_run_id: str, from_agent: str, message_type: str = "delegation") -> dict:
    """Dispatch a payload to a remote A2A agent over HTTP."""
    return await remote_agent_dispatch_impl(
        agent_card_url=agent_card_url,
        input_data=input_data,
        workflow_run_id=workflow_run_id,
        from_agent=from_agent,
        message_type=message_type,
    )


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
    "knowledge_base_search": knowledge_base_search_impl,
    "document_store": document_store_impl,
    "rules_engine_check": rules_engine_check_impl,
    "policy_library_search": policy_library_search_impl,
    "risk_scorer": risk_scorer_impl,
    "wikipedia_search": wikipedia_search_impl,
    "webpage_fetch": webpage_fetch_impl,
    "weather_current": weather_current_impl,
    "openweather_current": openweather_current_impl,
    "serpapi_search": serpapi_search_impl,
    "official_docs_search": official_docs_search_impl,
    "java_docs_search": java_docs_search_impl,
    "python_docs_search": python_docs_search_impl,
    "spring_docs_search": spring_docs_search_impl,
    "dotnet_docs_search": dotnet_docs_search_impl,
    "remote_agent_discover": remote_agent_discover_impl,
    "remote_agent_dispatch": remote_agent_dispatch_impl,
    "trigger_hitl": trigger_hitl_impl,
}

TOOL_METADATA = {
    "semantic_search": {"description": "Search indexed uploaded documents using vector similarity.", "category": "knowledge"},
    "knowledge_base_search": {"description": "Search your uploaded workspace knowledge base with semantic retrieval.", "category": "knowledge"},
    "document_store": {"description": "Store and retrieve structured agent-side data in Mongo.", "category": "memory"},
    "rules_engine_check": {"description": "Check text against governance rules and produce PASS/FAIL/REVIEW results.", "category": "governance"},
    "policy_library_search": {"description": "Search uploaded governance and policy material.", "category": "governance"},
    "risk_scorer": {"description": "Score text for business and compliance risk.", "category": "analysis"},
    "wikipedia_search": {"description": "Search Wikipedia for background context and reference links.", "category": "web"},
    "webpage_fetch": {"description": "Fetch a webpage and return cleaned text content.", "category": "web"},
    "weather_current": {"description": "Fetch current weather from Open-Meteo using latitude and longitude.", "category": "realtime"},
    "openweather_current": {"description": "Fetch current weather from OpenWeather using a configured API key.", "category": "realtime"},
    "serpapi_search": {"description": "Fetch live search-engine results through SerpAPI using a configured API key.", "category": "web"},
    "official_docs_search": {"description": "Search official docs for Java, Python, Spring, and .NET.", "category": "research"},
    "java_docs_search": {"description": "Search Oracle Java documentation.", "category": "research"},
    "python_docs_search": {"description": "Search official Python documentation.", "category": "research"},
    "spring_docs_search": {"description": "Search official Spring documentation.", "category": "research"},
    "dotnet_docs_search": {"description": "Search official .NET documentation.", "category": "research"},
    "remote_agent_discover": {"description": "Fetch a remote A2A agent card over HTTP.", "category": "a2a"},
    "remote_agent_dispatch": {"description": "Dispatch work to a remote A2A agent over HTTP.", "category": "a2a"},
    "trigger_hitl": {"description": "Pause a workflow for human approval.", "category": "control"},
}
