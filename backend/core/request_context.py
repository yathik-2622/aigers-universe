from fastapi import HTTPException, Request


def get_optional_user_id(request: Request) -> str | None:
    user_id = request.headers.get("x-user-id", "").strip()
    return user_id or None


def require_user_id(request: Request) -> str:
    user_id = get_optional_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    return user_id
