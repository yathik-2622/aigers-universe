"""
Document upload API router — PDF/DOCX text extraction + FAISS indexing.
"""
import os
import io
import uuid
import datetime
import html
import json
import re
import zipfile
import structlog
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File, status
import httpx
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from core.request_context import get_optional_user_id
from db.mongo_client import get_db
from vectorstore.faiss_store import add_document

logger = structlog.get_logger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".html", ".htm",
    ".xml", ".yaml", ".yml", ".py", ".js", ".ts", ".tsx", ".jsx", ".java",
    ".go", ".rb", ".sql", ".ini", ".cfg", ".toml",
}
MAX_FILE_SIZE_MB = 20
TEXT_FILE_EXTENSIONS = {".md", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rb", ".sql", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".toml", ".ini", ".cfg"}


def _extract_pdf_text(file_bytes: bytes) -> str:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def _extract_docx_text(file_bytes: bytes) -> str:
    from docx import Document as DocxDocument
    doc = DocxDocument(io.BytesIO(file_bytes))
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())


def _extract_html_text(file_bytes: bytes) -> str:
    raw = file_bytes.decode("utf-8", errors="ignore")
    raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return html.unescape(re.sub(r"\s+", " ", raw)).strip()


def _extract_json_text(file_bytes: bytes) -> str:
    obj = json.loads(file_bytes.decode("utf-8", errors="ignore"))
    return json.dumps(obj, indent=2, ensure_ascii=True)


def _extract_xml_like_text(file_bytes: bytes) -> str:
    raw = file_bytes.decode("utf-8", errors="ignore")
    raw = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", raw).strip()


def _normalize_scope(scope: str) -> str:
    normalized = (scope or "knowledge_base").strip().lower()
    return normalized if normalized in {"knowledge_base", "workflow_input", "chat_input"} else "knowledge_base"


def _retention_expiry(days: int) -> str:
    return (datetime.datetime.utcnow() + datetime.timedelta(days=max(1, days))).isoformat()


def _document_query_for_scope(user_id: str | None, scope: str) -> dict:
    query: dict = {"scope": scope}
    if scope == "knowledge_base":
        query = {
            "$or": [
                {"scope": {"$exists": False}},
                {"scope": "knowledge_base"},
            ]
        }
    if user_id:
        query = {"$and": [query, {"owner_user_id": user_id}]}
    return query


async def _store_document_text(
    request: Request,
    filename: str,
    ext: str,
    text: str,
    category: str,
    scope: str = "knowledge_base",
    source_meta: dict | None = None,
    index_for_kb: bool = True,
    file_size_bytes: int = 0,
) -> dict:
    if not text.strip():
        raise HTTPException(status_code=422, detail="No text content extracted from file")

    document_id = str(uuid.uuid4())
    normalized_scope = _normalize_scope(scope)
    splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=180)
    chunks = [chunk for chunk in splitter.split_text(text) if chunk.strip()]

    vector_ids = []
    if index_for_kb:
        for idx, chunk in enumerate(chunks):
            try:
                vec_id = await add_document(
                    text=chunk,
                    metadata={"document_id": document_id, "filename": filename, "chunk_index": idx, "category": category},
                )
                vector_ids.append(vec_id)
            except Exception as exc:
                logger.warning("doc.chunk_embed_failed", chunk_index=idx, error=str(exc))

    db = get_db()
    await db.documents.insert_one({
        "document_id": document_id,
        "owner_user_id": get_optional_user_id(request),
        "filename": filename,
        "category": category.strip().lower() or "general",
        "file_type": ext,
        "scope": normalized_scope,
        "source_meta": source_meta or {},
        "file_size_bytes": int(file_size_bytes or 0),
        "text": text,
        "text_length": len(text),
        "chunk_count": len(chunks),
        "vector_ids": vector_ids,
        "retention_expires_at": _retention_expiry(settings.WORKFLOW_INPUT_RETENTION_DAYS) if normalized_scope in {"workflow_input", "chat_input"} else None,
        "uploaded_at": datetime.datetime.utcnow().isoformat(),
    })
    return {
        "document_id": document_id,
        "filename": filename,
        "category": category.strip().lower() or "general",
        "text_preview": text[:300],
        "text_length": len(text),
        "chunk_count": len(chunks),
        "vectors_indexed": len(vector_ids),
        "scope": normalized_scope,
    }


async def cleanup_expired_workflow_inputs() -> int:
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()
    result = await db.documents.delete_many(
        {
            "scope": {"$in": ["workflow_input", "chat_input"]},
            "retention_expires_at": {"$ne": None, "$lte": now},
        }
    )
    if result.deleted_count:
        logger.info("doc.workflow_input_cleanup.complete", deleted=result.deleted_count)
    return result.deleted_count


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(request: Request, file: UploadFile = File(...), category: str = Form(default="general")):
    filename = file.filename or "unnamed"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    try:
        if ext == ".pdf":
            text = _extract_pdf_text(file_bytes)
        elif ext == ".docx":
            text = _extract_docx_text(file_bytes)
        elif ext in {".html", ".htm"}:
            text = _extract_html_text(file_bytes)
        elif ext == ".json":
            text = _extract_json_text(file_bytes)
        elif ext in {".xml"}:
            text = _extract_xml_like_text(file_bytes)
        else:  # .txt
            text = file_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.error("doc.extract_failed", filename=filename, error=str(exc))
        raise HTTPException(status_code=422, detail=f"Failed to extract text: {exc}")

    result = await _store_document_text(request, filename, ext, text, category, scope="knowledge_base", index_for_kb=True, file_size_bytes=len(file_bytes))
    logger.info("doc.upload.complete", document_id=result["document_id"], chunks=result["chunk_count"], indexed=result["vectors_indexed"])
    return result


@router.get("")
async def list_documents(request: Request):
    db = get_db()
    user_id = get_optional_user_id(request)
    query = _document_query_for_scope(user_id, "knowledge_base")
    docs = await db.documents.find(query, {"_id": 0, "text": 0, "vector_ids": 0}).sort("uploaded_at", -1).to_list(200)
    return {"documents": docs, "count": len(docs)}


@router.get("/{document_id}")
async def get_document(document_id: str, request: Request):
    db = get_db()
    query = {"document_id": document_id}
    user_id = get_optional_user_id(request)
    if user_id:
        query["owner_user_id"] = user_id
    doc = await db.documents.find_one(query, {"_id": 0, "vector_ids": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    return doc


@router.post("/import-github")
async def import_github_repo(request: Request, repo_url: str = Form(...), category: str = Form(default="repo-context")):
    match = re.search(r"github\.com/([^/]+)/([^/#?]+)", repo_url)
    if not match:
        raise HTTPException(status_code=422, detail="Provide a valid GitHub repository URL")
    owner, repo = match.group(1), match.group(2).replace(".git", "")
    headers = {"Accept": "application/vnd.github+json"}
    token = settings.GITHUB_TOKEN.strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    archive_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(archive_url, headers=headers)
        response.raise_for_status()
        zip_bytes = response.content

    texts: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            ext = os.path.splitext(info.filename)[1].lower()
            if info.is_dir() or ext not in TEXT_FILE_EXTENSIONS:
                continue
            try:
                content = zf.read(info.filename).decode("utf-8", errors="ignore")
            except Exception:
                continue
            if content.strip():
                texts.append(f"# FILE: {info.filename}\n{content[:20000]}")
            if len(texts) >= 80:
                break

    if not texts:
        raise HTTPException(status_code=422, detail="No supported text files found in the repository archive")

    merged_text = "\n\n".join(texts)
    result = await _store_document_text(
        request,
        f"{owner}-{repo}.zip",
        ".zip",
        merged_text,
        category,
        scope="knowledge_base",
        source_meta={"repo_url": repo_url, "repo_owner": owner, "repo_name": repo},
        index_for_kb=True,
        file_size_bytes=len(zip_bytes),
    )
    result["repo_url"] = repo_url
    result["files_indexed"] = len(texts)
    return result


@router.post("/workflow-input/upload", status_code=status.HTTP_201_CREATED)
async def upload_workflow_input(request: Request, file: UploadFile = File(...), category: str = Form(default="workflow-input")):
    filename = file.filename or "unnamed"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    try:
        if ext == ".pdf":
            text = _extract_pdf_text(file_bytes)
        elif ext == ".docx":
            text = _extract_docx_text(file_bytes)
        elif ext in {".html", ".htm"}:
            text = _extract_html_text(file_bytes)
        elif ext == ".json":
            text = _extract_json_text(file_bytes)
        elif ext in {".xml"}:
            text = _extract_xml_like_text(file_bytes)
        else:
            text = file_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.error("doc.workflow_input_extract_failed", filename=filename, error=str(exc))
        raise HTTPException(status_code=422, detail=f"Failed to extract text: {exc}")

    result = await _store_document_text(
        request,
        filename,
        ext,
        text,
        category,
        scope="workflow_input",
        source_meta={"ingest_mode": "file_upload"},
        index_for_kb=False,
        file_size_bytes=len(file_bytes),
    )
    logger.info("doc.workflow_input_upload.complete", document_id=result["document_id"], filename=filename, chunks=result["chunk_count"])
    return result


@router.post("/workflow-input/import-github", status_code=status.HTTP_201_CREATED)
async def import_workflow_input_repo(request: Request, repo_url: str = Form(...), category: str = Form(default="workflow-input")):
    match = re.search(r"github\.com/([^/]+)/([^/#?]+)", repo_url)
    if not match:
        raise HTTPException(status_code=422, detail="Provide a valid GitHub repository URL")
    owner, repo = match.group(1), match.group(2).replace(".git", "")
    headers = {"Accept": "application/vnd.github+json"}
    token = settings.GITHUB_TOKEN.strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    archive_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(archive_url, headers=headers)
        response.raise_for_status()
        zip_bytes = response.content

    texts: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            ext = os.path.splitext(info.filename)[1].lower()
            if info.is_dir() or ext not in TEXT_FILE_EXTENSIONS:
                continue
            try:
                content = zf.read(info.filename).decode("utf-8", errors="ignore")
            except Exception:
                continue
            if content.strip():
                texts.append(f"# FILE: {info.filename}\n{content[:20000]}")
            if len(texts) >= 80:
                break

    if not texts:
        raise HTTPException(status_code=422, detail="No supported text files found in the repository archive")

    merged_text = "\n\n".join(texts)
    result = await _store_document_text(
        request,
        f"{owner}-{repo}.zip",
        ".zip",
        merged_text,
        category,
        scope="workflow_input",
        source_meta={"ingest_mode": "github_import", "repo_url": repo_url, "repo_owner": owner, "repo_name": repo},
        index_for_kb=False,
        file_size_bytes=len(zip_bytes),
    )
    result["repo_url"] = repo_url
    result["files_indexed"] = len(texts)
    return result


@router.post("/workflow-input/cleanup")
async def cleanup_workflow_inputs():
    deleted = await cleanup_expired_workflow_inputs()
    return {"deleted": deleted, "retention_days": settings.WORKFLOW_INPUT_RETENTION_DAYS}
