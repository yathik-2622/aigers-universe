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


class SignupRequest(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=200)


def _public_user(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "_id"}


def _resolve_role(email: str, existing_role: str | None = None) -> str:
    if existing_role:
        return existing_role
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    return "admin" if email.lower() in admin_emails else "user"


async def _attach_invited_projects(user_id: str, email: str):
    db = get_db()
    await db.projects.update_many(
        {"member_emails": email},
        {"$addToSet": {"member_ids": user_id}, "$set": {"updated_at": datetime.datetime.utcnow().isoformat()}},
    )


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest):
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()
    email = body.email.strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists for this email. Please sign in.")
    user = {
        "user_id": str(uuid.uuid4()),
        "display_name": body.display_name.strip(),
        "email": email,
        "role": _resolve_role(email),
        "created_at": now,
        "last_login_at": None,
    }
    await db.users.insert_one(user)
    await _attach_invited_projects(user["user_id"], email)
    return {"user": _public_user(user), "success": True}


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
        await _attach_invited_projects(user["user_id"], email)
    else:
        raise HTTPException(status_code=404, detail="No account exists for this email. Please sign up first.")
    user = _public_user(user)
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
