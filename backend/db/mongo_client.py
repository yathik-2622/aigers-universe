# """
# MongoDB async client lifecycle for AIger's Universe.
# Uses Motor (async PyMongo driver). Connect on startup, disconnect on shutdown.
# """
# import structlog
# from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
# from pymongo.errors import ConfigurationError

# from config import settings

# logger = structlog.get_logger(__name__)

# _client: AsyncIOMotorClient | None = None
# _db: AsyncIOMotorDatabase | None = None


# def _mask_mongo_url(url: str) -> str:
#     if "@" not in url or "://" not in url:
#         return url
#     scheme, rest = url.split("://", 1)
#     _, host = rest.rsplit("@", 1)
#     return f"{scheme}://***:***@{host}"


# async def _connect_with_url(url: str) -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
#     client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
#     db = client[settings.DB_NAME]
#     await client.admin.command("ping")
#     return client, db


# async def connect_db() -> None:
#     """Connect to MongoDB using the configured MONGO_URL."""
#     global _client, _db
#     try:
#         _client, _db = await _connect_with_url(settings.MONGO_URL)
#         logger.info("mongo.connected", db=settings.DB_NAME, source="primary")
#     except ConfigurationError as exc:
#         fallback = settings.MONGO_URL_FALLBACK.strip()
#         is_srv = settings.MONGO_URL.startswith("mongodb+srv://")
#         if not (is_srv and fallback):
#             raise

#         logger.warning(
#             "mongo.primary_srv_resolution_failed",
#             primary_url=_mask_mongo_url(settings.MONGO_URL),
#             fallback_url=_mask_mongo_url(fallback),
#             error=str(exc),
#         )
#         _client, _db = await _connect_with_url(fallback)
#         logger.info("mongo.connected", db=settings.DB_NAME, source="fallback")


# async def disconnect_db() -> None:
#     """Close the MongoDB connection cleanly."""
#     global _client
#     if _client is not None:
#         _client.close()
#         logger.info("mongo.disconnected")


# def get_db() -> AsyncIOMotorDatabase:
#     """Return the active database handle. Raises if connect_db() was not called."""
#     if _db is None:
#         raise RuntimeError("Database not connected — call connect_db() first")
#     return _db









"""
MongoDB async client lifecycle for AIger's Universe.
Uses Motor (async PyMongo driver). Connect on startup, disconnect on shutdown.
Supports automatic fallback from SRV connection strings to standard MongoDB URLs.
"""

import dns.exception
import structlog
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import (
    ConfigurationError,
    ServerSelectionTimeoutError,
)

from config import settings

logger = structlog.get_logger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def _mask_mongo_url(url: str) -> str:
    """
    Mask MongoDB credentials before logging.
    """
    if "@" not in url or "://" not in url:
        return url

    scheme, rest = url.split("://", 1)
    _, host = rest.rsplit("@", 1)

    return f"{scheme}://***:***@{host}"


async def _connect_with_url(
    url: str,
) -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
    """
    Create MongoDB client and verify connectivity.
    """

    client = AsyncIOMotorClient(
        url,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        retryWrites=True,
        retryReads=True,
        maxPoolSize=50,
        minPoolSize=5,
    )

    db = client[settings.DB_NAME]

    # Validate connection immediately
    await client.admin.command("ping")

    return client, db


async def connect_db() -> None:
    """
    Connect to MongoDB using the configured MONGO_URL.

    Flow:
    1. Try primary SRV URL
    2. If SRV/DNS resolution fails -> use fallback standard MongoDB URL
    """

    global _client, _db

    primary_url = settings.MONGO_URL.strip()
    fallback_url = settings.MONGO_URL_FALLBACK.strip()

    try:
        _client, _db = await _connect_with_url(primary_url)

        logger.info(
            "mongo.connected",
            db=settings.DB_NAME,
            source="primary",
        )

    except (
        ConfigurationError,
        ServerSelectionTimeoutError,
        dns.exception.DNSException,
        Exception,
    ) as exc:

        is_srv_connection = primary_url.startswith("mongodb+srv://")

        logger.warning(
            "mongo.primary_connection_failed",
            primary_url=_mask_mongo_url(primary_url),
            error=str(exc),
        )

        # Only fallback if:
        # 1. Primary is SRV URL
        # 2. Fallback URL exists
        if not (is_srv_connection and fallback_url):

            logger.error(
                "mongo.connection_failed_no_fallback",
                db=settings.DB_NAME,
            )

            raise

        try:
            logger.warning(
                "mongo.trying_fallback_connection",
                fallback_url=_mask_mongo_url(fallback_url),
            )

            _client, _db = await _connect_with_url(fallback_url)

            logger.info(
                "mongo.connected",
                db=settings.DB_NAME,
                source="fallback",
            )

        except Exception as fallback_exc:

            logger.error(
                "mongo.fallback_connection_failed",
                error=str(fallback_exc),
            )

            raise fallback_exc


async def disconnect_db() -> None:
    """
    Close MongoDB connection cleanly.
    """

    global _client

    if _client is not None:
        _client.close()

        logger.info("mongo.disconnected")


def get_db() -> AsyncIOMotorDatabase:
    """
    Return active database handle.
    Raises if connect_db() was not called.
    """

    if _db is None:
        raise RuntimeError(
            "Database not connected — call connect_db() first"
        )

    return _db