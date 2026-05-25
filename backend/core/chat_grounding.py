from __future__ import annotations

import json
import math
import re
from pathlib import Path

import structlog

from core.llm_router import _build_client, get_embedding
from db.collection_names import AIGERS_CHUNKS, AIGERS_DOCUMENTS
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)

PLATFORM_DOC_EXTENSIONS = {".md", ".markdown", ".html", ".htm"}
MAX_PLATFORM_DOC_CHARS = 12000
MAX_PLATFORM_PROMPT_CHARS = 5000


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
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[A-Za-z0-9_./-]+", (text or "").lower()) if len(token) > 1}


def _truncate(text: str, limit: int = 1200) -> str:
    value = (text or "").strip()
    return value if len(value) <= limit else f"{value[:limit].rstrip()}..."


def _split_sentences(text: str) -> list[str]:
    collapsed = re.sub(r"\n{2,}", "\n", (text or "").strip())
    if not collapsed:
        return []
    lines = [line.strip() for line in collapsed.splitlines() if line.strip()]
    if len(lines) > 1:
        return lines
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", collapsed) if part.strip()]


def _compress_text_for_query(text: str, query: str, max_sentences: int = 4, max_chars: int = 900) -> str:
    query_tokens = _tokenize(query)
    scored: list[tuple[int, str]] = []
    for sentence in _split_sentences(text):
        sentence_tokens = _tokenize(sentence)
        overlap = len(query_tokens.intersection(sentence_tokens))
        density = min(len(sentence_tokens), 24)
        score = overlap * 10 + density
        if overlap or len(scored) < max_sentences:
            scored.append((score, sentence))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [sentence for _score, sentence in scored[:max_sentences]]
    if not selected:
        selected = _split_sentences(text)[:max_sentences]
    merged = "\n".join(selected).strip()
    return _truncate(merged, max_chars)


def _score_text_match(query: str, text: str) -> int:
    query_tokens = _tokenize(query)
    text_tokens = _tokenize(text)
    return len(query_tokens.intersection(text_tokens))


def _apply_mmr(candidates: list[dict], top_k: int, lambda_mult: float = 0.72) -> list[dict]:
    remaining = [item for item in candidates if item.get("embedding")]
    if not remaining:
        return candidates[:top_k]
    selected: list[dict] = []
    while remaining and len(selected) < top_k:
        best_index = 0
        best_score = float("-inf")
        for idx, candidate in enumerate(remaining):
            relevance = float(candidate.get("score", 0.0))
            diversity_penalty = 0.0
            if selected:
                diversity_penalty = max(
                    _cosine(candidate["embedding"], picked["embedding"])
                    for picked in selected
                    if picked.get("embedding")
                )
            mmr_score = lambda_mult * relevance - (1.0 - lambda_mult) * diversity_penalty
            if mmr_score > best_score:
                best_score = mmr_score
                best_index = idx
        selected.append(remaining.pop(best_index))
    return selected


async def generate_multi_queries(*, user_id: str, model_name: str, query: str, count: int = 3) -> list[str]:
    logger.info("chat_grounding.multi_query.start", query=query[:160], count=count)
    try:
        client, _runtime = await _build_client(user_id)
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate concise search rewrites for retrieval. Return only JSON "
                        "in the form {\"queries\": [\"...\", \"...\", \"...\"]}. "
                        "Keep each query grounded to the user intent without adding new facts."
                    ),
                },
                {"role": "user", "content": query},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        rewrites = []
        seen = set()
        for item in [query, *(payload.get("queries") or [])]:
            normalized = _normalize_text(str(item))
            key = normalized.lower()
            if normalized and key not in seen:
                seen.add(key)
                rewrites.append(normalized)
        logger.info("chat_grounding.multi_query.complete", generated=len(rewrites))
        return rewrites[: max(1, count + 1)]
    except Exception as exc:
        logger.warning("chat_grounding.multi_query.failed", error=str(exc))
        return [query]


def list_platform_files(repo_root: Path) -> list[Path]:
    candidates: list[Path] = []
    for base in [repo_root, repo_root / "docs"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if any(part.startswith(".") for part in path.parts if part not in {".", ".."}):
                continue
            if "node_modules" in path.parts or "storage" in path.parts or ".git" in path.parts:
                continue
            if path.suffix.lower() not in PLATFORM_DOC_EXTENSIONS:
                continue
            candidates.append(path)
    return sorted(set(candidates), key=lambda item: str(item).lower())


def load_platform_documents(repo_root: Path) -> list[dict]:
    docs: list[dict] = []
    for path in list_platform_files(repo_root):
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if not content.strip():
            continue
        relative_path = path.relative_to(repo_root).as_posix()
        docs.append(
            {
                "source_id": f"platform::{relative_path}",
                "label": relative_path,
                "source_type": "platform_doc",
                "relative_path": relative_path,
                "content": content[:MAX_PLATFORM_DOC_CHARS],
                "updated_at": path.stat().st_mtime,
            }
        )
    return docs


def rank_platform_documents(query: str, docs: list[dict], top_k: int = 5) -> list[dict]:
    ranked = []
    for doc in docs:
        score = _score_text_match(query, f"{doc.get('label', '')}\n{doc.get('content', '')}")
        ranked.append({**doc, "score": score})
    ranked.sort(key=lambda item: (item["score"], item.get("updated_at", 0.0)), reverse=True)
    return ranked[:top_k]


async def retrieve_knowledge_chunks(
    *,
    user_id: str,
    query: str,
    model_name: str,
    top_k: int = 6,
    candidate_limit: int = 24,
    include_private: bool = True,
) -> dict:
    logger.info("chat_grounding.kb_retrieval.start", query=query[:160], top_k=top_k)
    db = get_db()
    query_variants = await generate_multi_queries(user_id=user_id, model_name=model_name, query=query, count=3)
    query_embeddings: list[tuple[str, list[float]]] = []
    for variant in query_variants:
        embedding = await get_embedding(variant, user_id=user_id)
        query_embeddings.append((variant, embedding))

    doc_access = {"visibility": "public"}
    if include_private:
        doc_access = {"$or": [{"visibility": "public"}, {"owner_user_id": user_id}]}
    document_rows = await db[AIGERS_DOCUMENTS].find(
        {"$and": [{"scope": "knowledge_base"}, {"status": "embedded"}, {"deleted_at": None}, doc_access]},
        {"_id": 0, "document_id": 1, "filename": 1, "main_category": 1, "sub_category": 1, "visibility": 1},
    ).to_list(500)
    document_map = {item["document_id"]: item for item in document_rows}
    if not document_map:
        logger.info("chat_grounding.kb_retrieval.empty")
        return {"query_variants": query_variants, "matches": []}

    chunk_rows = await db[AIGERS_CHUNKS].find(
        {"document_id": {"$in": list(document_map.keys())}},
        {"_id": 0, "document_id": 1, "chunk_id": 1, "chunk_index": 1, "text": 1, "text_preview": 1, "embedding": 1},
    ).to_list(4000)
    scored_map: dict[str, dict] = {}
    for variant, query_embedding in query_embeddings:
        local_scores = []
        for row in chunk_rows:
            embedding = row.get("embedding") or []
            if not embedding:
                continue
            similarity = _cosine(query_embedding, embedding)
            local_scores.append((similarity, row))
        local_scores.sort(key=lambda item: item[0], reverse=True)
        for similarity, row in local_scores[:candidate_limit]:
            chunk_key = row.get("chunk_id") or f"{row.get('document_id')}::{row.get('chunk_index', 0)}"
            doc = document_map.get(row.get("document_id"))
            if not doc:
                continue
            existing = scored_map.get(chunk_key)
            if existing and float(existing.get("score", 0.0)) >= similarity:
                continue
            scored_map[chunk_key] = {
                "chunk_key": chunk_key,
                "query_variant": variant,
                "score": round(float(similarity), 4),
                "embedding": row.get("embedding") or [],
                "document_id": row.get("document_id"),
                "chunk_index": int(row.get("chunk_index", 0)),
                "text": row.get("text") or row.get("text_preview") or "",
                "filename": doc.get("filename") or row.get("document_id"),
                "main_category": doc.get("main_category") or "general",
                "sub_category": doc.get("sub_category") or "",
                "visibility": doc.get("visibility") or "private",
            }
    mmr_selected = _apply_mmr(
        sorted(scored_map.values(), key=lambda item: float(item.get("score", 0.0)), reverse=True),
        top_k=top_k,
    )
    matches = []
    for item in mmr_selected:
        compressed = _compress_text_for_query(item.get("text", ""), query)
        matches.append(
            {
                **item,
                "compressed_text": compressed,
                "citation": {
                    "label": f"{item['filename']} - chunk {item['chunk_index'] + 1}",
                    "source_type": "knowledge_base",
                    "source_ref": item["document_id"],
                    "excerpt": compressed,
                    "content_url": f"/api/documents/{item['document_id']}/content",
                    "url": f"/api/documents/{item['document_id']}/content",
                    "metadata": {
                        "chunk_index": item["chunk_index"],
                        "query_variant": item["query_variant"],
                        "score": item["score"],
                    },
                },
            }
        )
    logger.info("chat_grounding.kb_retrieval.complete", returned=len(matches), variants=len(query_variants))
    return {"query_variants": query_variants, "matches": matches}
