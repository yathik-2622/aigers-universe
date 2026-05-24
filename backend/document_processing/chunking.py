"""
HCKB-style chunking strategies for AIger's Universe.
LangChain-based splitters with semantic-topic fallback.
"""
from typing import List, Optional

import structlog

logger = structlog.get_logger(__name__)

_HAS_LANGCHAIN = False
_HAS_MARKDOWN_SPLITTER = False
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter, TokenTextSplitter, CharacterTextSplitter, MarkdownTextSplitter

    _HAS_LANGCHAIN = True
    _HAS_MARKDOWN_SPLITTER = True
except Exception as exc:
    logger.warning("chunking.langchain_unavailable", error=str(exc))
    _HAS_LANGCHAIN = False
    _HAS_MARKDOWN_SPLITTER = False

_HAS_SKLEARN = False
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans

    _HAS_SKLEARN = True
except Exception as exc:
    logger.warning("chunking.sklearn_unavailable", error=str(exc))
    _HAS_SKLEARN = False


CHUNKING_STRATEGIES_INFO = {
    "section-aware-large": "Large chunks that preserve sections and paragraphs (recommended for long reports).",
    "page-based-large": "Group multiple pages into large chunks (recommended for PDFs).",
    "sliding-window": "Token-based sliding window with large window size and overlap.",
    "code-aware": "Keep code blocks intact and split conservatively for source files.",
    "table-first": "Prioritize table-like chunks first then large text chunks.",
    "markdown": "Markdown-aware splitter that respects headings and code fences.",
    "semantic-topic": "Cluster document into topic-based large chunks (TF-IDF + clustering).",
}

# Backward-compatible aliases for already-wired API defaults.
ALIAS_TO_HCKB = {
    "hierarchical": "section-aware-large",
    "fixed-token": "sliding-window",
    "sentence-window": "table-first",
    "semantic": "semantic-topic",
}

DEFAULTS = {
    "section_tokens": 8000,
    "section_overlap": 768,
    "page_tokens": 4000,
    "page_overlap": 512,
    "sliding_tokens": 8192,
    "sliding_overlap": 1024,
    "code_tokens": 6000,
    "code_overlap": 512,
    "table_tokens": 4000,
    "table_overlap": 256,
    "markdown_tokens": 8000,
    "semantic_max_topics": 8,
}


def _chars_for_tokens(n_tokens: int) -> int:
    return max(1, int(n_tokens)) * 4


def _fallback_sliding(text: str, chunk_chars: int, overlap_chars: int) -> List[str]:
    out: list[str] = []
    if not text:
        return out
    length = len(text)
    pos = 0
    while pos < length:
        end = min(pos + chunk_chars, length)
        out.append(text[pos:end])
        if end == length:
            break
        pos = max(0, end - overlap_chars)
    return out


def _normalize_strategy(strategy: str) -> str:
    normalized = (strategy or "section-aware-large").strip().lower()
    return ALIAS_TO_HCKB.get(normalized, normalized)


def hckb_chunk_texts(text: str, strategy: str = "section-aware-large", params: Optional[dict] = None) -> List[str]:
    """
    Main HCKB-style chunker entry point.
    """
    if params is None:
        params = {}
    strategy = _normalize_strategy(strategy)
    if not text:
        return []

    if "chunk_tokens" not in params:
        if strategy == "section-aware-large":
            params["chunk_tokens"] = DEFAULTS["section_tokens"]
            params["overlap_tokens"] = DEFAULTS["section_overlap"]
        elif strategy == "page-based-large":
            params["chunk_tokens"] = DEFAULTS["page_tokens"]
            params["overlap_tokens"] = DEFAULTS["page_overlap"]
        elif strategy == "sliding-window":
            params["chunk_tokens"] = DEFAULTS["sliding_tokens"]
            params["overlap_tokens"] = DEFAULTS["sliding_overlap"]
        elif strategy == "code-aware":
            params["chunk_tokens"] = DEFAULTS["code_tokens"]
            params["overlap_tokens"] = DEFAULTS["code_overlap"]
        elif strategy == "table-first":
            params["chunk_tokens"] = DEFAULTS["table_tokens"]
            params["overlap_tokens"] = DEFAULTS["table_overlap"]
        elif strategy == "markdown":
            params["chunk_tokens"] = DEFAULTS["markdown_tokens"]
            params["overlap_tokens"] = DEFAULTS["section_overlap"]
        elif strategy == "semantic-topic":
            params["chunk_tokens"] = DEFAULTS["section_tokens"]
            params["overlap_tokens"] = DEFAULTS["section_overlap"]
        else:
            params["chunk_tokens"] = DEFAULTS["section_tokens"]
            params["overlap_tokens"] = DEFAULTS["section_overlap"]

    if _HAS_LANGCHAIN:
        try:
            if strategy == "section-aware-large":
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                    separators=["\n\n", "\n", " ", ""],
                )
                return [c for c in splitter.split_text(text) if c.strip()]

            if strategy == "page-based-large":
                if "\f" in text:
                    pages = [p.strip() for p in text.split("\f") if p.strip()]
                    groups: list[str] = []
                    i = 0
                    while i < len(pages):
                        group_text = pages[i]
                        i += 1
                        while i < len(pages) and len(group_text) < int(params["chunk_tokens"]):
                            group_text += "\n\n" + pages[i]
                            i += 1
                        groups.append(group_text)
                    return groups
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                )
                return [c for c in splitter.split_text(text) if c.strip()]

            if strategy == "sliding-window":
                splitter = TokenTextSplitter(
                    encoding_name="cl100k_base",
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                )
                return [c for c in splitter.split_text(text) if c.strip()]

            if strategy == "code-aware":
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                    separators=["```", "\n\n", "\n", " ", ""],
                )
                return [c for c in splitter.split_text(text) if c.strip()]

            if strategy == "table-first":
                lines = text.splitlines()
                table_blocks: list[str] = []
                other_lines: list[str] = []
                cur_table: list[str] = []
                for ln in lines:
                    if "|" in ln or (ln.count(",") >= 2 and len(ln) < 1200):
                        cur_table.append(ln)
                    else:
                        if cur_table:
                            table_blocks.append("\n".join(cur_table))
                            cur_table = []
                        other_lines.append(ln)
                if cur_table:
                    table_blocks.append("\n".join(cur_table))
                out = [tb for tb in table_blocks if tb.strip()]
                remaining = "\n".join(other_lines).strip()
                if remaining:
                    splitter = RecursiveCharacterTextSplitter(
                        chunk_size=int(params["chunk_tokens"]),
                        chunk_overlap=int(params["overlap_tokens"]),
                        separators=["\n\n", "\n", " ", ""],
                    )
                    out.extend([c for c in splitter.split_text(remaining) if c.strip()])
                return out

            if strategy == "markdown":
                if _HAS_MARKDOWN_SPLITTER:
                    splitter = MarkdownTextSplitter(
                        chunk_size=int(params["chunk_tokens"]),
                        chunk_overlap=int(params["overlap_tokens"]),
                    )
                    return [c for c in splitter.split_text(text) if c.strip()]
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                    separators=["# ", "## ", "### ", "\n\n", "\n", " ", ""],
                )
                return [c for c in splitter.split_text(text) if c.strip()]

            if strategy == "semantic-topic":
                if _HAS_SKLEARN:
                    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
                    if len(paras) <= 1:
                        return [text]
                    num_topics = min(DEFAULTS["semantic_max_topics"], max(1, len(paras) // 5))
                    try:
                        vectorizer = TfidfVectorizer(stop_words="english", max_features=20000)
                        matrix = vectorizer.fit_transform(paras)
                        k = max(1, min(num_topics, len(paras)))
                        model = KMeans(n_clusters=k, random_state=42, n_init=5)
                        labels = model.fit_predict(matrix)
                        grouped: list[str] = []
                        cur_label = labels[0]
                        cur_block = [paras[0]]
                        for label, para in zip(labels[1:], paras[1:]):
                            if label == cur_label:
                                cur_block.append(para)
                            else:
                                grouped.append("\n\n".join(cur_block))
                                cur_block = [para]
                                cur_label = label
                        if cur_block:
                            grouped.append("\n\n".join(cur_block))
                        final: list[str] = []
                        splitter = RecursiveCharacterTextSplitter(
                            chunk_size=int(params["chunk_tokens"]),
                            chunk_overlap=int(params["overlap_tokens"]),
                        )
                        for block in grouped:
                            final.extend([c for c in splitter.split_text(block) if c.strip()])
                        return final
                    except Exception as exc:
                        logger.warning("chunking.semantic_topic_failed", error=str(exc))
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=int(params["chunk_tokens"]),
                    chunk_overlap=int(params["overlap_tokens"]),
                )
                return [c for c in splitter.split_text(text) if c.strip()]
        except Exception as exc:
            logger.warning("chunking.langchain_strategy_failed", strategy=strategy, error=str(exc))

    chunk_chars = _chars_for_tokens(int(params.get("chunk_tokens", DEFAULTS["section_tokens"])))
    overlap_chars = _chars_for_tokens(int(params.get("overlap_tokens", DEFAULTS["section_overlap"])))
    return [c for c in _fallback_sliding(text, chunk_chars, overlap_chars) if c.strip()]
