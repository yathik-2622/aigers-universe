"""
Repository for the agents collection.
"""
import uuid
import datetime
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

_NO_ID = {"_id": 0}


class AgentRepository:
    """Data access layer for registered agents."""

    @property
    def collection(self):
        return get_db().agents

    async def create(self, agent_data: dict) -> str:
        agent_id = str(uuid.uuid4())
        doc = {
            "agent_id": agent_id,
            **agent_data,
            "status": "active",
            "created_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat(),
        }
        await self.collection.insert_one(doc)
        # Remove _id added by Mongo before returning agent_id
        return agent_id

    async def list_all(self) -> list[dict]:
        return await self.collection.find({"status": "active"}, _NO_ID).sort("created_at", -1).to_list(500)

    async def get_by_id(self, agent_id: str) -> dict | None:
        return await self.collection.find_one({"agent_id": agent_id}, _NO_ID)

    async def update(self, agent_id: str, updates: dict) -> dict | None:
        # Strip identity fields that must not change
        updates = {k: v for k, v in updates.items() if k not in ("agent_id", "_id", "created_at")}
        updates["updated_at"] = datetime.datetime.utcnow().isoformat()
        return await self.collection.find_one_and_update(
            {"agent_id": agent_id},
            {"$set": updates},
            projection=_NO_ID,
            return_document=True,
        )

    async def deactivate(self, agent_id: str) -> bool:
        result = await self.collection.update_one(
            {"agent_id": agent_id}, {"$set": {"status": "inactive"}}
        )
        return result.matched_count > 0
