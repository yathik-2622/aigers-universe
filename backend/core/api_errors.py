def public_error(message: str, error_code: str, request_id: str | None = None, details: dict | None = None) -> dict:
    payload = {
        "message": message,
        "error_code": error_code,
    }
    if request_id:
        payload["request_id"] = request_id
    if details:
        payload["details"] = details
    return payload


def request_id_from(request) -> str | None:
    return getattr(getattr(request, "state", None), "request_id", None)
