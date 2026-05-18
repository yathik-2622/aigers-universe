import datetime
import os
import uuid

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field

from core.request_context import get_optional_user_id
from api.document_router import _extract_docx_text, _extract_pdf_text
from db.mongo_client import get_db

router = APIRouter()


class CreatePolicyRequest(BaseModel):
    rule_name: str = Field(..., min_length=3, max_length=120)
    category: str = Field(..., min_length=2, max_length=50)
    severity: str = Field(..., pattern="^(HIGH|MEDIUM|LOW)$")
    description: str = Field(..., min_length=10, max_length=2000)
    guidance: str = Field(default="", max_length=2000)
    applicable_to: list[str] = Field(default_factory=lambda: ["compliance", "all"])


@router.get("")
async def list_policies(request: Request, category: str | None = Query(default=None)):
    db = get_db()
    user_id = get_optional_user_id(request)
    query: dict = {"$or": [{"source": {"$ne": "custom"}}, {"owner_user_id": user_id}]}
    if category:
        query["category"] = category
    policies = await db.governance_rules.find(query, {"_id": 0}).sort("rule_name", 1).to_list(500)
    return {"policies": policies, "count": len(policies)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_policy(request: Request, body: CreatePolicyRequest):
    db = get_db()
    user_id = get_optional_user_id(request)
    now = datetime.datetime.utcnow().isoformat()
    doc = {
        "rule_id": str(uuid.uuid4()),
        **body.model_dump(),
        "source": "custom",
        "owner_user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.governance_rules.insert_one(doc)
    return doc


@router.get("/{rule_id}")
async def get_policy(request: Request, rule_id: str):
    db = get_db()
    user_id = get_optional_user_id(request)
    policy = await db.governance_rules.find_one(
        {"rule_id": rule_id, "$or": [{"source": {"$ne": "custom"}}, {"owner_user_id": user_id}]},
        {"_id": 0},
    )
    if not policy:
        raise HTTPException(status_code=404, detail=f"Policy '{rule_id}' not found")
    return policy


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_policy(request: Request, file: UploadFile = File(...), severity: str = "HIGH", category: str = "compliance"):
    db = get_db()
    user_id = get_optional_user_id(request)
    filename = file.filename or "policy.txt"
    ext = os.path.splitext(filename)[1].lower()
    content = await file.read()
    if ext == ".pdf":
        text = _extract_pdf_text(content)
    elif ext == ".docx":
        text = _extract_docx_text(content)
    else:
        text = content.decode("utf-8", errors="ignore")
    if not text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from the policy file")
    now = datetime.datetime.utcnow().isoformat()
    doc = {
        "rule_id": str(uuid.uuid4()),
        "rule_name": os.path.splitext(filename)[0],
        "category": category,
        "severity": severity,
        "description": text[:2000],
        "guidance": "Uploaded policy document. Use policy_library_search to inspect this rule.",
        "uploaded_text": text[:20000],
        "applicable_to": ["compliance", "all"],
        "source": "uploaded_policy",
        "owner_user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.governance_rules.insert_one(doc)
    return doc
