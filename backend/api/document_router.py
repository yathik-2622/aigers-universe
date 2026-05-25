"""
Knowledge-base upload and ingestion APIs for AIgers Universe.

This router now uses a two-step flow:
1. Upload raw files and persist metadata into `aigers_documents`.
2. Trigger async ingestion to parse, chunk, embed, and store chunks in `aigers_chunks`.
"""
from __future__ import annotations

import datetime
import hashlib
import io
import mimetypes
import os
import re
import shutil
import uuid
import zipfile
from pathlib import Path

import httpx
import structlog
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from config import BASE_DIR, settings
from core.runtime_settings import resolve_external_key
from core.request_context import get_optional_user_id, require_user_id
from db.collection_names import AIGERS_CATEGORIES, AIGERS_CHUNKS, AIGERS_DOCUMENTS, AIGERS_GRAPH_LAYOUTS
from db.mongo_client import get_db
from document_processing.chunking import CHUNKING_STRATEGIES_INFO, hckb_chunk_texts
from document_processing.fingerprint import content_hash_from_bytes, file_sha256_hex
from document_processing.parsers import extract_text_from_bytes
from vectorstore.mongo_vector_store import add_document, delete_document_chunks

logger = structlog.get_logger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".html", ".htm",
    ".xml", ".yaml", ".yml", ".py", ".js", ".ts", ".tsx", ".jsx", ".java",
    ".go", ".rb", ".sql", ".ini", ".cfg", ".toml", ".png", ".jpg", ".jpeg",
    ".bmp", ".tif", ".tiff", ".webp",
}
KB_VISIBILITY = {"private", "public"}
MAX_FILE_SIZE_MB = 20
RAW_STORAGE_ROOT = BASE_DIR / "storage" / "documents"
REPO_IMPORT_MAX_ARCHIVE_BYTES = 80 * 1024 * 1024
REPO_IMPORT_MAX_TEXT_CHARS = 2_500_000
REPO_IMPORT_MAX_FILES = 5000


class CreateCategoryRequest(BaseModel):
    main_category: str = Field(..., min_length=1)
    sub_category: str | None = Field(default=None)


class IngestDocumentsRequest(BaseModel):
    document_ids: list[str] = Field(default_factory=list)


class UpdateDocumentVisibilityRequest(BaseModel):
    visibility: str = Field(...)


def _utcnow() -> str:
    return datetime.datetime.utcnow().isoformat()


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _normalize_category(value: str, fallback: str = "general") -> str:
    normalized = re.sub(r"\s+", " ", (value or "")).strip().lower()
    return normalized or fallback


def _normalize_visibility(value: str) -> str:
    candidate = (value or "private").strip().lower()
    return candidate if candidate in KB_VISIBILITY else "private"


def _hash_to_color(name: str) -> str:
    digest = hashlib.sha256((name or "unknown").encode("utf-8")).hexdigest()
    hue = int(digest[:8], 16) % 360
    return f"hsl({hue}, 72%, 58%)"


def _context_excerpt(text: str, limit: int = 24000) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    head = int(limit * 0.45)
    middle = int(limit * 0.2)
    tail = max(0, limit - head - middle - 40)
    midpoint = len(value) // 2
    middle_start = max(0, midpoint - (middle // 2))
    middle_end = min(len(value), middle_start + middle)
    return "\n...\n".join([
        value[:head].rstrip(),
        value[middle_start:middle_end].strip(),
        value[-tail:].lstrip(),
    ])


def _safe_filename(filename: str) -> str:
    candidate = Path(filename or "unnamed").name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", candidate) or "unnamed"


def _parse_github_repo_url(repo_url: str) -> tuple[str, str, str | None]:
    value = (repo_url or "").strip()
    pattern = re.compile(r"^https?://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/#?]+?)(?:\.git)?(?:/tree/(?P<branch>[^/#?]+))?/?$")
    match = pattern.match(value)
    if not match:
        raise HTTPException(status_code=422, detail="Enter a valid GitHub repository URL")
    return match.group("owner"), match.group("repo"), match.group("branch")


async def _download_github_repo_text(repo_url: str, user_id: str | None) -> dict:
    owner, repo, branch = _parse_github_repo_url(repo_url)
    token = await resolve_external_key("github_token", user_id)
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "AIgers-Universe"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
        repo_meta = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)
        if repo_meta.status_code >= 400:
            raise HTTPException(status_code=repo_meta.status_code, detail="Failed to read GitHub repository metadata")
        repo_payload = repo_meta.json()
        resolved_branch = branch or repo_payload.get("default_branch") or "main"
        archive = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/zipball/{resolved_branch}",
            headers=headers,
        )
        if archive.status_code >= 400:
            raise HTTPException(status_code=archive.status_code, detail="Failed to download the GitHub repository archive")
        archive_bytes = archive.content
        if len(archive_bytes) > REPO_IMPORT_MAX_ARCHIVE_BYTES:
            raise HTTPException(status_code=413, detail="Repository archive is too large to import")

    parts: list[str] = []
    files_indexed = 0
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            relative_parts = Path(info.filename).parts[1:]
            relative_path = "/".join(relative_parts)
            ext = Path(relative_path).suffix.lower()
            if ext and ext not in ALLOWED_EXTENSIONS:
                continue
            if files_indexed >= REPO_IMPORT_MAX_FILES:
                break
            try:
                raw_bytes = zf.read(info)
            except Exception:
                continue
            text = raw_bytes.decode("utf-8", errors="ignore")
            if not text.strip():
                continue
            parts.append(f"[FILE] {relative_path}\n{text[:24000]}")
            files_indexed += 1
            if sum(len(part) for part in parts) >= REPO_IMPORT_MAX_TEXT_CHARS:
                break

    combined_text = "\n\n".join(parts)[:REPO_IMPORT_MAX_TEXT_CHARS]
    if not combined_text.strip():
        raise HTTPException(status_code=422, detail="No supported text content was extracted from the GitHub repository")
    return {
        "filename": f"{owner}-{repo}-{resolved_branch}.repo.txt",
        "text": combined_text,
        "files_indexed": files_indexed,
        "branch": resolved_branch,
        "repo_url": repo_url.strip(),
    }


def _extract_text_from_file(filename: str, file_bytes: bytes, mime_type: str | None = None) -> str:
    parsed = extract_text_from_bytes(file_bytes=file_bytes, file_name=filename, mime_type=mime_type)
    return parsed.get("text") or ""


def _extract_pdf_text(file_bytes: bytes) -> str:
    return _extract_text_from_file("document.pdf", file_bytes, "application/pdf")


def _extract_docx_text(file_bytes: bytes) -> str:
    return _extract_text_from_file(
        "document.docx",
        file_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _extract_html_text(file_bytes: bytes) -> str:
    return _extract_text_from_file("document.html", file_bytes, "text/html")


def _extract_json_text(file_bytes: bytes) -> str:
    return _extract_text_from_file("document.json", file_bytes, "application/json")


def _extract_xml_like_text(file_bytes: bytes) -> str:
    return _extract_text_from_file("document.xml", file_bytes, "application/xml")


def _ensure_storage_dir(document_id: str) -> Path:
    target = RAW_STORAGE_ROOT / document_id
    target.mkdir(parents=True, exist_ok=True)
    return target


def _document_access_query(user_id: str | None) -> dict:
    access = {"visibility": "public"}
    if user_id:
        access = {"$or": [{"visibility": "public"}, {"owner_user_id": user_id}]}
    return {"$and": [{"scope": "knowledge_base"}, access, {"deleted_at": None}]}


async def _ensure_category(main_category: str, sub_category: str = "") -> dict:
    db = get_db()
    collection = db[AIGERS_CATEGORIES]
    main = _normalize_category(main_category)
    sub = _normalize_category(sub_category, fallback="") if sub_category else ""
    now = _utcnow()

    await collection.update_one(
        {"main_category": main},
        {
            "$setOnInsert": {
                "main_category": main,
                "main_label": main,
                "color": _hash_to_color(main),
                "subcategories": [],
                "created_at": now,
            }
        },
        upsert=True,
    )
    category_doc = await collection.find_one({"main_category": main}, {"_id": 0}) or {}
    if sub:
        subs = category_doc.get("subcategories") or []
        if not any(item.get("name") == sub for item in subs):
            await collection.update_one(
                {"main_category": main},
                {"$push": {"subcategories": {"name": sub, "label": sub, "color": _hash_to_color(f"{main}|{sub}")}}},
            )
            category_doc = await collection.find_one({"main_category": main}, {"_id": 0}) or category_doc
    return category_doc


async def ensure_document_indexes() -> None:
    db = get_db()
    await db[AIGERS_DOCUMENTS].create_index([("document_id", 1)], unique=True, name="document_id_1")
    await db[AIGERS_DOCUMENTS].create_index([("content_hash", 1), ("owner_user_id", 1), ("scope", 1)], name="content_hash_owner_scope_1")
    await db[AIGERS_DOCUMENTS].create_index([("visibility", 1), ("scope", 1), ("uploaded_at", -1)], name="visibility_scope_uploaded_1")
    await db[AIGERS_DOCUMENTS].create_index([("main_category", 1), ("sub_category", 1)], name="main_sub_category_1")
    await db[AIGERS_DOCUMENTS].create_index([("status", 1), ("scope", 1)], name="status_scope_1")
    await db[AIGERS_CHUNKS].create_index([("document_id", 1), ("chunk_index", 1)], name="document_chunk_1")
    await db[AIGERS_CHUNKS].create_index([("chunk_id", 1)], unique=True, name="chunk_id_1")
    await db[AIGERS_CATEGORIES].create_index([("main_category", 1)], unique=True, name="main_category_1")
    await db[AIGERS_GRAPH_LAYOUTS].create_index([("owner_user_id", 1), ("graph_id", 1)], unique=True, name="graph_owner_id_1")


async def _save_raw_file(document_id: str, filename: str, file_bytes: bytes) -> str:
    folder = _ensure_storage_dir(document_id)
    target = folder / _safe_filename(filename)
    target.write_bytes(file_bytes)
    return str(target)


async def _store_document_text(
    request: Request,
    filename: str,
    ext: str,
    text: str,
    category: str,
    *,
    sub_category: str = "",
    visibility: str = "private",
    scope: str = "knowledge_base",
    source_meta: dict | None = None,
    index_for_kb: bool = False,
    file_size_bytes: int = 0,
    chunk_strategy: str = "section-aware-large",
) -> dict:
    db = get_db()
    user_id = require_user_id(request)
    normalized_category = _normalize_category(category)
    normalized_sub_category = _normalize_category(sub_category, fallback="") if sub_category else ""
    normalized_visibility = _normalize_visibility(visibility)
    normalized_strategy = (chunk_strategy or "section-aware-large").strip().lower()
    if normalized_strategy not in CHUNKING_STRATEGIES_INFO:
        normalized_strategy = "section-aware-large"

    await _ensure_category(normalized_category, normalized_sub_category)

    text_value = text or ""
    document_id = str(uuid.uuid4())
    payload = {
        "document_id": document_id,
        "owner_user_id": user_id,
        "filename": filename,
        "file_type": ext,
        "file_size_bytes": int(file_size_bytes or len(text_value.encode("utf-8", errors="ignore"))),
        "file_hash": None,
        "content_hash": content_hash_from_bytes(text_value.encode("utf-8", errors="ignore"), ""),
        "raw_storage_path": None,
        "scope": scope,
        "visibility": normalized_visibility,
        "main_category": normalized_category,
        "sub_category": normalized_sub_category,
        "category": normalized_category,
        "main_color": _hash_to_color(normalized_category),
        "sub_color": _hash_to_color(f"{normalized_category}|{normalized_sub_category or 'default'}"),
        "chunk_strategy": normalized_strategy,
        "status": "uploaded",
        "parser": "direct_text",
        "text": text_value,
        "context_excerpt": _context_excerpt(text_value),
        "text_length": len(text_value),
        "chunk_count": 0,
        "vector_ids": [],
        "source_meta": source_meta or {},
        "ingest_error": None,
        "uploaded_at": _utcnow(),
        "updated_at": _utcnow(),
        "ingested_at": None,
        "deleted_at": None,
    }

    if index_for_kb and scope == "knowledge_base" and text_value.strip():
        chunks = hckb_chunk_texts(text_value, strategy=normalized_strategy)
        vector_ids: list[str] = []
        for index, chunk in enumerate(chunks):
            chunk_id = str(uuid.uuid4())
            vector_id = await add_document(
                text=chunk,
                metadata={
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_index": index,
                    "category": normalized_category,
                    "sub_category": normalized_sub_category,
                    "visibility": normalized_visibility,
                    "owner_user_id": user_id,
                    "scope": scope,
                    "main_color": payload["main_color"],
                    "sub_color": payload["sub_color"],
                },
            )
            vector_ids.append(vector_id)
        payload["status"] = "embedded"
        payload["chunk_count"] = len(chunks)
        payload["vector_ids"] = vector_ids
        payload["ingested_at"] = _utcnow()

    await db[AIGERS_DOCUMENTS].insert_one(payload)
    return payload


async def _create_raw_document_record(
    request: Request,
    *,
    filename: str,
    ext: str,
    file_bytes: bytes,
    category: str,
    sub_category: str,
    visibility: str,
    chunk_strategy: str,
) -> dict:
    db = get_db()
    user_id = require_user_id(request)
    normalized_category = _normalize_category(category)
    normalized_sub_category = _normalize_category(sub_category, fallback="") if sub_category else ""
    normalized_visibility = _normalize_visibility(visibility)
    normalized_strategy = (chunk_strategy or "section-aware-large").strip().lower()
    if normalized_strategy not in CHUNKING_STRATEGIES_INFO:
        normalized_strategy = "section-aware-large"

    await _ensure_category(normalized_category, normalized_sub_category)

    file_hash = file_sha256_hex(file_bytes)
    content_hash = content_hash_from_bytes(file_bytes, "")
    existing_docs = await db[AIGERS_DOCUMENTS].find(
        {
            "content_hash": content_hash,
            "scope": "knowledge_base",
            "deleted_at": None,
        },
        {"_id": 0},
    ).sort("uploaded_at", 1).to_list(20)
    public_docs = [doc for doc in existing_docs if doc.get("visibility") == "public"]
    same_user_docs = [doc for doc in existing_docs if doc.get("owner_user_id") == user_id]

    if public_docs:
        public_doc = public_docs[0]
        same_owner_public = public_doc.get("owner_user_id") == user_id
        reason = "public_duplicate_same_owner" if same_owner_public else "public_duplicate_other_owner"
        if normalized_visibility == "private":
            reason = "public_available_use_existing"
        return {
            "duplicate": True,
            "duplicate_reason": reason,
            "existing_document": public_doc,
            "same_owner": same_owner_public,
            "visibility_change_suggested": False,
        }

    if same_user_docs:
        preferred = same_user_docs[0]
        if preferred.get("visibility") == normalized_visibility:
            return {
                "duplicate": True,
                "duplicate_reason": "same_owner_same_visibility",
                "existing_document": preferred,
                "same_owner": True,
                "visibility_change_suggested": False,
            }
        if preferred.get("visibility") == "private" and normalized_visibility == "public":
            return {
                "duplicate": True,
                "duplicate_reason": "same_owner_private_to_public",
                "existing_document": preferred,
                "same_owner": True,
                "visibility_change_suggested": True,
            }
        return {
            "duplicate": True,
            "duplicate_reason": "same_owner_duplicate",
            "existing_document": preferred,
            "same_owner": True,
            "visibility_change_suggested": False,
        }

    document_id = str(uuid.uuid4())
    raw_storage_path = await _save_raw_file(document_id, filename, file_bytes)
    payload = {
        "document_id": document_id,
        "owner_user_id": user_id,
        "filename": filename,
        "file_type": ext,
        "file_size_bytes": len(file_bytes),
        "file_hash": file_hash,
        "content_hash": content_hash,
        "raw_storage_path": raw_storage_path,
        "scope": "knowledge_base",
        "visibility": normalized_visibility,
        "main_category": normalized_category,
        "sub_category": normalized_sub_category,
        "category": normalized_category,
        "main_color": _hash_to_color(normalized_category),
        "sub_color": _hash_to_color(f"{normalized_category}|{normalized_sub_category or 'default'}"),
        "chunk_strategy": normalized_strategy,
        "status": "uploaded",
        "parser": None,
        "text": None,
        "text_length": 0,
        "chunk_count": 0,
        "vector_ids": [],
        "ingest_error": None,
        "uploaded_at": _utcnow(),
        "updated_at": _utcnow(),
        "ingested_at": None,
        "deleted_at": None,
    }
    await db[AIGERS_DOCUMENTS].insert_one(payload)
    return payload


async def _ingest_document_task(document_id: str) -> None:
    db = get_db()
    document = await db[AIGERS_DOCUMENTS].find_one({"document_id": document_id, "deleted_at": None})
    if not document:
        return
    try:
        await db[AIGERS_DOCUMENTS].update_one(
            {"document_id": document_id},
            {"$set": {"status": "embedding", "updated_at": _utcnow(), "ingest_error": None}},
        )
        raw_path = document.get("raw_storage_path") or ""
        if not raw_path or not Path(raw_path).exists():
            raise FileNotFoundError("Raw file is missing from storage.")

        file_bytes = Path(raw_path).read_bytes()
        mime_type = mimetypes.guess_type(document.get("filename") or "")[0]
        parsed = extract_text_from_bytes(file_bytes=file_bytes, file_name=document.get("filename") or "", mime_type=mime_type)
        text = parsed.get("text") or ""
        if not text.strip():
            raise RuntimeError("No text content extracted from file")

        chunks = hckb_chunk_texts(text, strategy=document.get("chunk_strategy") or "section-aware-large")
        await delete_document_chunks(document_id)

        vector_ids: list[str] = []
        for index, chunk in enumerate(chunks):
            chunk_id = str(uuid.uuid4())
            vector_id = await add_document(
                text=chunk,
                metadata={
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "filename": document.get("filename"),
                    "chunk_index": index,
                    "category": document.get("main_category"),
                    "sub_category": document.get("sub_category"),
                    "visibility": document.get("visibility"),
                    "owner_user_id": document.get("owner_user_id"),
                    "scope": "knowledge_base",
                    "main_color": document.get("main_color"),
                    "sub_color": document.get("sub_color"),
                },
            )
            vector_ids.append(vector_id)

        await db[AIGERS_DOCUMENTS].update_one(
            {"document_id": document_id},
            {
                "$set": {
                    "status": "embedded",
                    "parser": parsed.get("parser"),
                    "text": text,
                    "context_excerpt": _context_excerpt(text),
                    "text_length": len(text),
                    "chunk_count": len(chunks),
                    "vector_ids": vector_ids,
                    "ingested_at": _utcnow(),
                    "updated_at": _utcnow(),
                    "ingest_error": None,
                }
            },
        )
        logger.info("aigers_documents.ingest.complete", document_id=document_id, chunk_count=len(chunks))
    except Exception as exc:
        logger.error("aigers_documents.ingest.failed", document_id=document_id, error=str(exc), exc_info=True)
        await db[AIGERS_DOCUMENTS].update_one(
            {"document_id": document_id},
            {"$set": {"status": "failed", "ingest_error": str(exc), "updated_at": _utcnow()}},
        )


def _serialize_document(document: dict) -> dict:
    return {
        "document_id": document.get("document_id"),
        "filename": document.get("filename"),
        "file_type": document.get("file_type"),
        "file_size_bytes": document.get("file_size_bytes", 0),
        "visibility": document.get("visibility"),
        "main_category": document.get("main_category"),
        "sub_category": document.get("sub_category"),
        "main_color": document.get("main_color"),
        "sub_color": document.get("sub_color"),
        "chunk_strategy": document.get("chunk_strategy"),
        "status": document.get("status"),
        "text_length": document.get("text_length", 0),
        "chunk_count": document.get("chunk_count", 0),
        "uploaded_at": document.get("uploaded_at"),
        "updated_at": document.get("updated_at"),
        "ingested_at": document.get("ingested_at"),
        "ingest_error": document.get("ingest_error"),
        "context_excerpt": document.get("context_excerpt"),
    }


def _serialize_duplicate_result(filename: str, duplicate_payload: dict) -> dict:
    existing = duplicate_payload.get("existing_document") or {}
    return {
        "filename": filename,
        "duplicate": True,
        "duplicate_reason": duplicate_payload.get("duplicate_reason"),
        "same_owner": bool(duplicate_payload.get("same_owner")),
        "visibility_change_suggested": bool(duplicate_payload.get("visibility_change_suggested")),
        "existing_document": _serialize_document(existing) if existing else None,
    }


@router.get("/chunking-strategies")
async def list_chunking_strategies():
    return {"strategies": CHUNKING_STRATEGIES_INFO}


@router.get("/categories")
async def list_categories(request: Request):
    db = get_db()
    user_id = get_optional_user_id(request)
    category_docs = await db[AIGERS_CATEGORIES].find({}, {"_id": 0}).sort("main_category", 1).to_list(200)
    counts = await db[AIGERS_DOCUMENTS].aggregate(
        [
            {"$match": _document_access_query(user_id)},
            {"$group": {"_id": {"main": "$main_category", "sub": "$sub_category"}, "count": {"$sum": 1}}},
        ]
    ).to_list(500)
    count_map = {(item["_id"].get("main") or "", item["_id"].get("sub") or ""): int(item.get("count") or 0) for item in counts}
    categories = []
    for item in category_docs:
        main = item.get("main_category") or "general"
        subcategories = []
        total = 0
        for sub in item.get("subcategories") or []:
            sub_name = sub.get("name") or ""
            sub_count = count_map.get((main, sub_name), 0)
            total += sub_count
            subcategories.append({"name": sub_name, "color": sub.get("color") or _hash_to_color(f"{main}|{sub_name}"), "count": sub_count})
        total += count_map.get((main, ""), 0)
        categories.append({"main": main, "color": item.get("color") or _hash_to_color(main), "subcategories": subcategories, "count": total})
    return {"categories": categories, "count": len(categories)}


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(request: Request, body: CreateCategoryRequest):
    require_user_id(request)
    category_doc = await _ensure_category(body.main_category, body.sub_category or "")
    return {"category": category_doc}


@router.post("/upload-many", status_code=status.HTTP_201_CREATED)
async def upload_documents_many(
    request: Request,
    files: list[UploadFile] = File(...),
    category: str = Form(default="general"),
    sub_category: str = Form(default=""),
    visibility: str = Form(default="private"),
    chunk_strategy: str = Form(default="section-aware-large"),
):
    require_user_id(request)
    results: list[dict] = []
    for file in files:
        filename = file.filename or "unnamed"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            results.append({"filename": filename, "error": f"Unsupported file type '{ext}'"})
            continue
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
            results.append({"filename": filename, "error": f"File exceeds {MAX_FILE_SIZE_MB}MB limit"})
            continue
        stored = await _create_raw_document_record(
            request,
            filename=filename,
            ext=ext,
            file_bytes=file_bytes,
            category=category,
            sub_category=sub_category,
            visibility=visibility,
            chunk_strategy=chunk_strategy,
        )
        if stored.get("duplicate"):
            results.append(_serialize_duplicate_result(filename, stored))
        else:
            results.append(_serialize_document(stored))
    return {"documents": results, "count": len(results)}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="general"),
    sub_category: str = Form(default=""),
    visibility: str = Form(default="private"),
    chunk_strategy: str = Form(default="section-aware-large"),
):
    response = await upload_documents_many(
        request,
        files=[file],
        category=category,
        sub_category=sub_category,
        visibility=visibility,
        chunk_strategy=chunk_strategy,
    )
    return response["documents"][0]


@router.post("/workflow-input/upload", status_code=status.HTTP_201_CREATED)
async def upload_workflow_input(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="workflow-input"),
):
    filename = file.filename or "unnamed"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_FILE_SIZE_MB}MB limit")
    mime_type = file.content_type or mimetypes.guess_type(filename)[0]
    text = _extract_text_from_file(filename, file_bytes, mime_type)
    if not text.strip():
        raise HTTPException(status_code=422, detail="No text content could be extracted from workflow input")
    stored = await _store_document_text(
        request,
        filename,
        ext,
        text,
        category,
        scope="workflow_input",
        source_meta={"ingest_mode": "workflow_upload"},
        index_for_kb=False,
        file_size_bytes=len(file_bytes),
    )
    return _serialize_document(stored)


@router.post("/import-github", status_code=status.HTTP_201_CREATED)
async def import_github_repo(
    request: Request,
    repo_url: str = Form(...),
    category: str = Form(default="repo-context"),
    sub_category: str = Form(default=""),
    visibility: str = Form(default="private"),
    chunk_strategy: str = Form(default="code-aware"),
):
    user_id = require_user_id(request)
    repo_payload = await _download_github_repo_text(repo_url, user_id)
    stored = await _store_document_text(
        request,
        repo_payload["filename"],
        ".txt",
        repo_payload["text"],
        category,
        sub_category=sub_category,
        visibility=visibility,
        scope="knowledge_base",
        source_meta={
            "ingest_mode": "github_repo_import",
            "repo_url": repo_payload["repo_url"],
            "branch": repo_payload["branch"],
            "files_indexed": repo_payload["files_indexed"],
        },
        index_for_kb=True,
        file_size_bytes=len(repo_payload["text"].encode("utf-8", errors="ignore")),
        chunk_strategy=chunk_strategy,
    )
    return {**_serialize_document(stored), "repo_url": repo_payload["repo_url"], "files_indexed": repo_payload["files_indexed"]}


@router.post("/workflow-input/import-github", status_code=status.HTTP_201_CREATED)
async def import_workflow_github_repo(
    request: Request,
    repo_url: str = Form(...),
    category: str = Form(default="workflow-input"),
):
    user_id = require_user_id(request)
    repo_payload = await _download_github_repo_text(repo_url, user_id)
    stored = await _store_document_text(
        request,
        repo_payload["filename"],
        ".txt",
        repo_payload["text"],
        category,
        scope="workflow_input",
        source_meta={
            "ingest_mode": "workflow_github_repo_import",
            "repo_url": repo_payload["repo_url"],
            "branch": repo_payload["branch"],
            "files_indexed": repo_payload["files_indexed"],
        },
        index_for_kb=False,
        file_size_bytes=len(repo_payload["text"].encode("utf-8", errors="ignore")),
        chunk_strategy="code-aware",
    )
    return {**_serialize_document(stored), "repo_url": repo_payload["repo_url"], "files_indexed": repo_payload["files_indexed"]}


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_documents(request: Request, body: IngestDocumentsRequest, background_tasks: BackgroundTasks):
    user_id = require_user_id(request)
    db = get_db()
    if not body.document_ids:
        raise HTTPException(status_code=422, detail="Provide at least one document id")
    docs = await db[AIGERS_DOCUMENTS].find(
        {"document_id": {"$in": body.document_ids}, "owner_user_id": user_id, "deleted_at": None},
        {"_id": 0, "document_id": 1, "status": 1},
    ).to_list(len(body.document_ids))
    if not docs:
        raise HTTPException(status_code=404, detail="No matching documents found for ingestion")
    queued = []
    for document in docs:
        if document.get("status") == "embedding":
            continue
        background_tasks.add_task(_ingest_document_task, document["document_id"])
        queued.append(document["document_id"])
    return {"queued_document_ids": queued, "count": len(queued)}


@router.post("/{document_id}/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(document_id: str, request: Request, background_tasks: BackgroundTasks):
    return await ingest_documents(request, IngestDocumentsRequest(document_ids=[document_id]), background_tasks)


@router.get("")
async def list_documents(
    request: Request,
    category: str | None = None,
    sub_category: str | None = None,
    visibility: str | None = None,
    status_filter: str | None = None,
):
    db = get_db()
    query = _document_access_query(get_optional_user_id(request))
    if category:
        query["$and"].append({"main_category": _normalize_category(category)})
    if sub_category:
        query["$and"].append({"sub_category": _normalize_category(sub_category, fallback="")})
    if visibility in KB_VISIBILITY:
        query["$and"].append({"visibility": visibility})
    if status_filter:
        query["$and"].append({"status": status_filter})
    documents = await db[AIGERS_DOCUMENTS].find(query, {"_id": 0, "text": 0}).sort("uploaded_at", -1).to_list(300)
    return {"documents": [_serialize_document(item) for item in documents], "count": len(documents)}


@router.get("/{document_id}")
async def get_document(document_id: str, request: Request):
    db = get_db()
    query = _document_access_query(get_optional_user_id(request))
    query["$and"].append({"document_id": document_id})
    document = await db[AIGERS_DOCUMENTS].find_one(query, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    return document


@router.patch("/{document_id}/visibility")
async def update_document_visibility(document_id: str, request: Request, body: UpdateDocumentVisibilityRequest):
    user_id = require_user_id(request)
    visibility = _normalize_visibility(body.visibility)
    db = get_db()
    document = await db[AIGERS_DOCUMENTS].find_one(
        {"document_id": document_id, "owner_user_id": user_id, "deleted_at": None, "scope": "knowledge_base"},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    if document.get("visibility") == visibility:
        return {"document": _serialize_document(document), "updated": False}
    await db[AIGERS_DOCUMENTS].update_one(
        {"document_id": document_id},
        {"$set": {"visibility": visibility, "updated_at": _utcnow()}},
    )
    await db[AIGERS_CHUNKS].update_many(
        {"document_id": document_id},
        {"$set": {"visibility": visibility, "metadata.visibility": visibility}},
    )
    updated = await db[AIGERS_DOCUMENTS].find_one({"document_id": document_id}, {"_id": 0})
    return {"document": _serialize_document(updated or document), "updated": True}


@router.get("/{document_id}/content")
async def get_document_content(document_id: str, request: Request):
    db = get_db()
    user_id = get_optional_user_id(request)
    access_query = [{"document_id": document_id}, {"deleted_at": None}]
    if user_id:
        access_query.append({"$or": [{"owner_user_id": user_id}, {"visibility": "public"}]})
    else:
        access_query.append({"visibility": "public"})
    document = await db[AIGERS_DOCUMENTS].find_one({"$and": access_query}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    text = (document.get("text") or document.get("context_excerpt") or "").strip()
    if not text and document.get("raw_storage_path"):
        raw_file = Path(document["raw_storage_path"])
        if raw_file.exists():
            try:
                text = raw_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                text = ""
    return {
        "document_id": document.get("document_id"),
        "filename": document.get("filename"),
        "file_type": document.get("file_type"),
        "scope": document.get("scope"),
        "visibility": document.get("visibility"),
        "main_category": document.get("main_category"),
        "sub_category": document.get("sub_category"),
        "updated_at": document.get("updated_at"),
        "content": text,
    }


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, request: Request):
    user_id = require_user_id(request)
    db = get_db()
    document = await db[AIGERS_DOCUMENTS].find_one({"document_id": document_id, "owner_user_id": user_id, "deleted_at": None}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    if document.get("status") == "embedding":
        raise HTTPException(status_code=409, detail="Document is currently embedding. Retry when processing completes.")
    await delete_document_chunks(document_id)
    raw_path = document.get("raw_storage_path")
    if raw_path:
        try:
            raw_file = Path(raw_path)
            if raw_file.exists():
                raw_file.unlink()
            parent = raw_file.parent
            if parent.exists():
                shutil.rmtree(parent, ignore_errors=True)
        except Exception as exc:
            logger.warning("aigers_documents.delete_raw_file_failed", document_id=document_id, error=str(exc))
    await db[AIGERS_DOCUMENTS].update_one(
        {"document_id": document_id},
        {"$set": {"deleted_at": _utcnow(), "updated_at": _utcnow(), "status": "deleted"}},
    )


async def cleanup_expired_workflow_inputs() -> int:
    return 0
