"""
Repository for workflow_definitions and workflow_runs collections.
"""
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

_NO_ID = {"_id": 0}


class WorkflowRepository:
    """Data access for workflow definitions and runs."""

    @property
    def defs(self):
        return get_db().workflow_definitions

    @property
    def runs(self):
        return get_db().workflow_runs

    async def list_defs(self) -> list[dict]:
        return await self.defs.find({}, _NO_ID).sort("created_at", -1).to_list(200)

    async def get_def(self, workflow_id: str) -> dict | None:
        return await self.defs.find_one({"workflow_id": workflow_id}, _NO_ID)

    async def get_run(self, run_id: str) -> dict | None:
        return await self.runs.find_one({"run_id": run_id}, _NO_ID)

    async def list_runs(self, limit: int = 50) -> list[dict]:
        return await self.runs.find({}, _NO_ID).sort("started_at", -1).to_list(limit)
