"""
Observability API router.
"""
import structlog
from fastapi import APIRouter, HTTPException, Query, Request

from core.request_context import get_optional_user_id
from db.mongo_client import get_db
from observability.tracer import estimate_trace_costs, get_aggregate_metrics
from core.runtime_settings import discover_models_for_user

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/metrics")
async def get_metrics(request: Request):
    return await get_aggregate_metrics(get_optional_user_id(request))


@router.get("/traces")
async def get_traces(
    request: Request,
    workflow_run_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    db = get_db()
    query: dict = {}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    if workflow_run_id:
        query["workflow_run_id"] = workflow_run_id
    traces = await db.agent_traces.find(query, {"_id": 0, "full_output": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    runtime_catalog = await discover_models_for_user(user_id)
    annotated_traces, unknown_cost_trace_count = estimate_trace_costs(traces, runtime_catalog)
    return {"traces": annotated_traces, "count": len(annotated_traces), "unknown_cost_trace_count": unknown_cost_trace_count}


@router.get("/traces/{workflow_run_id}/full")
async def get_full_trace(workflow_run_id: str, request: Request):
    db = get_db()
    query = {"workflow_run_id": workflow_run_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    traces = await db.agent_traces.find(query, {"_id": 0}).sort("step_number", 1).to_list(100)
    if not traces:
        raise HTTPException(status_code=404, detail=f"No traces for run '{workflow_run_id}'")
    return {"workflow_run_id": workflow_run_id, "traces": traces}
