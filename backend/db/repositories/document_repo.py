"""
Repository for documents collection.
"""
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

_NO_ID = {"_id": 0}


class DocumentRepository:
    """Data access layer for uploaded documents."""

    @property
    def collection(self):
        return get_db().documents

    async def list_all(self) -> list[dict]:
        return await self.collection.find({}, {"_id": 0, "text": 0, "vector_ids": 0}).sort("uploaded_at", -1).to_list(200)

    async def get_by_id(self, document_id: str) -> dict | None:
        return await self.collection.find_one({"document_id": document_id}, _NO_ID)
