import math
from collections import defaultdict

import structlog
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from core.request_context import require_user_id
from db.collection_names import AIGERS_CHUNKS, AIGERS_DOCUMENTS, AIGERS_GRAPH_LAYOUTS
from db.mongo_client import get_db

router = APIRouter()
logger = structlog.get_logger(__name__)


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


def _project_embeddings(vectors: list[list[float]], dims: int = 3) -> list[list[float]]:
    if not vectors:
        return []
    try:
        from sklearn.decomposition import PCA

        reduced = PCA(n_components=min(dims, len(vectors), len(vectors[0]))).fit_transform(vectors)
        points = []
        for row in reduced.tolist():
            padded = (row + [0.0] * dims)[:dims]
            points.append([float(padded[0]), float(padded[1]), float(padded[2] if dims > 2 else 0.0)])
        return points
    except Exception as exc:
        logger.warning("knowledge_graph.embedding_projection_failed", error=str(exc))
        return [[0.0, 0.0, 0.0] for _ in vectors]


class NodePosition(BaseModel):
    id: str
    x: float
    y: float
    z: float = 0.0


class SaveLayoutRequest(BaseModel):
    graph_id: str = Field(default="default")
    positions: list[NodePosition] = Field(default_factory=list)


@router.get("/data")
async def get_knowledge_graph_data(
    request: Request,
    category: str | None = Query(default=None),
    sub_category: str | None = Query(default=None),
    visibility: str | None = Query(default=None),
    limit_chunks: int = Query(default=240, ge=20, le=1000),
    neighbor_k: int = Query(default=6, ge=2, le=20),
):
    user_id = require_user_id(request)
    db = get_db()

    doc_access = {"$or": [{"visibility": "public"}, {"owner_user_id": user_id}]}
    doc_query: dict = {"$and": [{"scope": "knowledge_base"}, {"status": "embedded"}, {"deleted_at": None}, doc_access]}
    if visibility in {"public", "private"}:
        doc_query["$and"].append({"visibility": visibility})
    if category:
        doc_query["$and"].append({"main_category": category.strip().lower()})
    if sub_category:
        doc_query["$and"].append({"sub_category": sub_category.strip().lower()})

    docs = await db[AIGERS_DOCUMENTS].find(
        doc_query,
        {
            "_id": 0,
            "document_id": 1,
            "filename": 1,
            "main_category": 1,
            "sub_category": 1,
            "main_color": 1,
            "sub_color": 1,
            "visibility": 1,
            "owner_user_id": 1,
        },
    ).sort("uploaded_at", -1).to_list(500)
    doc_map = {doc["document_id"]: doc for doc in docs}
    if not doc_map:
        return {"nodes": [], "links": [], "legend": {}, "counts": {}}

    chunk_query: dict = {"document_id": {"$in": list(doc_map.keys())}}
    chunk_rows = await db[AIGERS_CHUNKS].find(
        chunk_query,
        {"_id": 0, "document_id": 1, "chunk_index": 1, "text_preview": 1, "embedding": 1},
    ).limit(limit_chunks).to_list(limit_chunks)

    nodes: list[dict] = []
    links: list[dict] = []
    legend: dict[str, str] = {}
    counts: dict[str, int] = defaultdict(int)
    category_node_ids: dict[str, str] = {}
    sub_node_ids: dict[str, str] = {}
    doc_node_ids: dict[str, str] = {}

    for doc in docs:
        main = doc.get("main_category") or "general"
        sub = doc.get("sub_category") or ""
        main_color = doc.get("main_color") or "#2563eb"
        sub_color = doc.get("sub_color") or main_color

        if main not in category_node_ids:
            node_id = f"cat::{main}"
            category_node_ids[main] = node_id
            legend[main] = main_color
            nodes.append({"id": node_id, "label": main, "type": "main", "category": main, "color": main_color})
        counts[main] += 1

        if sub:
            sub_key = f"{main}::{sub}"
            if sub_key not in sub_node_ids:
                node_id = f"sub::{sub_key}"
                sub_node_ids[sub_key] = node_id
                nodes.append(
                    {
                        "id": node_id,
                        "label": sub,
                        "type": "sub",
                        "category": main,
                        "sub_category": sub,
                        "color": sub_color,
                    }
                )
                links.append({"source": category_node_ids[main], "target": node_id, "similarity": 1.0, "edge_type": "structural"})

        doc_node_id = f"doc::{doc['document_id']}"
        doc_node_ids[doc["document_id"]] = doc_node_id
        nodes.append(
            {
                "id": doc_node_id,
                "label": doc.get("filename") or doc["document_id"],
                "type": "sub",
                "node_kind": "document",
                "category": main,
                "sub_category": sub,
                "color": sub_color,
                "document_id": doc["document_id"],
                "docId": doc["document_id"],
                "visibility": doc.get("visibility") or "private",
            }
        )
        links.append(
            {
                "source": sub_node_ids.get(f"{main}::{sub}") or category_node_ids[main],
                "target": doc_node_id,
                "similarity": 1.0,
                "edge_type": "structural",
            }
        )

    vectors: list[list[float]] = []
    chunk_nodes: list[dict] = []
    for row in chunk_rows:
        embedding = row.get("embedding") or []
        doc_id = row.get("document_id")
        if not embedding or doc_id not in doc_map:
            continue
        doc = doc_map[doc_id]
        chunk_id = f"chunk::{doc_id}::{row.get('chunk_index', 0)}"
        chunk_nodes.append(
            {
                "id": chunk_id,
                "label": f"{doc.get('filename') or doc_id} :: chunk {int(row.get('chunk_index', 0)) + 1}",
                "type": "chunk",
                "category": doc.get("main_category") or "general",
                "sub_category": doc.get("sub_category") or "",
                "color": doc.get("sub_color") or doc.get("main_color") or "#60a5fa",
                "document_id": doc_id,
                "docId": doc_id,
                "preview": row.get("text_preview") or "",
                "embedding": embedding,
            }
        )
        vectors.append(embedding)

    coords = _project_embeddings(vectors, dims=3)
    for chunk, coord in zip(chunk_nodes, coords):
        chunk["x"], chunk["y"], chunk["z"] = coord
        nodes.append(chunk)
        links.append(
            {
                "source": doc_node_ids[chunk["document_id"]],
                "target": chunk["id"],
                "similarity": 1.0,
                "edge_type": "structural",
            }
        )

    for i, source in enumerate(chunk_nodes):
        scored: list[tuple[float, dict]] = []
        for j, target in enumerate(chunk_nodes):
            if i == j:
                continue
            score = _cosine(source["embedding"], target["embedding"])
            scored.append((score, target))
        scored.sort(key=lambda item: item[0], reverse=True)
        for score, target in scored[:neighbor_k]:
            if score < 0.72:
                continue
            if source["id"] < target["id"]:
                links.append(
                    {
                        "source": source["id"],
                        "target": target["id"],
                        "similarity": round(float(score), 4),
                        "edge_type": "semantic",
                    }
                )

    layout_doc = await db[AIGERS_GRAPH_LAYOUTS].find_one({"owner_user_id": user_id, "graph_id": "default"}, {"_id": 0})
    positions = (layout_doc or {}).get("positions", {})
    for node in nodes:
        saved = positions.get(node["id"])
        if saved:
            node.update({"x": saved.get("x", node.get("x", 0.0)), "y": saved.get("y", node.get("y", 0.0)), "z": saved.get("z", node.get("z", 0.0))})

    for node in nodes:
        node.pop("embedding", None)

    return {"nodes": nodes, "links": links, "legend": legend, "counts": dict(counts)}


@router.post("/layout")
async def save_knowledge_graph_layout(request: Request, body: SaveLayoutRequest):
    user_id = require_user_id(request)
    db = get_db()
    positions = {item.id: {"x": item.x, "y": item.y, "z": item.z} for item in body.positions}
    await db[AIGERS_GRAPH_LAYOUTS].update_one(
        {"owner_user_id": user_id, "graph_id": body.graph_id},
        {"$set": {"positions": positions, "owner_user_id": user_id, "graph_id": body.graph_id}},
        upsert=True,
    )
    return {"saved": len(positions), "graph_id": body.graph_id}
