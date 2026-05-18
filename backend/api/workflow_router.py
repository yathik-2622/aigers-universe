"""
Workflow API router — create workflow definitions and execute them.
"""
import asyncio
import json
import uuid
import datetime
import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from db.mongo_client import get_db
from core.request_context import get_optional_user_id
from core.workflow_engine import build_and_run_workflow, resume_workflow_run
from a2a.agent_communication import get_a2a_messages

logger = structlog.get_logger(__name__)
router = APIRouter()


class CreateWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    agents: list[str] = Field(..., description="Ordered list of agent_ids")
    input_type: str = Field(default="document")
    policy_ids: list[str] = Field(default_factory=list)
    canvas: dict = Field(default_factory=dict, description="ReactFlow nodes+edges JSON for restoring the canvas")

    @field_validator("agents")
    @classmethod
    def at_least_two_agents(cls, v):
        if len(v) < 2:
            raise ValueError("Workflow must have at least 2 agents")
        return v


class RunWorkflowRequest(BaseModel):
    input_data: dict = Field(...)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_workflow(request: Request, body: CreateWorkflowRequest):
    db = get_db()
    workflow_id = str(uuid.uuid4())
    doc = {
        "workflow_id": workflow_id,
        **body.model_dump(),
        "owner_user_id": get_optional_user_id(request),
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    await db.workflow_definitions.insert_one(doc)
    logger.info("api.workflow.created", workflow_id=workflow_id, name=body.name)
    return {"workflow_id": workflow_id, "name": body.name}


@router.get("")
async def list_workflows(request: Request):
    db = get_db()
    query = {}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    workflows = await db.workflow_definitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"workflows": workflows, "count": len(workflows)}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request):
    db = get_db()
    query = {"workflow_id": workflow_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    wf = await db.workflow_definitions.find_one(query, {"_id": 0})
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    return wf


@router.post("/{workflow_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_workflow(workflow_id: str, request: Request, body: RunWorkflowRequest):
    db = get_db()
    query = {"workflow_id": workflow_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    wf = await db.workflow_definitions.find_one(query)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    try:
        run_id = await build_and_run_workflow(workflow_id=workflow_id, input_data=body.input_data, owner_user_id=user_id)
        return {"run_id": run_id, "status": "running"}
    except Exception as exc:
        logger.error("api.workflow.run_failed", workflow_id=workflow_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start workflow: {exc}")


@router.get("/runs/all")
async def list_all_runs(request: Request, limit: int = 50):
    db = get_db()
    query = {}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    runs = await db.workflow_runs.find(query, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
    return {"runs": runs, "count": len(runs)}


@router.get("/runs/{run_id}")
async def get_run_status(run_id: str, request: Request):
    db = get_db()
    query = {"run_id": run_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    # Attach A2A messages live
    run["a2a_messages"] = await get_a2a_messages(workflow_run_id=run_id)
    return run


@router.get("/runs/{run_id}/report")
async def get_run_report(run_id: str, request: Request):
    db = get_db()
    query = {"run_id": run_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    if run["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Run status is '{run['status']}' — report not ready")
    return {
        "run_id": run_id,
        "status": run["status"],
        "report": run.get("final_output", {}),
        "outputs_by_agent": run.get("outputs_by_agent", {}),
        "markdown": run.get("report_markdown", ""),
        "structured": run.get("report_structured", {}),
        "pii_findings": run.get("pii_findings", []),
        "failure_reason": run.get("failure_reason"),
    }


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, request: Request):
    db = get_db()
    query = {"run_id": run_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    try:
        return await resume_workflow_run(run_id)
    except Exception as exc:
        logger.error("api.workflow.resume_failed", run_id=run_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to resume workflow: {exc}")



@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request):
    """
    Server-Sent Events stream of run state.

    Emits a JSON `data:` event whenever the run document or its A2A message
    count changes. Closes the connection once the run reaches a terminal
    state (`completed` or `failed`). Browser EventSource consumers receive
    instant push updates with no polling.
    """
    db = get_db()

    async def event_generator():
        last_payload: str | None = None
        idle_loops = 0
        max_idle_loops = 600  # ~5 min @ 500ms — guards against orphaned streams

        while True:
            query = {"run_id": run_id}
            user_id = get_optional_user_id(request)
            if user_id:
                query["owner_user_id"] = user_id
            run = await db.workflow_runs.find_one(query, {"_id": 0})
            if not run:
                yield f"event: error\ndata: {json.dumps({'error': 'run not found'})}\n\n"
                return

            run["a2a_messages"] = await get_a2a_messages(workflow_run_id=run_id)
            payload = json.dumps(run, default=str)

            if payload != last_payload:
                yield f"data: {payload}\n\n"
                last_payload = payload
                idle_loops = 0
            else:
                idle_loops += 1

            # Close stream when terminal
            if run.get("status") in ("completed", "failed"):
                yield f"event: end\ndata: {json.dumps({'status': run['status']})}\n\n"
                return

            if idle_loops > max_idle_loops:
                yield "event: timeout\ndata: {}\n\n"
                return

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
