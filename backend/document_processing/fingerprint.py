"""
Content and file fingerprint helpers for knowledge-base deduplication.
"""
from __future__ import annotations

import hashlib
import re


def file_sha256_hex(data: bytes) -> str:
    hasher = hashlib.sha256()
    hasher.update(data or b"")
    return "sha256:" + hasher.hexdigest()


def content_hash_from_bytes(data: bytes, mime_type: str = "") -> str:
    lower = (mime_type or "").lower()
    is_text_like = lower.startswith("text/") or any(token in lower for token in ("json", "csv", "xml", "html", "yaml"))
    if is_text_like:
        try:
            normalized = re.sub(r"\s+", " ", (data or b"").decode("utf-8", errors="ignore")).strip()
            return "sha256:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        except Exception:
            pass
    return file_sha256_hex(data)
