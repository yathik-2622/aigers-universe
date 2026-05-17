"""
Repository for hitl_records collection.
"""
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

_NO_ID = {"_id": 0}


class HITLRepository:
    """Data access layer for HITL approval records."""

    @property
    def collection(self):
        return get_db().hitl_records

    async def get_pending(self) -> list[dict]:
        return await self.collection.find({"status": "pending"}, _NO_ID).sort("created_at", -1).to_list(100)

    async def get_all(self, limit: int = 100) -> list[dict]:
        return await self.collection.find({}, _NO_ID).sort("created_at", -1).to_list(limit)

    async def get_by_id(self, hitl_id: str) -> dict | None:
        return await self.collection.find_one({"hitl_id": hitl_id}, _NO_ID)

    async def update_status(self, hitl_id: str, status: str, human_note: str, resolved_at: str) -> dict | None:
        if status not in ("approved", "rejected"):
            raise ValueError(f"Invalid status '{status}'")
        return await self.collection.find_one_and_update(
            {"hitl_id": hitl_id},
            {"$set": {"status": status, "human_note": human_note, "resolved_at": resolved_at}},
            projection=_NO_ID,
            return_document=True,
        )
