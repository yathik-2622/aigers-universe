"""
Repository for agent_traces collection.
"""
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

_NO_ID = {"_id": 0}


class TraceRepository:
    """Data access layer for agent execution traces."""

    @property
    def collection(self):
        return get_db().agent_traces

    async def insert(self, trace: dict) -> None:
        await self.collection.insert_one(trace)

    async def list_traces(self, workflow_run_id: str | None = None, limit: int = 100) -> list[dict]:
        query: dict = {}
        if workflow_run_id:
            query["workflow_run_id"] = workflow_run_id
        return await self.collection.find(query, {"_id": 0, "full_output": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    async def get_full_for_run(self, workflow_run_id: str) -> list[dict]:
        return await self.collection.find({"workflow_run_id": workflow_run_id}, _NO_ID).sort("step_number", 1).to_list(100)
