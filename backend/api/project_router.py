import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pymongo import ReturnDocument
from pydantic import BaseModel, Field

from core.request_context import get_optional_role, require_user_id
from db.mongo_client import get_db

router = APIRouter()


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    member_emails: list[str] = Field(default_factory=list)


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    member_emails: list[str] | None = Field(default=None)


def _project_scope(user_id: str, role: str | None) -> dict:
    if role == "admin":
        return {}
    return {"$or": [{"owner_user_id": user_id}, {"member_ids": user_id}]}


async def _resolve_member_ids(member_emails: list[str]) -> tuple[list[str], list[str]]:
    db = get_db()
    emails = sorted({email.strip().lower() for email in member_emails if email.strip()})
    if not emails:
        return [], []
    users = await db.users.find({"email": {"$in": emails}}, {"_id": 0, "user_id": 1, "email": 1}).to_list(500)
    found = {row["email"]: row["user_id"] for row in users}
    resolved = [found[email] for email in emails if email in found]
    missing = [email for email in emails if email not in found]
    return resolved, missing


@router.get("")
async def list_projects(request: Request):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    projects = await db.projects.find(_project_scope(user_id, role), {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"projects": [_json_safe(project) for project in projects], "count": len(projects)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(request: Request, body: CreateProjectRequest):
    db = get_db()
    user_id = require_user_id(request)
    now = datetime.datetime.utcnow().isoformat()
    member_ids, missing_emails = await _resolve_member_ids(body.member_emails)
    normalized_member_emails = sorted({email.strip().lower() for email in body.member_emails if email.strip()})
    doc = {
        "project_id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "description": body.description.strip(),
        "owner_user_id": user_id,
        "member_ids": sorted(set([user_id, *member_ids])),
        "member_emails": normalized_member_emails,
        "created_at": now,
        "updated_at": now,
    }
    await db.projects.insert_one(doc)
    return _json_safe({**doc, "missing_member_emails": missing_emails})


@router.get("/{project_id}")
async def get_project(project_id: str, request: Request):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    project = await db.projects.find_one({"project_id": project_id, **_project_scope(user_id, role)}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return _json_safe(project)


@router.put("/{project_id}")
async def update_project(project_id: str, request: Request, body: UpdateProjectRequest):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    existing = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    if role != "admin" and existing.get("owner_user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can update this project")

    updates = {"updated_at": datetime.datetime.utcnow().isoformat()}
    missing_emails: list[str] = []
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.member_emails is not None:
        member_ids, missing_emails = await _resolve_member_ids(body.member_emails)
        normalized_member_emails = sorted({email.strip().lower() for email in body.member_emails if email.strip()})
        updates["member_ids"] = sorted(set([existing["owner_user_id"], *member_ids]))
        updates["member_emails"] = normalized_member_emails

    updated = await db.projects.find_one_and_update(
        {"project_id": project_id},
        {"$set": updates},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    return _json_safe({**updated, "missing_member_emails": missing_emails})


@router.delete("/{project_id}")
async def delete_project(project_id: str, request: Request):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    existing = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    if role != "admin" and existing.get("owner_user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can delete this project")
    await db.projects.delete_one({"project_id": project_id})
    await db.workflow_definitions.update_many({"project_id": project_id}, {"$unset": {"project_id": ""}})
    await db.workflow_runs.update_many({"project_id": project_id}, {"$unset": {"project_id": ""}})
    return {"success": True, "project_id": project_id}
