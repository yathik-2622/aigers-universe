from fastapi import APIRouter, Request

from core.request_context import require_admin
from db.mongo_client import get_db

router = APIRouter()


@router.get("/overview")
async def overview(request: Request):
    require_admin(request)
    db = get_db()
    users = await db.users.find({}, {"_id": 0, "display_name": 1, "email": 1, "role": 1, "last_login_at": 1}).sort("last_login_at", -1).to_list(50)
    projects = await db.projects.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    runs = await db.workflow_runs.find({}, {"_id": 0, "run_id": 1, "workflow_name": 1, "owner_user_id": 1, "status": 1, "started_at": 1}).sort("started_at", -1).to_list(100)
    return {
        "counts": {
            "users": await db.users.count_documents({}),
            "projects": await db.projects.count_documents({}),
            "agents": await db.agents.count_documents({"status": "active"}),
            "workflows": await db.workflow_definitions.count_documents({}),
            "runs": await db.workflow_runs.count_documents({}),
            "documents": await db.documents.count_documents({}),
            "pending_hitl": await db.hitl_records.count_documents({"status": "pending"}),
        },
        "recent_users": users,
        "recent_projects": projects,
        "recent_runs": runs,
    }
