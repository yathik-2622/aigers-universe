"""
HITL API router — pending approvals + approve/reject.
"""
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hitl.hitl_manager import approve_hitl, reject_hitl
from db.repositories.hitl_repo import HITLRepository

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = HITLRepository()


class ApproveRequest(BaseModel):
    note: str = Field(default="")


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


@router.get("/pending")
async def get_pending_approvals():
    records = await repo.get_pending()
    return {"pending": records, "count": len(records)}


@router.get("/all")
async def get_all_records(limit: int = 100):
    records = await repo.get_all(limit=limit)
    return {"records": records, "count": len(records)}


@router.get("/{hitl_id}")
async def get_record(hitl_id: str):
    record = await repo.get_by_id(hitl_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    return record


@router.post("/{hitl_id}/approve")
async def approve(hitl_id: str, request: ApproveRequest):
    record = await repo.get_by_id(hitl_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"HITL record is '{record['status']}'")
    return await approve_hitl(hitl_id=hitl_id, note=request.note)


@router.post("/{hitl_id}/reject")
async def reject(hitl_id: str, request: RejectRequest):
    record = await repo.get_by_id(hitl_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"HITL record is '{record['status']}'")
    return await reject_hitl(hitl_id=hitl_id, reason=request.reason)
