"""
HITL API router — pending approvals + approve/reject.
"""
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from core.request_context import get_optional_user_id
from hitl.hitl_manager import approve_hitl, reject_hitl
from db.repositories.hitl_repo import HITLRepository
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)
router = APIRouter()
repo = HITLRepository()


class ApproveRequest(BaseModel):
    note: str = Field(default="")


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


@router.get("/pending")
async def get_pending_approvals(request: Request):
    user_id = get_optional_user_id(request)
    query = {"status": "pending"}
    if user_id:
        query["owner_user_id"] = user_id
    records = await get_db().hitl_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"pending": records, "count": len(records)}


@router.get("/all")
async def get_all_records(request: Request, limit: int = 100):
    user_id = get_optional_user_id(request)
    query = {}
    if user_id:
        query["owner_user_id"] = user_id
    records = await get_db().hitl_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"records": records, "count": len(records)}


@router.get("/{hitl_id}")
async def get_record(hitl_id: str, request: Request):
    query = {"hitl_id": hitl_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    record = await get_db().hitl_records.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    return record


@router.post("/{hitl_id}/approve")
async def approve(hitl_id: str, body: ApproveRequest, request: Request):
    query = {"hitl_id": hitl_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    record = await get_db().hitl_records.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"HITL record is '{record['status']}'")
    return await approve_hitl(hitl_id=hitl_id, note=body.note)


@router.post("/{hitl_id}/reject")
async def reject(hitl_id: str, body: RejectRequest, request: Request):
    query = {"hitl_id": hitl_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    record = await get_db().hitl_records.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail=f"HITL record '{hitl_id}' not found")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"HITL record is '{record['status']}'")
    return await reject_hitl(hitl_id=hitl_id, reason=body.reason)
