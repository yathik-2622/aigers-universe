"""
Structured execution tracer.
Persists every agent execution to MongoDB agent_traces for the observability dashboard.
"""
import datetime
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)


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

    # Rough cost estimate ($2.50 per 1M input + $10 per 1M output tokens for gpt-4o)
    total_tokens = totals.get("total_tokens", 0) or 0
    estimated_cost = round((total_tokens / 1_000_000) * 6.25, 4)  # blended

    return {
        "total_runs": total_runs,
        "total_traces": total_traces,
        "total_tokens": total_tokens,
        "avg_latency_ms": round(totals.get("avg_latency_ms") or 0.0, 2),
        "estimated_cost_usd": estimated_cost,
        "per_agent": per_agent,
        "timeline": timeline,
    }
