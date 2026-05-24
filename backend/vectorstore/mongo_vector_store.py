"""
Mongo-backed vector store for AIger's Universe.
"""
import uuid
import structlog

from config import settings
from db.collection_names import AIGERS_CHUNKS
from db.mongo_client import get_db
from core.llm_router import get_embedding

logger = structlog.get_logger(__name__)

COLLECTION = AIGERS_CHUNKS


def _cosine(a: list[float], b: list[float]) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))


async def add_document(text: str, metadata: dict) -> str:
    """
    Embed a text chunk and store it in MongoDB.
    """
    vector_id = str(uuid.uuid4())
    embedding = await get_embedding((text or "")[:8000])
    db = get_db()
    safe_metadata = metadata or {}
    payload = {
        "vector_id": vector_id,
        "text": text or "",
        "text_preview": (text or "")[:400],
        "embedding": embedding,
        "metadata": safe_metadata,
        **safe_metadata,
    }
    await db[COLLECTION].insert_one(payload)
    logger.info("mongo_vector.add_document.complete", vector_id=vector_id)
    return vector_id


async def delete_document_chunks(document_id: str) -> int:
    if not document_id:
        return 0
    db = get_db()
    result = await db[COLLECTION].delete_many({"document_id": document_id})
    logger.info("mongo_vector.delete_document_chunks.complete", document_id=document_id, deleted=result.deleted_count)
    return int(result.deleted_count or 0)


async def search_similar(query: str, top_k: int = 5) -> list[dict]:
    """
    Retrieve nearest chunks by cosine similarity.
    Uses in-app ranking so it works with plain Mongo deployments.
    """
    capped = max(1, min(int(top_k or 5), 20))
    db = get_db()
    query_vec = await get_embedding(query or "")
    if settings.MONGO_VECTOR_USE_ATLAS_SEARCH:
        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.MONGO_VECTOR_INDEX_NAME,
                        "path": "embedding",
                        "queryVector": query_vec,
                        "numCandidates": min(max(capped * 10, 50), 400),
                        "limit": capped,
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "vector_id": 1,
                        "text": 1,
                        "text_preview": 1,
                        "metadata": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }
                },
            ]
            rows = await db[COLLECTION].aggregate(pipeline).to_list(capped)
            if rows:
                return [
                    {
                        "text": row.get("text", "") or row.get("text_preview", ""),
                        "score": round(float(row.get("score", 0.0)), 4),
                        "metadata": row.get("metadata", {}),
                    }
                    for row in rows
                ]
        except Exception as exc:
            logger.warning("mongo_vector.atlas_search_failed", error=str(exc))

    rows = await db[COLLECTION].find({}, {"_id": 0}).limit(4000).to_list(4000)
    if not rows:
        return []

    scored = []
    for row in rows:
        emb = row.get("embedding") or []
        if not emb:
            continue
        sim = _cosine(query_vec, emb)
        scored.append((sim, row))
    scored.sort(key=lambda item: item[0], reverse=True)

    return [
        {
            "text": row.get("text", "") or row.get("text_preview", ""),
            "score": round(float(score), 4),
            "metadata": row.get("metadata", {}),
        }
        for score, row in scored[:capped]
    ]
