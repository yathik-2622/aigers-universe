"""
FAISS vector store for AIger's Universe.
Persists to disk so the index survives restarts.
"""
import os
import uuid
import json
import asyncio
import structlog
import numpy as np
import faiss
from config import settings

logger = structlog.get_logger(__name__)

_index: faiss.Index | None = None
_metadata: list[dict] = []

_INDEX_FILE = f"{settings.FAISS_INDEX_PATH}.index"
_META_FILE = f"{settings.FAISS_INDEX_PATH}.meta.json"

_write_lock = asyncio.Lock()


def _ensure_index(dim: int = 1536) -> faiss.Index:
    """Return the FAISS index, loading from disk if it exists or creating a new one."""
    global _index, _metadata

    if _index is not None:
        return _index

    os.makedirs(os.path.dirname(_INDEX_FILE) or ".", exist_ok=True)

    if os.path.exists(_INDEX_FILE) and os.path.exists(_META_FILE):
        try:
            _index = faiss.read_index(_INDEX_FILE)
            with open(_META_FILE, "r", encoding="utf-8") as f:
                _metadata = json.load(f)
            logger.info("faiss.index.loaded", total_vectors=_index.ntotal)
        except Exception as exc:
            logger.warning("faiss.index.load_failed", error=str(exc))
            _index = faiss.IndexFlatL2(dim)
            _metadata = []
    else:
        _index = faiss.IndexFlatL2(dim)
        _metadata = []
        logger.info("faiss.index.created_new", dim=dim)

    return _index


def _persist() -> None:
    """Save FAISS index and metadata to disk."""
    try:
        faiss.write_index(_index, _INDEX_FILE)
        with open(_META_FILE, "w", encoding="utf-8") as f:
            json.dump(_metadata, f, ensure_ascii=False)
    except Exception as exc:
        logger.error("faiss.index.persist_failed", error=str(exc), exc_info=True)
        raise


async def add_document(text: str, metadata: dict) -> str:
    """Embed a text chunk and add it to the FAISS index."""
    from core.llm_router import get_embedding

    vector_id = str(uuid.uuid4())
    try:
        embedding = await get_embedding(text[:8000])
        arr = np.array([embedding], dtype=np.float32)

        async with _write_lock:
            idx = _ensure_index(dim=len(embedding))
            idx.add(arr)
            _metadata.append({
                "vector_id": vector_id,
                "text_preview": text[:400],
                "metadata": metadata,
            })
            _persist()

        logger.info("faiss.add_document.complete", vector_id=vector_id, total_vectors=_index.ntotal)
        return vector_id
    except Exception as exc:
        logger.error("faiss.add_document.failed", error=str(exc), exc_info=True)
        raise


async def search_similar(query: str, top_k: int = 5) -> list[dict]:
    """Embed the query and search the index for the most similar vectors."""
    from core.llm_router import get_embedding

    embedding = await get_embedding(query)
    idx = _ensure_index(dim=len(embedding))

    if idx.ntotal == 0:
        return []

    k = min(top_k, idx.ntotal)
    arr = np.array([embedding], dtype=np.float32)
    distances, indices = idx.search(arr, k)

    results = []
    for dist, i in zip(distances[0], indices[0]):
        if 0 <= i < len(_metadata):
            similarity = float(1.0 / (1.0 + dist))
            results.append({
                "text": _metadata[i]["text_preview"],
                "score": round(similarity, 4),
                "metadata": _metadata[i]["metadata"],
            })
    return results
