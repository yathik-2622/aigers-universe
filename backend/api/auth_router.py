import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from config import settings
from core.request_context import require_user_id
from core.security import create_access_token
from db.mongo_client import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=200)


def _resolve_role(email: str, existing_role: str | None = None) -> str:
    if existing_role:
        return existing_role
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    return "admin" if email.lower() in admin_emails else "user"


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(body: LoginRequest):
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        role = _resolve_role(email, user.get("role"))
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"display_name": body.display_name.strip(), "email": email, "role": role, "last_login_at": now}},
        )
        user.update({"display_name": body.display_name.strip(), "email": email, "role": role, "last_login_at": now})
    else:
        user = {
            "user_id": str(uuid.uuid4()),
            "display_name": body.display_name.strip(),
            "email": email,
            "role": _resolve_role(email),
            "created_at": now,
            "last_login_at": now,
        }
        await db.users.insert_one(user)
    token = create_access_token(user)
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.get("/me")
async def me(request: Request):
    db = get_db()
    user_id = require_user_id(request)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/logout")
async def logout():
    return {"success": True}
