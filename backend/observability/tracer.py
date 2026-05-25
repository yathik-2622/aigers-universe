"""
Structured execution tracer.
Persists every agent execution to MongoDB agent_traces for the observability dashboard.
"""
import datetime
from decimal import Decimal
import structlog
from db.mongo_client import get_db
from core.runtime_settings import discover_models_for_user

logger = structlog.get_logger(__name__)

OFFICIAL_TOKEN_PRICING = {
    "gateway": {
        "gpt-4o": {"prompt": Decimal("2.50"), "cached_prompt": Decimal("1.25"), "completion": Decimal("10.00")},
        "gpt-4o-mini": {"prompt": Decimal("0.15"), "cached_prompt": Decimal("0.075"), "completion": Decimal("0.60")},
        "gpt-4.1": {"prompt": Decimal("2.00"), "cached_prompt": Decimal("0.50"), "completion": Decimal("8.00")},
        "gpt-4.1-mini": {"prompt": Decimal("0.40"), "cached_prompt": Decimal("0.10"), "completion": Decimal("1.60")},
        "gpt-4.1-nano": {"prompt": Decimal("0.10"), "cached_prompt": Decimal("0.025"), "completion": Decimal("0.40")},
        "gpt-5": {"prompt": Decimal("1.25"), "cached_prompt": Decimal("0.125"), "completion": Decimal("10.00")},
        "gpt-5-mini": {"prompt": Decimal("0.25"), "cached_prompt": Decimal("0.025"), "completion": Decimal("2.00")},
        "gpt-5.1": {"prompt": Decimal("1.25"), "cached_prompt": Decimal("0.125"), "completion": Decimal("10.00")},
        "gpt-5.2": {"prompt": Decimal("1.75"), "cached_prompt": Decimal("0.175"), "completion": Decimal("14.00")},
        "gpt-5.4": {"prompt": Decimal("2.50"), "cached_prompt": Decimal("0.25"), "completion": Decimal("15.00")},
        "gpt-5.4-mini": {"prompt": Decimal("0.75"), "cached_prompt": Decimal("0.075"), "completion": Decimal("4.50")},
        "gpt-5.5": {"prompt": Decimal("5.00"), "cached_prompt": Decimal("0.50"), "completion": Decimal("30.00")},
        "o3": {"prompt": Decimal("2.00"), "cached_prompt": Decimal("0.50"), "completion": Decimal("8.00")},
        "o4-mini": {"prompt": Decimal("1.10"), "cached_prompt": Decimal("0.275"), "completion": Decimal("4.40")},
    }
}


def _normalize_model_key(model_name: str | None) -> str:
    value = (model_name or "").strip().lower()
    if not value:
        return ""
    for suffix in (
        "-2025-08-07",
        "-2025-04-16",
        "-2025-04-14",
        "-2024-11-20",
        "-2024-08-06",
        "-2024-07-18",
        "-2024-05-13",
    ):
        if value.endswith(suffix):
            return value[: -len(suffix)]
    for suffix in ("-chat-latest", "-codex", "-codex-max"):
        if value.endswith(suffix):
            return value[: -len(suffix)]
    return value


def _pricing_from_runtime_catalog(runtime_catalog: dict, provider: str, model_name: str) -> dict | None:
    if not runtime_catalog or provider != runtime_catalog.get("provider"):
        return None
    target = _normalize_model_key(model_name)
    for item in runtime_catalog.get("models", []):
        if _normalize_model_key(item.get("id") or item.get("name")) != target:
            continue
        pricing = item.get("pricing") or {}
        prompt = pricing.get("prompt")
        completion = pricing.get("completion")
        if prompt is None or completion is None:
            return None
        return {
            "prompt": Decimal(str(prompt)),
            "cached_prompt": Decimal(str(pricing.get("cached_prompt") or pricing.get("prompt") or "0")),
            "completion": Decimal(str(completion)),
        }
    return None


def _pricing_for_trace(trace: dict, runtime_catalog: dict | None) -> dict | None:
    provider = (trace.get("provider") or "gateway").strip().lower()
    model_key = _normalize_model_key(trace.get("model_name"))
    if not model_key:
        return None
    from_runtime = _pricing_from_runtime_catalog(runtime_catalog or {}, provider, model_key)
    if from_runtime:
        return from_runtime
    return OFFICIAL_TOKEN_PRICING.get(provider, {}).get(model_key)


def _trace_cost_usd(trace: dict, runtime_catalog: dict | None) -> float | None:
    pricing = _pricing_for_trace(trace, runtime_catalog)
    if not pricing:
        return None
    prompt_tokens = Decimal(str(trace.get("prompt_tokens") or 0))
    completion_tokens = Decimal(str(trace.get("completion_tokens") or 0))
    prompt_cost = (prompt_tokens / Decimal("1000000")) * pricing["prompt"]
    completion_cost = (completion_tokens / Decimal("1000000")) * pricing["completion"]
    return float((prompt_cost + completion_cost).quantize(Decimal("0.0000001")))


def estimate_trace_costs(traces: list[dict], runtime_catalog: dict | None) -> tuple[list[dict], int]:
    annotated: list[dict] = []
    unknown_cost_trace_count = 0
    for trace in traces:
        trace_cost = _trace_cost_usd(trace, runtime_catalog)
        if trace_cost is None:
            unknown_cost_trace_count += 1
        annotated.append({**trace, "estimated_cost_usd": trace_cost})
    return annotated, unknown_cost_trace_count


async def record_trace(
    workflow_run_id: str,
    owner_user_id: str | None,
    agent_id: str,
    agent_name: str,
    framework: str,
    step_number: int,
    input_summary: str,
    full_output: dict,
    tokens_used: int,
    prompt_tokens: int,
    completion_tokens: int,
    model_name: str,
    provider: str,
    latency_ms: float,
    tools_called: list[str],
    status: str,
    error: str | None = None,
) -> None:
    """Insert a trace document for a single agent execution."""
    db = get_db()
    trace = {
        "workflow_run_id": workflow_run_id,
        "owner_user_id": owner_user_id,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "framework": framework,
        "step_number": step_number,
        "input_summary": input_summary[:500],
        "full_output": full_output,
        "tokens_used": tokens_used,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "model_name": model_name,
        "provider": provider,
        "latency_ms": latency_ms,
        "tools_called": tools_called,
        "status": status,
        "error": error,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
    try:
        await db.agent_traces.insert_one(trace)
    except Exception as exc:
        logger.error("trace.persist_failed", error=str(exc), exc_info=True)
        raise


async def get_aggregate_metrics(owner_user_id: str | None = None) -> dict:
    """Compute aggregate metrics across all traces for the dashboard."""
    db = get_db()

    # Total counts
    run_query = {"owner_user_id": owner_user_id} if owner_user_id else {}
    trace_query = {"owner_user_id": owner_user_id} if owner_user_id else {}
    total_runs = await db.workflow_runs.count_documents(run_query)
    total_traces = await db.agent_traces.count_documents(trace_query)

    # Token + latency totals via aggregation
    pipeline_totals = [
        {
            "$group": {
                "_id": None,
                "total_tokens": {"$sum": "$tokens_used"},
                "avg_latency_ms": {"$avg": "$latency_ms"},
                "total_latency_ms": {"$sum": "$latency_ms"},
            }
        }
    ]
    totals_cursor = db.agent_traces.aggregate(([{"$match": trace_query}] if trace_query else []) + pipeline_totals)
    totals_list = await totals_cursor.to_list(1)
    totals = totals_list[0] if totals_list else {"total_tokens": 0, "avg_latency_ms": 0.0, "total_latency_ms": 0.0}

    # Per-agent breakdown
    per_agent_pipeline = [
        {
            "$group": {
                "_id": "$agent_name",
                "tokens": {"$sum": "$tokens_used"},
                "avg_latency_ms": {"$avg": "$latency_ms"},
                "execution_count": {"$sum": 1},
            }
        },
        {"$sort": {"tokens": -1}},
    ]
    per_agent_cursor = db.agent_traces.aggregate(([{"$match": trace_query}] if trace_query else []) + per_agent_pipeline)
    per_agent = [
        {
            "agent_name": doc["_id"],
            "tokens": doc["tokens"],
            "avg_latency_ms": round(doc["avg_latency_ms"] or 0.0, 2),
            "execution_count": doc["execution_count"],
        }
        for doc in await per_agent_cursor.to_list(50)
    ]

    # Runs over time (last 30, by date)
    timeline_pipeline = [
        {"$sort": {"started_at": -1}},
        {"$limit": 100},
        {
            "$group": {
                "_id": {"$substr": ["$started_at", 0, 10]},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    timeline = [
        {"date": doc["_id"], "runs": doc["count"]}
        for doc in await db.workflow_runs.aggregate(([{"$match": run_query}] if run_query else []) + timeline_pipeline).to_list(30)
    ]

    runtime_catalog = await discover_models_for_user(owner_user_id)

    trace_docs = await db.agent_traces.find(
        trace_query,
        {"_id": 0, "agent_name": 1, "prompt_tokens": 1, "completion_tokens": 1, "provider": 1, "model_name": 1},
    ).to_list(5000)
    total_cost = Decimal("0")
    cost_by_agent: dict[str, Decimal] = {}
    cost_by_provider: dict[str, Decimal] = {}
    unknown_cost_trace_count = 0
    for trace in trace_docs:
        trace_cost = _trace_cost_usd(trace, runtime_catalog)
        if trace_cost is None:
            unknown_cost_trace_count += 1
            continue
        trace_cost_decimal = Decimal(str(trace_cost))
        total_cost += trace_cost_decimal
        agent_name = trace.get("agent_name") or "Unknown"
        provider = trace.get("provider") or "unknown"
        cost_by_agent[agent_name] = cost_by_agent.get(agent_name, Decimal("0")) + trace_cost_decimal
        cost_by_provider[provider] = cost_by_provider.get(provider, Decimal("0")) + trace_cost_decimal

    total_tokens = totals.get("total_tokens", 0) or 0
    estimated_cost = round(float(total_cost), 6)

    enriched_per_agent = []
    for item in per_agent:
        cost = round(float(cost_by_agent.get(item["agent_name"], Decimal("0"))), 6)
        enriched_per_agent.append({**item, "estimated_cost_usd": cost})

    return {
        "total_runs": total_runs,
        "total_traces": total_traces,
        "total_tokens": total_tokens,
        "avg_latency_ms": round(totals.get("avg_latency_ms") or 0.0, 2),
        "estimated_cost_usd": estimated_cost,
        "per_agent": enriched_per_agent,
        "per_provider_cost": [
            {"provider": provider, "estimated_cost_usd": round(float(cost), 6)}
            for provider, cost in sorted(cost_by_provider.items(), key=lambda item: item[1], reverse=True)
        ],
        "unknown_cost_trace_count": unknown_cost_trace_count,
        "timeline": timeline,
    }
