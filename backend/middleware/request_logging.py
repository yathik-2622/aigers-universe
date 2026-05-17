"""
Structured HTTP request logging middleware.
Assigns a unique request_id to every request and logs method, path, status, latency.
"""
import time
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every HTTP request with structured fields."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path == "/health" or request.url.path == "/api/health":
            return await call_next(request)

        request_id = str(uuid.uuid4())
        start_time = time.perf_counter()

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger.info(
            "http.request.received",
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else "unknown",
        )

        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            logger.error("http.request.error", error=str(exc), exc_info=True)
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                "http.request.complete",
                status_code=response.status_code if response else 500,
                duration_ms=duration_ms,
            )
            if response is not None:
                response.headers["X-Request-ID"] = request_id
