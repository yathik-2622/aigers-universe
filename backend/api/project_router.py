import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from core.request_context import get_optional_role, require_user_id
from db.mongo_client import get_db

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    member_ids: list[str] = Field(default_factory=list)


def _project_query(user_id: str, role: str | None) -> dict:
    if role == "admin":
        return {}
    return {"$or": [{"owner_user_id": user_id}, {"member_ids": user_id}]}


@router.get("")
async def list_projects(request: Request):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    projects = await db.projects.find(_project_query(user_id, role), {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"projects": projects, "count": len(projects)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(request: Request, body: CreateProjectRequest):
    db = get_db()
    user_id = require_user_id(request)
    now = datetime.datetime.utcnow().isoformat()
    doc = {
        "project_id": str(uuid.uuid4()),
        "name": body.name,
        "description": body.description,
        "owner_user_id": user_id,
        "member_ids": sorted(set([user_id, *body.member_ids])),
        "created_at": now,
        "updated_at": now,
    }
    await db.projects.insert_one(doc)
    return doc


@router.get("/{project_id}")
async def get_project(project_id: str, request: Request):
    db = get_db()
    user_id = require_user_id(request)
    role = get_optional_role(request)
    query = {"project_id": project_id, **({} if role == "admin" else {"$or": [{"owner_user_id": user_id}, {"member_ids": user_id}]})}
    project = await db.projects.find_one(query, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project
