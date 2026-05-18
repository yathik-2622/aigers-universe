import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from core.request_context import require_user_id
from db.mongo_client import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(default="", max_length=200)


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(request: LoginRequest):
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()
    email = request.email.strip().lower()
    lookup = {"email": email} if email else {"display_name": request.display_name.strip()}

    user = await db.users.find_one(lookup, {"_id": 0})
    if user:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"display_name": request.display_name.strip(), "email": email, "last_login_at": now}},
        )
        user["display_name"] = request.display_name.strip()
        user["email"] = email
        user["last_login_at"] = now
        return user

    user = {
        "user_id": str(uuid.uuid4()),
        "display_name": request.display_name.strip(),
        "email": email,
        "created_at": now,
        "last_login_at": now,
    }
    await db.users.insert_one(user)
    return user


@router.get("/me")
async def me(request: Request):
    db = get_db()
    user_id = require_user_id(request)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
