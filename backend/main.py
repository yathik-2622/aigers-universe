"""
AIger's Universe — FastAPI application entrypoint.
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from logging_config import configure_logging
from middleware.request_logging import RequestLoggingMiddleware
from db.mongo_client import connect_db, disconnect_db
from db.seed import run_seed
from mcp_tools.tool_server import mcp, register_all_tools

from api.platform_router import router as platform_router
from api.workflow_router import router as workflow_router
from api.hitl_router import router as hitl_router
from api.observability_router import router as observability_router
from api.marketplace_router import router as marketplace_router
from api.document_router import router as document_router

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("aigers_universe.startup.begin", version="1.0.0")
    try:
        await connect_db()
        await run_seed()
        register_all_tools()
        logger.info("aigers_universe.startup.complete")
        yield
    except Exception as exc:
        logger.error("aigers_universe.startup.failed", error=str(exc), exc_info=True)
        raise
    finally:
        await disconnect_db()


app = FastAPI(
    title="AIger's Universe API",
    description="Enterprise AI Engineering & Agentic Orchestration Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", path=str(request.url), error=str(exc), exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── API routes — ALL prefixed with /api to satisfy Kubernetes ingress routing ──
app.include_router(platform_router, prefix="/api/platform", tags=["Platform"])
app.include_router(workflow_router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(hitl_router, prefix="/api/hitl", tags=["HITL"])
app.include_router(observability_router, prefix="/api/observability", tags=["Observability"])
app.include_router(marketplace_router, prefix="/api/marketplace", tags=["Marketplace"])
app.include_router(document_router, prefix="/api/documents", tags=["Documents"])


# Mount FastApiMCP — exposes /mcp endpoint with all registered tools
try:
    from fastapi_mcp import FastApiMCP
    fastapi_mcp = FastApiMCP(app, name="AIger's Universe MCP", description="Platform API exposed as MCP tools")
    fastapi_mcp.mount()
    logger.info("mcp.endpoint.mounted")
except Exception as exc:
    logger.warning("mcp.endpoint.mount_failed", error=str(exc))


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "platform": "AIger's Universe", "version": "1.0.0"}
