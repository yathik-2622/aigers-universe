import base64
import datetime
import hashlib
import hmac
import json

from fastapi import HTTPException

from config import settings


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(user: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.datetime.utcnow()
    payload = {
        "sub": user["user_id"],
        "role": user.get("role", "user"),
        "email": user.get("email", ""),
        "name": user.get("display_name", ""),
        "iat": int(now.timestamp()),
        "exp": int((now + datetime.timedelta(hours=settings.JWT_EXPIRES_HOURS)).timestamp()),
    }
    header_part = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(settings.JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_part}.{payload_part}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> dict:
    try:
        header_part, payload_part, signature_part = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token format") from exc
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    expected = hmac.new(settings.JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64url_decode(signature_part)):
        raise HTTPException(status_code=401, detail="Invalid token signature")
    payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    if int(payload.get("exp", 0)) < int(datetime.datetime.utcnow().timestamp()):
        raise HTTPException(status_code=401, detail="Token expired")
    return payload
