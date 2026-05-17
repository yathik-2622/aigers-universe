"""
MongoDB async client lifecycle for AIger's Universe.
Uses Motor (async PyMongo driver). Connect on startup, disconnect on shutdown.
"""
import structlog
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import settings

logger = structlog.get_logger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    """Connect to MongoDB using the configured MONGO_URL."""
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
    _db = _client[settings.DB_NAME]
    # Ping to verify connection
    await _client.admin.command("ping")
    logger.info("mongo.connected", db=settings.DB_NAME)


async def disconnect_db() -> None:
    """Close the MongoDB connection cleanly."""
    global _client
    if _client is not None:
        _client.close()
        logger.info("mongo.disconnected")


def get_db() -> AsyncIOMotorDatabase:
    """Return the active database handle. Raises if connect_db() was not called."""
    if _db is None:
        raise RuntimeError("Database not connected — call connect_db() first")
    return _db
