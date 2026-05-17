"""
HITL manager — coordinates pause/resume of LangGraph workflows.
Uses MongoDB as the resume signal store. The workflow_engine polls the DB
for HITL state transitions when a workflow is paused.

LangGraph interrupt() + Command(resume=...) flow:
  1. Workflow engine compiles graph with InMemorySaver checkpointer.
  2. When an HITL-enabled node runs and the agent calls trigger_hitl tool,
     a hitl_record is created (status=pending) and the workflow_run is marked paused.
  3. The engine's executor waits (polling MongoDB) until the record is approved/rejected.
  4. approve_hitl / reject_hitl update the record and the engine resumes.
"""
import datetime
import structlog
from hitl import resume_signals  # in-process event broker
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)


async def approve_hitl(hitl_id: str, note: str = "") -> dict:
    """Approve a pending HITL record and signal the workflow to resume."""
    db = get_db()
    resolved_at = datetime.datetime.utcnow().isoformat()

    record = await db.hitl_records.find_one_and_update(
        {"hitl_id": hitl_id, "status": "pending"},
        {"$set": {"status": "approved", "human_note": note, "resolved_at": resolved_at}},
        projection={"_id": 0},
        return_document=True,
    )
    if not record:
        raise ValueError(f"HITL record '{hitl_id}' not found or already resolved")

    # Mark the workflow run as 'resuming' so the engine picks it up
    await db.workflow_runs.update_one(
        {"run_id": record["workflow_run_id"]},
        {"$set": {"status": "resuming", "updated_at": resolved_at}},
    )

    resume_signals.signal(hitl_id, {"decision": "approve", "note": note})
    logger.info("hitl.approved", hitl_id=hitl_id)
    return {"hitl_id": hitl_id, "status": "approved", "workflow_run_id": record["workflow_run_id"]}


async def reject_hitl(hitl_id: str, reason: str) -> dict:
    """Reject a pending HITL record and mark the workflow as failed."""
    db = get_db()
    resolved_at = datetime.datetime.utcnow().isoformat()

    record = await db.hitl_records.find_one_and_update(
        {"hitl_id": hitl_id, "status": "pending"},
        {"$set": {"status": "rejected", "human_note": reason, "resolved_at": resolved_at}},
        projection={"_id": 0},
        return_document=True,
    )
    if not record:
        raise ValueError(f"HITL record '{hitl_id}' not found or already resolved")

    await db.workflow_runs.update_one(
        {"run_id": record["workflow_run_id"]},
        {"$set": {
            "status": "failed",
            "failure_reason": f"HITL rejected: {reason}",
            "updated_at": resolved_at,
        }},
    )

    resume_signals.signal(hitl_id, {"decision": "reject", "note": reason})
    logger.info("hitl.rejected", hitl_id=hitl_id)
    return {"hitl_id": hitl_id, "status": "rejected", "workflow_run_id": record["workflow_run_id"]}
