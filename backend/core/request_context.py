from fastapi import HTTPException, Request

from core.security import decode_access_token


def _auth_payload(request: Request) -> dict | None:
    auth = request.headers.get("authorization", "").strip()
    if auth.lower().startswith("bearer "):
        return decode_access_token(auth[7:].strip())
    user_id = request.headers.get("x-user-id", "").strip()
    if user_id:
        return {"sub": user_id, "role": request.headers.get("x-user-role", "user")}
    return None


def get_optional_user_id(request: Request) -> str | None:
    payload = _auth_payload(request)
    return payload.get("sub") if payload else None


def get_optional_role(request: Request) -> str | None:
    payload = _auth_payload(request)
    return payload.get("role") if payload else None


def require_user_id(request: Request) -> str:
    user_id = get_optional_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


def require_admin(request: Request) -> str:
    user_id = require_user_id(request)
    role = get_optional_role(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
