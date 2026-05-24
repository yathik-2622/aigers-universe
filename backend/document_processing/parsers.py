"""
Shared document parsing helpers for AIger's Universe.

The parser flow intentionally prefers higher-fidelity loaders first and then
falls back to simpler decoders so uploads stay resilient even when optional
dependencies are unavailable.
"""
from __future__ import annotations

import io
import json
import os
import re
import tempfile
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

_LANGCHAIN_AVAILABLE = False
try:
    from langchain_community.document_loaders.csv_loader import CSVLoader  # type: ignore
    from langchain_community.document_loaders.html_bs import BSHTMLLoader  # type: ignore
    from langchain_community.document_loaders.json_loader import JSONLoader  # type: ignore
    from langchain_community.document_loaders.pdf import PyPDFLoader  # type: ignore
    from langchain_community.document_loaders.python import PythonLoader  # type: ignore
    from langchain_community.document_loaders.text import TextLoader  # type: ignore
    from langchain_community.document_loaders.unstructured import UnstructuredFileLoader  # type: ignore

    _LANGCHAIN_AVAILABLE = True
except Exception as exc:
    logger.warning("parsers.langchain_loader_unavailable", error=str(exc))
    _LANGCHAIN_AVAILABLE = False

try:
    import fitz  # type: ignore
except Exception:
    fitz = None

try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None

try:
    from PIL import Image  # type: ignore
except Exception:
    Image = None

try:
    import pytesseract  # type: ignore
except Exception:
    pytesseract = None


LOADER_BY_EXT: dict[str, str] = {
    ".txt": "TextLoader",
    ".md": "TextLoader",
    ".py": "PythonLoader",
    ".js": "TextLoader",
    ".json": "JSONLoader",
    ".csv": "CSVLoader",
    ".html": "BSHTMLLoader",
    ".htm": "BSHTMLLoader",
    ".pdf": "PyPDFLoader",
    ".docx": "UnstructuredFileLoader",
    ".pptx": "UnstructuredFileLoader",
    ".xlsx": "UnstructuredFileLoader",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _load_with_langchain(loader_name: str, file_bytes: bytes, ext: str) -> dict[str, Any]:
    suffix = ext if ext.startswith(".") else ""
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            tmp.write(file_bytes)

        loader = None
        if loader_name == "TextLoader":
            loader = TextLoader(temp_path, encoding="utf8")
        elif loader_name == "CSVLoader":
            loader = CSVLoader(temp_path)
        elif loader_name == "JSONLoader":
            loader = JSONLoader(temp_path)
        elif loader_name == "PythonLoader":
            loader = PythonLoader(temp_path)
        elif loader_name == "BSHTMLLoader":
            loader = BSHTMLLoader(temp_path)
        elif loader_name == "PyPDFLoader":
            loader = PyPDFLoader(temp_path)
        elif loader_name == "UnstructuredFileLoader":
            loader = UnstructuredFileLoader(temp_path)

        if loader is None:
            return {"page_texts": [], "pages": 0, "parser": "langchain:unsupported"}

        docs = loader.load()
        page_texts: list[str] = []
        for doc in docs:
            page_texts.append((getattr(doc, "page_content", None) or "").strip())
        page_texts = [text for text in page_texts if text]
        return {"page_texts": page_texts, "pages": max(1, len(page_texts)), "parser": f"langchain:{loader_name}"}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def _parse_pdf_pymupdf(file_bytes: bytes) -> dict[str, Any]:
    if not fitz:
        return {"page_texts": [], "pages": 0, "parser": "pymupdf_unavailable"}
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        texts: list[str] = []
        for i in range(doc.page_count):
            page = doc.load_page(i)
            text = (page.get_text("text") or "").strip()
            if text:
                texts.append(text)
        doc.close()
        return {"page_texts": texts, "pages": max(1, len(texts)), "parser": "pymupdf"}
    except Exception as exc:
        logger.warning("parsers.pymupdf_failed", error=str(exc))
        return {"page_texts": [], "pages": 0, "parser": "pymupdf_failed"}


def _parse_pdf_pdfplumber(file_bytes: bytes) -> dict[str, Any]:
    if not pdfplumber:
        return {"page_texts": [], "pages": 0, "parser": "pdfplumber_unavailable"}
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            texts = [(page.extract_text() or "").strip() for page in pdf.pages]
        texts = [text for text in texts if text]
        return {"page_texts": texts, "pages": max(1, len(texts)), "parser": "pdfplumber"}
    except Exception as exc:
        logger.warning("parsers.pdfplumber_failed", error=str(exc))
        return {"page_texts": [], "pages": 0, "parser": "pdfplumber_failed"}


def _parse_as_text(file_bytes: bytes, ext: str) -> dict[str, Any]:
    raw = file_bytes.decode("utf-8", errors="ignore")
    if ext == ".json":
        try:
            obj = json.loads(raw)
            raw = json.dumps(obj, indent=2, ensure_ascii=True)
        except Exception:
            pass
    if ext in {".html", ".htm", ".xml"}:
        raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw, flags=re.IGNORECASE)
        raw = re.sub(r"<[^>]+>", " ", raw)
    raw = _normalize_text(raw)
    if not raw:
        return {"page_texts": [], "pages": 0, "parser": "text_decoder_empty"}
    return {"page_texts": [raw], "pages": 1, "parser": "text_decoder"}


def _parse_image_with_ocr(file_bytes: bytes) -> dict[str, Any]:
    if not Image or not pytesseract:
        return {"page_texts": [], "pages": 0, "parser": "ocr_unavailable"}
    try:
        image = Image.open(io.BytesIO(file_bytes))
        text = _normalize_text(pytesseract.image_to_string(image) or "")
        if not text:
            return {"page_texts": [], "pages": 0, "parser": "ocr_empty"}
        return {"page_texts": [text], "pages": 1, "parser": "pytesseract"}
    except Exception as exc:
        logger.warning("parsers.ocr_failed", error=str(exc))
        return {"page_texts": [], "pages": 0, "parser": "ocr_failed"}


def load_document_bytes(file_bytes: bytes, file_name: str, mime_type: str | None = None) -> dict[str, Any]:
    """
    Returns:
      {"page_texts": list[str], "pages": int, "parser": str}
    """
    ext = os.path.splitext((file_name or "").lower())[1]
    if _LANGCHAIN_AVAILABLE:
        loader_name = LOADER_BY_EXT.get(ext)
        if loader_name:
            try:
                loaded = _load_with_langchain(loader_name, file_bytes, ext)
                if loaded.get("page_texts"):
                    return loaded
            except Exception as exc:
                logger.warning("parsers.langchain_load_failed", loader=loader_name, error=str(exc))

    if mime_type == "application/pdf" or ext == ".pdf":
        parsed = _parse_pdf_pymupdf(file_bytes)
        if parsed.get("page_texts"):
            return parsed
        parsed = _parse_pdf_pdfplumber(file_bytes)
        if parsed.get("page_texts"):
            return parsed

    if ext in IMAGE_EXTENSIONS or (mime_type or "").startswith("image/"):
        parsed = _parse_image_with_ocr(file_bytes)
        if parsed.get("page_texts"):
            return parsed

    return _parse_as_text(file_bytes, ext)


def extract_text_from_bytes(file_bytes: bytes, file_name: str, mime_type: str | None = None) -> dict[str, Any]:
    """
    Return a normalized text payload for downstream routers.

    Shape:
      {
        "text": str,
        "pages": int,
        "parser": str,
        "page_texts": list[str],
      }
    """
    parsed = load_document_bytes(file_bytes=file_bytes, file_name=file_name, mime_type=mime_type)
    page_texts = [
        _normalize_text(page)
        for page in (parsed.get("page_texts") or [])
        if _normalize_text(page)
    ]
    return {
        "text": "\n\n".join(page_texts).strip(),
        "pages": int(parsed.get("pages") or max(1, len(page_texts) or 1)),
        "parser": parsed.get("parser") or "unknown",
        "page_texts": page_texts,
    }
