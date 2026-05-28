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
from api.document_router import cleanup_expired_workflow_inputs, ensure_document_indexes
from api.auth_router import router as auth_router
from api.policy_router import router as policy_router
from api.project_router import router as project_router
from api.admin_router import router as admin_router
from api.tool_chat_router import router as tool_chat_router
from api.a2a_router import router as a2a_router
from api.settings_router import router as settings_router
from api.knowledge_graph_router import router as knowledge_graph_router
from core.api_errors import public_error, request_id_from

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("aigers_universe.startup.begin", version="1.0.0")
    try:
        await connect_db()
        await ensure_document_indexes()
        await run_seed()
        await cleanup_expired_workflow_inputs()
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
    request_id = request_id_from(request)
    logger.error("unhandled_exception", path=str(request.url), error=str(exc), request_id=request_id, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": public_error("Internal server error", "INTERNAL_SERVER_ERROR", request_id)},
        headers={"X-Request-ID": request_id} if request_id else None,
    )


# ── API routes — ALL prefixed with /api to satisfy Kubernetes ingress routing ──
app.include_router(platform_router, prefix="/api/platform", tags=["Platform"])
app.include_router(workflow_router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(hitl_router, prefix="/api/hitl", tags=["HITL"])
app.include_router(observability_router, prefix="/api/observability", tags=["Observability"])
app.include_router(marketplace_router, prefix="/api/marketplace", tags=["Marketplace"])
app.include_router(document_router, prefix="/api/documents", tags=["Documents"])
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(policy_router, prefix="/api/policies", tags=["Policies"])
app.include_router(project_router, prefix="/api/projects", tags=["Projects"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(tool_chat_router, prefix="/api/tool-chat", tags=["Tool Chat"])
app.include_router(a2a_router, prefix="/api/a2a", tags=["A2A"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(knowledge_graph_router, prefix="/api/knowledge-graph", tags=["Knowledge Graph"])


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
