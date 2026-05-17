"""
Document upload API router — PDF/DOCX text extraction + FAISS indexing.
"""
import os
import io
import uuid
import datetime
import structlog
from fastapi import APIRouter, HTTPException, UploadFile, File, status

from db.mongo_client import get_db
from vectorstore.faiss_store import add_document

logger = structlog.get_logger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE_MB = 20


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


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...)):
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
        else:  # .txt
            text = file_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.error("doc.extract_failed", filename=filename, error=str(exc))
        raise HTTPException(status_code=422, detail=f"Failed to extract text: {exc}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="No text content extracted from file")

    document_id = str(uuid.uuid4())
    chunk_size = 1000
    overlap = 200
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunk = text[i:i + chunk_size]
        if chunk.strip():
            chunks.append(chunk)

    vector_ids = []
    for idx, chunk in enumerate(chunks):
        try:
            vec_id = await add_document(
                text=chunk,
                metadata={"document_id": document_id, "filename": filename, "chunk_index": idx},
            )
            vector_ids.append(vec_id)
        except Exception as exc:
            logger.warning("doc.chunk_embed_failed", chunk_index=idx, error=str(exc))

    db = get_db()
    await db.documents.insert_one({
        "document_id": document_id,
        "filename": filename,
        "file_type": ext,
        "text": text,
        "text_length": len(text),
        "chunk_count": len(chunks),
        "vector_ids": vector_ids,
        "uploaded_at": datetime.datetime.utcnow().isoformat(),
    })

    logger.info("doc.upload.complete", document_id=document_id, chunks=len(chunks), indexed=len(vector_ids))
    return {
        "document_id": document_id,
        "filename": filename,
        "text_preview": text[:300],
        "text_length": len(text),
        "chunk_count": len(chunks),
        "vectors_indexed": len(vector_ids),
    }


@router.get("")
async def list_documents():
    db = get_db()
    docs = await db.documents.find({}, {"_id": 0, "text": 0, "vector_ids": 0}).sort("uploaded_at", -1).to_list(200)
    return {"documents": docs, "count": len(docs)}


@router.get("/{document_id}")
async def get_document(document_id: str):
    db = get_db()
    doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0, "vector_ids": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    return doc
