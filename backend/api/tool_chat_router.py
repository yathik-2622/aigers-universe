import datetime
import json
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.document_router import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE_MB,
    _extract_docx_text,
    _extract_html_text,
    _extract_json_text,
    _extract_pdf_text,
    _extract_xml_like_text,
    _store_document_text,
)
from config import settings
from core.agent_registry import TOOL_SCHEMAS, invoke_agent_by_id
from core.chat_grounding import (
    MAX_PLATFORM_PROMPT_CHARS,
    load_platform_documents,
    rank_platform_documents,
    retrieve_knowledge_chunks,
)
from core.llm_router import _build_client
from core.request_context import get_optional_user_id, require_user_id
from core.runtime_settings import discover_models_for_user
from db.collection_names import AIGERS_DOCUMENTS
from db.mongo_client import get_db
from mcp_tools.tool_server import TOOL_METADATA, TOOL_REGISTRY

router = APIRouter()

PLATFORM_MODE = "platform"
GENERAL_MODE = "general"
KNOWLEDGE_MODE = "knowledge"
CHAT_SAFE_TOOL_NAMES = [name for name in TOOL_REGISTRY.keys() if name != "trigger_hitl"]
CHAT_NATIVE_TOOL_SCHEMAS = {
    "search_platform_catalog": {
        "type": "function",
        "function": {
            "name": "search_platform_catalog",
            "description": "Search installed agents, marketplace templates, tools, and models inside this AIger's Universe workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    "invoke_installed_agent": {
        "type": "function",
        "function": {
            "name": "invoke_installed_agent",
            "description": "Invoke one installed agent with a specific prompt or task when the user explicitly wants help from that agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "instruction": {"type": "string"},
                },
                "required": ["agent_id", "instruction"],
            },
        },
    },
}


class ChatSessionCreateRequest(BaseModel):
    title: str | None = Field(default=None)
    mode: str = Field(default=PLATFORM_MODE)
    model_name: str = Field(default=settings.LLM_MODEL)
    preferred_tool: str | None = Field(default=None)
    enabled_tools: list[str] = Field(default_factory=list)


class ChatMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    mode: str | None = Field(default=None)
    model_name: str | None = Field(default=None)
    preferred_tool: str | None = Field(default=None)
    enabled_tools: list[str] | None = Field(default=None)


class ChatSessionUpdateRequest(BaseModel):
    title: str | None = Field(default=None)
    mode: str | None = Field(default=None)
    model_name: str | None = Field(default=None)
    preferred_tool: str | None = Field(default=None)
    enabled_tools: list[str] | None = Field(default=None)


def _utcnow() -> str:
    return datetime.datetime.utcnow().isoformat()


def _normalize_mode(mode: str | None) -> str:
    normalized = (mode or PLATFORM_MODE).strip().lower()
    return normalized if normalized in {PLATFORM_MODE, GENERAL_MODE, KNOWLEDGE_MODE} else PLATFORM_MODE


def _normalize_tool_names(tool_names: list[str] | None) -> list[str]:
    if not tool_names:
        return CHAT_SAFE_TOOL_NAMES.copy()
    valid = [name for name in tool_names if name in CHAT_SAFE_TOOL_NAMES]
    return valid or CHAT_SAFE_TOOL_NAMES.copy()


def _normalize_preferred_tool(tool_name: str | None) -> str | None:
    candidate = (tool_name or "").strip()
    return candidate if candidate in CHAT_SAFE_TOOL_NAMES else None


def _make_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return (cleaned[:72] + "...") if len(cleaned) > 72 else (cleaned or "New AIger chat")


def _json_default(value):
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    return str(value)


def _truncate_text(value: str, limit: int = 280) -> str:
    text = (value or "").strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def _log_step(logs: list[dict], label: str, detail: str, status: str = "completed") -> None:
    logs.append({
        "type": "status_update",
        "channel": "aiger_copilot",
        "step_id": str(uuid.uuid4()),
        "label": label,
        "stage": label,
        "detail": detail,
        "status": status,
        "tone": "error" if status == "failed" else ("warn" if status in {"warning", "fallback"} else "info"),
        "timestamp": _utcnow(),
    })


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=_json_default)}\n\n"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _platform_doc_records() -> list[dict]:
    return load_platform_documents(_repo_root())


def _platform_doc_source_id(relative_path: str) -> str:
    normalized_path = relative_path.replace("\\", "/")
    return f"platform::{normalized_path}"


def _platform_doc_url(relative_path: str) -> str:
    return f"/api/tool-chat/sources/{_platform_doc_source_id(relative_path)}"


def _platform_docs_bundle() -> str:
    bundles: list[str] = []
    for doc in load_platform_documents(_repo_root()):
        bundles.append(f"[{doc['label']}]\n{doc['content'][:MAX_PLATFORM_PROMPT_CHARS]}")
    return "\n\n".join(bundles)


def _build_source_citation(
    *,
    label: str,
    source_type: str,
    excerpt: str,
    content_url: str,
    source_ref: str,
    url: str | None = None,
    metadata: dict | None = None,
) -> dict:
    return {
        "label": label,
        "source_type": source_type,
        "source_ref": source_ref,
        "excerpt": _truncate_text(excerpt, 1600),
        "content_url": content_url,
        "url": url or content_url,
        "metadata": metadata or {},
    }


def _platform_doc_citation(doc: dict, query: str) -> dict:
    return _build_source_citation(
        label=doc["label"],
        source_type="platform_doc",
        excerpt=doc["content"],
        content_url=_platform_doc_url(doc["relative_path"]),
        source_ref=doc["source_id"],
        metadata={"query": query, "score": doc.get("score", 0)},
    )


def _document_citation(doc: dict, excerpt: str, source_type: str = "chat_attachment", metadata: dict | None = None) -> dict:
    return _build_source_citation(
        label=doc.get("filename") or doc["document_id"],
        source_type=source_type,
        excerpt=excerpt,
        content_url=f"/api/documents/{doc['document_id']}/content",
        source_ref=doc["document_id"],
        metadata=metadata or {},
    )


def _dedupe_citations(citations: list[dict], limit: int = 12) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    for citation in citations:
        key = f"{citation.get('source_ref')}|{citation.get('label')}"
        if key in seen:
            continue
        seen.add(key)
        results.append(citation)
        if len(results) >= limit:
            break
    return results


def _select_attachment_excerpt(doc: dict) -> str:
    text = (doc.get("text") or "").strip()
    max_chars = max(4000, min(settings.CHAT_INPUT_MAX_TEXT_CHARS, 12000))
    return text[:max_chars]


async def _load_session(session_id: str, user_id: str) -> dict:
    session = await get_db().chat_sessions.find_one(
        {"session_id": session_id, "owner_user_id": user_id},
        {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Chat session '{session_id}' not found")
    session.setdefault("messages", [])
    session.setdefault("attached_document_ids", [])
    session.setdefault("enabled_tools", CHAT_SAFE_TOOL_NAMES.copy())
    return session


async def _load_session_documents(session: dict) -> list[dict]:
    ids = session.get("attached_document_ids") or []
    if not ids:
        return []
    return await get_db()[AIGERS_DOCUMENTS].find(
        {"document_id": {"$in": ids}},
        {"_id": 0, "vector_ids": 0},
    ).sort("uploaded_at", 1).to_list(50)


async def _serialize_session(session: dict) -> dict:
    docs = await _load_session_documents(session)
    return {
        "session_id": session["session_id"],
        "title": session.get("title") or "New AIger chat",
        "mode": _normalize_mode(session.get("mode")),
        "model_name": session.get("model_name") or settings.LLM_MODEL,
        "preferred_tool": session.get("preferred_tool"),
        "enabled_tools": session.get("enabled_tools") or CHAT_SAFE_TOOL_NAMES.copy(),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
        "last_message_preview": session.get("last_message_preview", ""),
        "messages": session.get("messages", []),
        "attachments": [
            {
                "document_id": doc["document_id"],
                "filename": doc.get("filename"),
                "file_type": doc.get("file_type"),
                "text_length": doc.get("text_length", 0),
                "uploaded_at": doc.get("uploaded_at"),
            }
            for doc in docs
        ],
    }


async def _search_platform_catalog(user_id: str, query: str) -> dict:
    db = get_db()
    normalized = (query or "").strip().lower()
    installed = await db.agents.find(
        {"owner_user_id": user_id, "status": "active"},
        {"_id": 0, "agent_id": 1, "name": 1, "framework": 1, "description": 1, "tools": 1, "tags": 1},
    ).to_list(200)
    templates = await db.marketplace_templates.find(
        {},
        {"_id": 0, "template_id": 1, "name": 1, "framework": 1, "description": 1, "suggested_tools": 1, "tags": 1},
    ).to_list(300)
    tools = [{"name": name, **TOOL_METADATA.get(name, {})} for name in CHAT_SAFE_TOOL_NAMES]

    def score_text(parts: list[str]) -> int:
        haystack = " ".join(parts).lower()
        if not normalized:
            return 1
        score = 0
        for token in normalized.split():
            if token in haystack:
                score += 1
        return score

    ranked_agents = sorted(
        [
            {
                "score": score_text([a.get("name", ""), a.get("description", ""), " ".join(a.get("tools", [])), " ".join(a.get("tags", []))]),
                **a,
            }
            for a in installed
        ],
        key=lambda item: item["score"],
        reverse=True,
    )
    ranked_templates = sorted(
        [
            {
                "score": score_text([t.get("name", ""), t.get("description", ""), " ".join(t.get("suggested_tools", [])), " ".join(t.get("tags", []))]),
                **t,
            }
            for t in templates
        ],
        key=lambda item: item["score"],
        reverse=True,
    )
    ranked_tools = sorted(
        [
            {
                "score": score_text([tool.get("name", ""), tool.get("description", ""), tool.get("category", "")]),
                **tool,
            }
            for tool in tools
        ],
        key=lambda item: item["score"],
        reverse=True,
    )
    return {
        "query": query,
        "installed_agents": [{k: v for k, v in item.items() if k != "score"} for item in ranked_agents[:10]],
        "marketplace_templates": [{k: v for k, v in item.items() if k != "score"} for item in ranked_templates[:12]],
        "tools": [{k: v for k, v in item.items() if k != "score"} for item in ranked_tools[:12]],
        "models": (await discover_models_for_user(user_id)).get("models", []),
    }


async def _invoke_installed_agent(user_id: str, agent_id: str, instruction: str, session_id: str) -> dict:
    agent = await get_db().agents.find_one(
        {"owner_user_id": user_id, "agent_id": agent_id, "status": "active"},
        {"_id": 0},
    )
    if not agent:
        raise HTTPException(status_code=404, detail=f"Installed agent '{agent_id}' not found")
    return await invoke_agent_by_id(
        agent_config=agent,
        input_data={"input": instruction, "source": "chat_copilot"},
        workflow_run_id=f"chat_{session_id}",
        step_number=0,
    )


async def _invoke_chat_tool(name: str, args: dict, user_id: str, session_id: str) -> dict:
    try:
        if name in TOOL_REGISTRY and name in CHAT_SAFE_TOOL_NAMES:
            return await TOOL_REGISTRY[name](**args)
        if name == "search_platform_catalog":
            return await _search_platform_catalog(user_id=user_id, query=args.get("query", ""))
        if name == "invoke_installed_agent":
            return await _invoke_installed_agent(
                user_id=user_id,
                agent_id=args.get("agent_id", ""),
                instruction=args.get("instruction", ""),
                session_id=session_id,
            )
        return {"error": f"Unknown tool '{name}'"}
    except Exception as exc:
        return {
            "error": str(exc),
            "tool": name,
            "args": args,
        }


def _extract_citations_from_tool_results(tool_results: list[dict]) -> list[dict]:
    citations: list[dict] = []
    seen: set[str] = set()
    for item in tool_results:
        tool_name = item.get("tool", "")
        result = item.get("result") or {}
        if isinstance(result, dict):
            url = result.get("url")
            excerpt = result.get("content") or result.get("excerpt") or result.get("snippet")
            if url:
                key = f"{tool_name}|{url}"
                if key not in seen:
                    seen.add(key)
                    citations.append({
                        "label": result.get("title") or result.get("provider_label") or tool_name,
                        "url": url,
                        "content_url": url,
                        "source_type": tool_name,
                        "excerpt": _truncate_text(excerpt or url, 1200),
                    })
            for field in ("results", "matches", "installed_agents", "marketplace_templates", "tools"):
                entries = result.get(field)
                if not isinstance(entries, list):
                    continue
                for entry in entries[:8]:
                    if not isinstance(entry, dict):
                        continue
                    entry_url = entry.get("url") or entry.get("link")
                    entry_excerpt = entry.get("excerpt") or entry.get("snippet") or entry.get("description")
                    if not entry_url and not entry_excerpt:
                        continue
                    key = f"{tool_name}|{entry_url or entry.get('title') or entry_excerpt[:60]}"
                    if key in seen:
                        continue
                    seen.add(key)
                    citations.append({
                        "label": entry.get("title") or entry.get("name") or tool_name,
                        "url": entry_url or "",
                        "content_url": entry_url or "",
                        "source_type": tool_name,
                        "excerpt": _truncate_text(entry_excerpt or entry_url or "", 1200),
                    })
    return citations[:12]


async def _build_platform_context(user_id: str, session: dict) -> str:
    db = get_db()
    installed_agents = await db.agents.find(
        {"owner_user_id": user_id, "status": "active"},
        {"_id": 0, "agent_id": 1, "name": 1, "framework": 1, "description": 1, "tools": 1, "tags": 1},
    ).sort("created_at", -1).to_list(200)
    marketplace_templates = await db.marketplace_templates.find(
        {},
        {"_id": 0, "template_id": 1, "name": 1, "framework": 1, "description": 1, "suggested_tools": 1, "tags": 1},
    ).to_list(300)
    tools = [{"name": name, **TOOL_METADATA.get(name, {})} for name in CHAT_SAFE_TOOL_NAMES]
    docs = await _load_session_documents(session)

    installed_summary = [
        {
            "agent_id": item.get("agent_id"),
            "name": item.get("name"),
            "framework": item.get("framework"),
            "description": item.get("description", ""),
            "tools": item.get("tools", []),
            "tags": item.get("tags", []),
        }
        for item in installed_agents[:60]
    ]
    template_summary = [
        {
            "template_id": item.get("template_id"),
            "name": item.get("name"),
            "framework": item.get("framework"),
            "description": item.get("description", ""),
            "suggested_tools": item.get("suggested_tools", []),
            "tags": item.get("tags", []),
        }
        for item in marketplace_templates[:80]
    ]
    attachments_summary = [
        {
            "document_id": doc.get("document_id"),
            "filename": doc.get("filename"),
            "file_type": doc.get("file_type"),
            "excerpt": _select_attachment_excerpt(doc),
        }
        for doc in docs[:10]
    ]

    return "\n\n".join([
        "PLATFORM_DOCS:\n" + _platform_docs_bundle(),
        "INSTALLED_AGENTS:\n" + json.dumps(installed_summary, default=_json_default),
        "MARKETPLACE_TEMPLATES:\n" + json.dumps(template_summary, default=_json_default),
        "AVAILABLE_TOOLS:\n" + json.dumps(tools, default=_json_default),
        "CHAT_ATTACHMENTS:\n" + json.dumps(attachments_summary, default=_json_default),
    ])


async def _build_grounding_payload(*, user_id: str, session: dict, user_message: str, mode: str, model_name: str, logs: list[dict]) -> dict:
    payload = {
        "context_sections": [],
        "citations": [],
        "retrieval_summary": {},
        "query_variants": [user_message],
    }

    docs = await _load_session_documents(session)
    if docs:
        attachment_sections = []
        attachment_citations = []
        for doc in docs[:8]:
            excerpt = _select_attachment_excerpt(doc)
            if not excerpt.strip():
                continue
            attachment_sections.append(
                f"[CHAT_ATTACHMENT] {doc.get('filename') or doc['document_id']}\n{excerpt[:4000]}"
            )
            attachment_citations.append(
                _document_citation(
                    doc,
                    excerpt,
                    source_type="chat_attachment",
                    metadata={"scope": "chat_input"},
                )
            )
        if attachment_sections:
            payload["context_sections"].append("CHAT_ATTACHMENTS:\n" + "\n\n".join(attachment_sections))
            payload["citations"].extend(attachment_citations)
            _log_step(logs, "Load attachments", f"Prepared {len(attachment_sections)} attached source documents for grounding.")

    platform_docs = rank_platform_documents(user_message, _platform_doc_records(), top_k=5)
    if platform_docs:
        payload["context_sections"].append(
            "LIVE_PLATFORM_DOCS:\n" + "\n\n".join(
                f"[{doc['label']}]\n{doc['content'][:MAX_PLATFORM_PROMPT_CHARS]}"
                for doc in platform_docs
            )
        )
        payload["citations"].extend([_platform_doc_citation(doc, user_message) for doc in platform_docs])
        _log_step(logs, "Refresh platform docs", f"Loaded {len(platform_docs)} live markdown/html sources from the repository.")

    include_kb = mode in {KNOWLEDGE_MODE, GENERAL_MODE}
    if include_kb:
        kb_result = await retrieve_knowledge_chunks(
            user_id=user_id,
            query=user_message,
            model_name=model_name,
            top_k=6,
            candidate_limit=24,
            include_private=mode == KNOWLEDGE_MODE,
        )
        payload["query_variants"] = kb_result.get("query_variants") or [user_message]
        matches = kb_result.get("matches") or []
        if matches:
            payload["context_sections"].append(
                "KNOWLEDGE_BASE_MATCHES:\n" + "\n\n".join(
                    f"[{match['filename']} :: chunk {match['chunk_index'] + 1} | score={match['score']}]\n{match['compressed_text']}"
                    for match in matches
                )
            )
            payload["citations"].extend([match["citation"] for match in matches if match.get("citation")])
            payload["retrieval_summary"] = {
                "mode": "knowledge_base",
                "matches": len(matches),
                "query_variants": payload["query_variants"],
            }
            _log_step(
                logs,
                "Run retrievers",
                f"Executed MultiQuery retrieval ({len(payload['query_variants'])} queries), MMR ranking, and contextual compression across {len(matches)} KB chunks.",
            )
        else:
            _log_step(logs, "Run retrievers", "Executed KB retrieval but found no sufficiently grounded matches.")

    payload["citations"] = _dedupe_citations(payload["citations"])
    return payload


async def _generate_follow_up_questions(
    *,
    user_id: str,
    mode: str,
    model_name: str,
    user_message: str,
    assistant_message: str,
) -> list[str]:
    system_prompt = (
        "Generate exactly three concise follow-up questions a user might ask next. "
        "Return only valid JSON in the form {\"questions\": [\"...\", \"...\", \"...\"]}. "
        "Questions should be useful, specific, and non-repetitive."
    )
    if mode == PLATFORM_MODE:
        system_prompt = (
            "Generate exactly three concise follow-up questions a user might ask next about AIger's Universe, "
            "its agents, workflows, tools, architecture, or how to use the platform for the current use case. "
            "Return only valid JSON in the form {\"questions\": [\"...\", \"...\", \"...\"]}."
        )
    try:
        client, _runtime = await _build_client(user_id)
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"USER QUESTION:\n{user_message}\n\nASSISTANT ANSWER:\n{assistant_message[:5000]}"},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        questions = [str(item).strip() for item in payload.get("questions", []) if str(item).strip()]
        return questions[:3]
    except Exception:
        return []


def _system_prompt_for_mode(mode: str) -> str:
    if mode == PLATFORM_MODE:
        return (
            "You are AIger Copilot, a senior enterprise architect and platform guide inside AIger's Universe. "
            "Produce useful, decision-grade answers, not short generic summaries. "
            "For platform questions, explain the exact current architecture, agents, workflows, tools, A2A, KB, HITL, projects, reports, and operating patterns using the provided sources. "
            "For a use case, deliver a practical enterprise response with these sections when relevant: objective, current platform fit, recommended workflow, agents/tools, required inputs, HITL approvals, risks, implementation steps, and expected outputs. "
            "Use installed agents first, then marketplace templates, then clearly label gaps. "
            "Be explicit about what exists now versus what still needs implementation. "
            "Use citations like [1] when grounded evidence exists. "
            "If evidence is weak, state that limitation and ask focused follow-up questions instead of guessing. "
            "If MCP tools or installed agents materially improve accuracy, call them."
        )
    if mode == KNOWLEDGE_MODE:
        return (
            "You are AIger Knowledgebase mode. Answer only from the provided grounded knowledge-base chunks, live repo docs, and attached files. "
            "Every answer must stay faithful to those sources, use concise inline references like [1] or [2], and refuse politely if the evidence is missing. "
            "Do not answer from general world knowledge."
        )
    return (
        "You are AIger General Chat, optimized for grounded technical depth. "
        "Answer with enough detail to be actionable: summarize, analyze tradeoffs, recommend next steps, and include examples when useful. "
        "Stay grounded to the provided workspace sources, attachments, and retrieved knowledge. "
        "If the question requires unsupported facts, say what is missing and ask for the needed source instead of guessing. "
        "Use tools when they materially improve accuracy, and do not claim live external freshness unless a web-capable tool was actually used."
    )


def _prepare_conversation_messages(session: dict, user_message: str, grounded_context: str, mode: str, citations: list[dict]) -> list[dict]:
    history = session.get("messages", [])[-18:]
    citation_guide = "\n".join(
        f"[{index + 1}] {item.get('label')} ({item.get('source_type')})"
        for index, item in enumerate(citations[:12])
    )
    base_messages = [
        {"role": "system", "content": _system_prompt_for_mode(mode)},
        {
            "role": "system",
            "content": (
                "Grounded workspace sources follow. Treat them as the only factual authority for this answer.\n\n"
                f"{grounded_context[:42000]}"
            ),
        },
        {
            "role": "system",
            "content": (
                "Use concise inline citations that match the provided source list, for example [1] or [2]. "
                "Prefer complete, well-structured answers over minimal replies. "
                "Do not expose hidden chain-of-thought; show concise operational rationale and evidence. "
                "If the evidence is insufficient, explain what is missing and ask focused follow-up questions rather than speculating.\n\n"
                f"SOURCE LIST:\n{citation_guide or '[1] No grounded source available'}"
            ),
        },
    ]
    for item in history:
        base_messages.append({"role": item.get("role", "assistant"), "content": item.get("content", "")})
    base_messages.append({"role": "user", "content": user_message})
    return base_messages


async def _run_chat_completion(
    *,
    user_id: str,
    session: dict,
    user_message: str,
    mode: str,
    model_name: str,
    preferred_tool: str | None,
    enabled_tools: list[str],
) -> tuple[str, list[dict], list[dict], list[dict]]:
    processing_logs: list[dict] = []
    _log_step(processing_logs, "Load memory", "Loaded session history and conversation context.")
    grounding_payload = await _build_grounding_payload(
        user_id=user_id,
        session=session,
        user_message=user_message,
        mode=mode,
        model_name=model_name,
        logs=processing_logs,
    )
    platform_context = await _build_platform_context(user_id=user_id, session=session)
    combined_context = "\n\n".join([platform_context, *(grounding_payload.get("context_sections") or [])])
    citations = grounding_payload.get("citations") or []
    if not citations:
        refusal = "I can only answer from grounded AIger sources right now, and I do not have enough evidence for that request."
        _log_step(processing_logs, "Refuse safely", "No grounded sources were available for this request, so the assistant refused instead of guessing.")
        return refusal, [], processing_logs, []
    _log_step(processing_logs, "Ground workspace", f"Prepared {len(citations)} grounded citations across live docs, attachments, and knowledge sources.")
    messages = _prepare_conversation_messages(session, user_message, combined_context, mode, citations)
    _log_step(processing_logs, "Prepare prompt", f"Prepared {len(messages)} conversation messages for model inference.")
    tools_payload = [TOOL_SCHEMAS[name] for name in enabled_tools if name in TOOL_SCHEMAS]
    tools_payload.extend(CHAT_NATIVE_TOOL_SCHEMAS.values())
    forced_tool = preferred_tool if preferred_tool in enabled_tools else None
    _log_step(processing_logs, "Invoke model", f"Calling {model_name} with {len(tools_payload)} available tool definitions.")

    client, _runtime = await _build_client(user_id)
    response = await client.chat.completions.create(
        model=model_name,
        messages=messages,
        tools=tools_payload,
        tool_choice={"type": "function", "function": {"name": forced_tool}} if forced_tool else "auto",
        temperature=0.2,
    )
    msg = response.choices[0].message
    tool_results: list[dict] = []
    content = msg.content or ""

    if msg.tool_calls:
        followup_messages = list(messages)
        assistant_tool_calls = []
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            _log_step(processing_logs, "Run tool", f"{tc.function.name} called with structured arguments.")
            processing_logs[-1].update({"label": tc.function.name, "stage": "Tool call", "tone": "tool", "payload": {"tool": tc.function.name, "args": args}})
            result = await _invoke_chat_tool(tc.function.name, args, user_id=user_id, session_id=session["session_id"])
            if isinstance(result, dict) and result.get("error"):
                _log_step(processing_logs, "Tool fallback", f"{tc.function.name} failed safely: {result['error']}")
                processing_logs[-1].update({"label": tc.function.name, "stage": "Tool fallback", "tone": "warn", "payload": {"tool": tc.function.name, "error": result.get("error")}})
            tool_results.append({"tool": tc.function.name, "args": args, "result": result})
            assistant_tool_calls.append(
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": json.dumps(args, default=_json_default)},
                }
            )
        followup_messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": assistant_tool_calls})
        for idx, item in enumerate(tool_results):
            tool_call_id = assistant_tool_calls[idx]["id"]
            followup_messages.append({"role": "tool", "tool_call_id": tool_call_id, "content": json.dumps(item["result"], default=_json_default)})
        _log_step(processing_logs, "Synthesize answer", "Tool outputs returned. Generating grounded final response.")
        second = await client.chat.completions.create(model=model_name, messages=followup_messages, temperature=0.2)
        content = second.choices[0].message.content or content or "Tool call completed."
    else:
        _log_step(processing_logs, "Synthesize answer", "Responded directly from conversation memory and grounded context.")

    citations.extend(_extract_citations_from_tool_results(tool_results))
    return content, tool_results, processing_logs, _dedupe_citations(citations)


async def _stream_llm_content(messages: list[dict], model_name: str, user_id: str):
    client, _runtime = await _build_client(user_id)
    stream = await client.chat.completions.create(
        model=model_name,
        messages=messages,
        temperature=0.2,
        stream=True,
    )
    collected = ""
    async for chunk in stream:
        delta = ""
        try:
            delta = chunk.choices[0].delta.content or ""
        except Exception:
            delta = ""
        if delta:
            collected += delta
            yield delta, collected


async def _persist_session_message(
    *,
    session_id: str,
    user_id: str,
    user_message: str,
    assistant_message: str,
    tool_results: list[dict],
    citations: list[dict],
    processing_logs: list[dict],
    follow_up_questions: list[str],
    mode: str,
    model_name: str,
    preferred_tool: str | None,
    enabled_tools: list[str],
) -> dict:
    now = _utcnow()
    user_entry = {"message_id": str(uuid.uuid4()), "role": "user", "content": user_message, "created_at": now}
    assistant_entry = {
        "message_id": str(uuid.uuid4()),
        "role": "assistant",
        "content": assistant_message,
        "tool_results": tool_results,
        "citations": citations,
        "processing_logs": processing_logs,
        "follow_up_questions": follow_up_questions,
        "created_at": now,
        "mode": mode,
        "model_name": model_name,
        "preferred_tool": preferred_tool,
    }
    await get_db().chat_sessions.update_one(
        {"session_id": session_id, "owner_user_id": user_id},
        {
            "$push": {"messages": {"$each": [user_entry, assistant_entry]}},
            "$set": {
                "updated_at": now,
                "mode": mode,
                "model_name": model_name,
                "preferred_tool": preferred_tool,
                "enabled_tools": enabled_tools,
                "last_message_preview": assistant_message[:220],
            },
            "$inc": {"message_count": 2},
        },
    )
    session = await _load_session(session_id, user_id)
    return await _serialize_session(session)


@router.get("/sessions")
async def list_sessions(request: Request):
    user_id = require_user_id(request)
    sessions = await get_db().chat_sessions.find(
        {"owner_user_id": user_id},
        {"_id": 0, "messages": 0},
    ).sort("updated_at", -1).to_list(200)
    return {"sessions": sessions, "count": len(sessions)}


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(request: Request, body: ChatSessionCreateRequest):
    user_id = require_user_id(request)
    now = _utcnow()
    session = {
        "session_id": str(uuid.uuid4()),
        "owner_user_id": user_id,
        "title": (body.title or "New AIger chat").strip() or "New AIger chat",
        "mode": _normalize_mode(body.mode),
        "model_name": body.model_name or settings.LLM_MODEL,
        "preferred_tool": _normalize_preferred_tool(body.preferred_tool),
        "enabled_tools": _normalize_tool_names(body.enabled_tools),
        "attached_document_ids": [],
        "messages": [],
        "message_count": 0,
        "last_message_preview": "",
        "created_at": now,
        "updated_at": now,
    }
    await get_db().chat_sessions.insert_one(session)
    return {"session": await _serialize_session(session)}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    user_id = require_user_id(request)
    session = await _load_session(session_id, user_id)
    return {"session": await _serialize_session(session)}


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, request: Request, body: ChatSessionUpdateRequest):
    user_id = require_user_id(request)
    await _load_session(session_id, user_id)
    updates: dict = {"updated_at": _utcnow()}
    if body.title is not None:
        updates["title"] = body.title.strip() or "New AIger chat"
    if body.mode is not None:
        updates["mode"] = _normalize_mode(body.mode)
    if body.model_name is not None:
        updates["model_name"] = body.model_name or settings.LLM_MODEL
    if body.preferred_tool is not None:
        updates["preferred_tool"] = _normalize_preferred_tool(body.preferred_tool)
    if body.enabled_tools is not None:
        updates["enabled_tools"] = _normalize_tool_names(body.enabled_tools)
    await get_db().chat_sessions.update_one(
        {"session_id": session_id, "owner_user_id": user_id},
        {"$set": updates},
    )
    session = await _load_session(session_id, user_id)
    return {"session": await _serialize_session(session)}


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, request: Request):
    user_id = require_user_id(request)
    session = await _load_session(session_id, user_id)
    doc_ids = session.get("attached_document_ids") or []
    await get_db().chat_sessions.delete_one({"session_id": session_id, "owner_user_id": user_id})
    if doc_ids:
        await get_db().documents.delete_many({"document_id": {"$in": doc_ids}})


@router.post("/sessions/{session_id}/message")
async def send_session_message(session_id: str, request: Request, body: ChatMessageRequest):
    user_id = require_user_id(request)
    session = await _load_session(session_id, user_id)
    mode = _normalize_mode(body.mode or session.get("mode"))
    model_name = body.model_name or session.get("model_name") or settings.LLM_MODEL
    enabled_tools = _normalize_tool_names(body.enabled_tools or session.get("enabled_tools"))
    preferred_tool = _normalize_preferred_tool(body.preferred_tool) if body.preferred_tool is not None else _normalize_preferred_tool(session.get("preferred_tool"))
    response_text, tool_results, processing_logs, citations = await _run_chat_completion(
        user_id=user_id,
        session=session,
        user_message=body.content.strip(),
        mode=mode,
        model_name=model_name,
        preferred_tool=preferred_tool,
        enabled_tools=enabled_tools,
    )
    follow_up_questions = await _generate_follow_up_questions(
        user_id=user_id,
        mode=mode,
        model_name=model_name,
        user_message=body.content.strip(),
        assistant_message=response_text,
    )
    if not session.get("messages") and (session.get("title") or "").strip() == "New AIger chat":
        await get_db().chat_sessions.update_one(
            {"session_id": session_id, "owner_user_id": user_id},
            {"$set": {"title": _make_title(body.content)}},
        )
    serialized = await _persist_session_message(
        session_id=session_id,
        user_id=user_id,
        user_message=body.content.strip(),
        assistant_message=response_text,
        tool_results=tool_results,
        citations=citations,
        processing_logs=processing_logs,
        follow_up_questions=follow_up_questions,
        mode=mode,
        model_name=model_name,
        preferred_tool=preferred_tool if preferred_tool in enabled_tools else None,
        enabled_tools=enabled_tools,
    )
    return {
        "reply": response_text,
        "tool_results": tool_results,
        "citations": citations,
        "processing_logs": processing_logs,
        "follow_up_questions": follow_up_questions,
        "session": serialized,
    }


@router.post("/sessions/{session_id}/stream")
async def stream_session_message(session_id: str, request: Request, body: ChatMessageRequest):
    user_id = require_user_id(request)

    async def event_generator():
        session = await _load_session(session_id, user_id)
        mode = _normalize_mode(body.mode or session.get("mode"))
        model_name = body.model_name or session.get("model_name") or settings.LLM_MODEL
        enabled_tools = _normalize_tool_names(body.enabled_tools or session.get("enabled_tools"))
        preferred_tool = _normalize_preferred_tool(body.preferred_tool) if body.preferred_tool is not None else _normalize_preferred_tool(session.get("preferred_tool"))
        user_message = body.content.strip()
        assistant_message_id = str(uuid.uuid4())
        processing_logs: list[dict] = []

        yield _sse_event("assistant_start", {"type": "status_update", "channel": "aiger_copilot", "message_id": assistant_message_id, "mode": mode, "model_name": model_name, "label": "Assistant started", "detail": "Opened a streamed response session."})

        _log_step(processing_logs, "Load memory", "Loaded session history and conversation context.")
        yield _sse_event("log", processing_logs[-1])

        grounding_payload = await _build_grounding_payload(
            user_id=user_id,
            session=session,
            user_message=user_message,
            mode=mode,
            model_name=model_name,
            logs=processing_logs,
        )
        for log in processing_logs[1:]:
            yield _sse_event("log", log)
        base_citations = grounding_payload.get("citations") or []
        if not base_citations:
            final_content = "I can only answer from grounded AIger sources right now, and I do not have enough evidence for that request."
            _log_step(processing_logs, "Refuse safely", "No grounded sources were available for this request, so the assistant refused instead of guessing.")
            yield _sse_event("log", processing_logs[-1])
            follow_up_questions = await _generate_follow_up_questions(
                user_id=user_id,
                mode=mode,
                model_name=model_name,
                user_message=user_message,
                assistant_message=final_content,
            )
            serialized = await _persist_session_message(
                session_id=session_id,
                user_id=user_id,
                user_message=user_message,
                assistant_message=final_content,
                tool_results=[],
                citations=[],
                processing_logs=processing_logs,
                follow_up_questions=follow_up_questions,
                mode=mode,
                model_name=model_name,
                preferred_tool=preferred_tool if preferred_tool in enabled_tools else None,
                enabled_tools=enabled_tools,
            )
            yield _sse_event("final", {
                "type": "final",
                "channel": "aiger_copilot",
                "message_id": assistant_message_id,
                "reply": final_content,
                "tool_results": [],
                "citations": [],
                "processing_logs": processing_logs,
                "follow_up_questions": follow_up_questions,
                "session": serialized,
            })
            return

        platform_context = await _build_platform_context(user_id=user_id, session=session)
        combined_context = "\n\n".join([platform_context, *(grounding_payload.get("context_sections") or [])])
        _log_step(processing_logs, "Ground workspace", f"Prepared {len(base_citations)} grounded citations across live docs, attachments, and knowledge sources.")
        yield _sse_event("log", processing_logs[-1])

        messages = _prepare_conversation_messages(session, user_message, combined_context, mode, base_citations)
        _log_step(processing_logs, "Prepare prompt", f"Prepared {len(messages)} conversation messages for model inference.")
        yield _sse_event("log", processing_logs[-1])

        tools_payload = [TOOL_SCHEMAS[name] for name in enabled_tools if name in TOOL_SCHEMAS]
        tools_payload.extend(CHAT_NATIVE_TOOL_SCHEMAS.values())
        forced_tool = preferred_tool if preferred_tool in enabled_tools else None

        _log_step(processing_logs, "Invoke model", f"Calling {model_name} with {len(tools_payload)} available tool definitions.")
        yield _sse_event("log", processing_logs[-1])

        client, _runtime = await _build_client(user_id)
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools_payload,
            tool_choice={"type": "function", "function": {"name": forced_tool}} if forced_tool else "auto",
            temperature=0.2,
        )
        msg = response.choices[0].message
        tool_results: list[dict] = []
        final_content = ""

        if msg.tool_calls:
            followup_messages = list(messages)
            assistant_tool_calls = []
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                _log_step(processing_logs, "Run tool", f"{tc.function.name} called with structured arguments.")
                processing_logs[-1].update({"label": tc.function.name, "stage": "Tool call", "tone": "tool", "payload": {"tool": tc.function.name, "args": args}})
                yield _sse_event("log", processing_logs[-1])
                result = await _invoke_chat_tool(tc.function.name, args, user_id=user_id, session_id=session["session_id"])
                if isinstance(result, dict) and result.get("error"):
                    _log_step(processing_logs, "Tool fallback", f"{tc.function.name} failed safely: {result['error']}")
                    processing_logs[-1].update({"label": tc.function.name, "stage": "Tool fallback", "tone": "warn", "payload": {"tool": tc.function.name, "error": result.get("error")}})
                    yield _sse_event("log", processing_logs[-1])
                tool_results.append({"tool": tc.function.name, "args": args, "result": result})
                yield _sse_event("tool", {"type": "tool_call", "channel": "aiger_copilot", "tool": tc.function.name, "args": args, "result": result})
                assistant_tool_calls.append(
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": json.dumps(args, default=_json_default)},
                    }
                )
            followup_messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": assistant_tool_calls})
            for idx, item in enumerate(tool_results):
                followup_messages.append({"role": "tool", "tool_call_id": assistant_tool_calls[idx]["id"], "content": json.dumps(item["result"], default=_json_default)})
            _log_step(processing_logs, "Synthesize answer", "Tool outputs returned. Streaming grounded final response.")
            yield _sse_event("log", processing_logs[-1])
            async for delta, collected in _stream_llm_content(followup_messages, model_name, user_id):
                final_content = collected
                yield _sse_event("content_delta", {"type": "content", "channel": "aiger_copilot", "message_id": assistant_message_id, "delta": delta, "content": collected})
        else:
            _log_step(processing_logs, "Synthesize answer", "Streaming response from conversation memory and grounded context.")
            yield _sse_event("log", processing_logs[-1])
            async for delta, collected in _stream_llm_content(messages, model_name, user_id):
                final_content = collected
                yield _sse_event("content_delta", {"type": "content", "channel": "aiger_copilot", "message_id": assistant_message_id, "delta": delta, "content": collected})

        citations = _dedupe_citations(base_citations + _extract_citations_from_tool_results(tool_results))
        follow_up_questions = await _generate_follow_up_questions(
            user_id=user_id,
            mode=mode,
            model_name=model_name,
            user_message=user_message,
            assistant_message=final_content,
        )

        if not session.get("messages") and (session.get("title") or "").strip() == "New AIger chat":
            await get_db().chat_sessions.update_one(
                {"session_id": session_id, "owner_user_id": user_id},
                {"$set": {"title": _make_title(user_message)}},
            )

        serialized = await _persist_session_message(
            session_id=session_id,
            user_id=user_id,
            user_message=user_message,
            assistant_message=final_content,
            tool_results=tool_results,
            citations=citations,
            processing_logs=processing_logs,
            follow_up_questions=follow_up_questions,
            mode=mode,
            model_name=model_name,
            preferred_tool=preferred_tool if preferred_tool in enabled_tools else None,
            enabled_tools=enabled_tools,
        )
        yield _sse_event(
            "final",
            {
                "type": "final",
                "channel": "aiger_copilot",
                "message_id": assistant_message_id,
                "reply": final_content,
                "tool_results": tool_results,
                "citations": citations,
                "processing_logs": processing_logs,
                "follow_up_questions": follow_up_questions,
                "session": serialized,
            },
        )

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_session_files(
    session_id: str,
    request: Request,
    files: list[UploadFile] = File(...),
    category: str = Form(default="chat-input"),
):
    user_id = require_user_id(request)
    session = await _load_session(session_id, user_id)
    if not files:
        raise HTTPException(status_code=422, detail="Select at least one file")
    existing_count = len(session.get("attached_document_ids") or [])
    if existing_count + len(files) > settings.CHAT_INPUT_MAX_FILES:
        raise HTTPException(status_code=422, detail=f"Chat supports up to {settings.CHAT_INPUT_MAX_FILES} attached files")

    prepared_files: list[dict] = []
    total_bytes = 0
    total_chars = 0
    for file in files:
        filename = file.filename or "unnamed"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")
        file_bytes = await file.read()
        total_bytes += len(file_bytes)
        if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"File '{filename}' exceeds {MAX_FILE_SIZE_MB}MB limit")
        try:
            if ext == ".pdf":
                text = _extract_pdf_text(file_bytes)
            elif ext == ".docx":
                text = _extract_docx_text(file_bytes)
            elif ext in {".html", ".htm"}:
                text = _extract_html_text(file_bytes)
            elif ext == ".json":
                text = _extract_json_text(file_bytes)
            elif ext == ".xml":
                text = _extract_xml_like_text(file_bytes)
            else:
                text = file_bytes.decode("utf-8", errors="ignore")
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to extract text from '{filename}': {exc}") from exc
        total_chars += len(text)
        prepared_files.append({
            "filename": filename,
            "ext": ext,
            "text": text,
            "file_size_bytes": len(file_bytes),
        })

    if total_bytes > settings.CHAT_INPUT_MAX_TOTAL_BYTES:
        raise HTTPException(status_code=413, detail=f"Combined chat upload exceeds {settings.CHAT_INPUT_MAX_TOTAL_BYTES} bytes")
    if total_chars > settings.CHAT_INPUT_MAX_TEXT_CHARS:
        raise HTTPException(status_code=413, detail=f"Combined extracted text exceeds {settings.CHAT_INPUT_MAX_TEXT_CHARS} characters")

    uploaded: list[dict] = []
    for item in prepared_files:
        result = await _store_document_text(
            request,
            item["filename"],
            item["ext"],
            item["text"],
            category,
            scope="chat_input",
            source_meta={"chat_session_id": session_id, "ingest_mode": "chat_upload"},
            index_for_kb=False,
            file_size_bytes=item["file_size_bytes"],
        )
        uploaded.append(result)

    await get_db().chat_sessions.update_one(
        {"session_id": session_id, "owner_user_id": user_id},
        {
            "$addToSet": {"attached_document_ids": {"$each": [item["document_id"] for item in uploaded]}},
            "$set": {"updated_at": _utcnow()},
        },
    )
    session = await _load_session(session_id, user_id)
    return {"uploaded": uploaded, "session": await _serialize_session(session)}


@router.get("/sources/{source_id:path}")
async def get_grounded_source(source_id: str, request: Request):
    normalized = (source_id or "").strip()
    if normalized.startswith("platform::"):
        relative_path = normalized.split("platform::", 1)[1].strip().replace("\\", "/")
        for doc in _platform_doc_records():
            if doc.get("relative_path") == relative_path:
                return {
                    "source_id": doc["source_id"],
                    "label": doc["label"],
                    "source_type": doc["source_type"],
                    "content": doc["content"],
                }
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")
    user_id = get_optional_user_id(request)
    if normalized.startswith("document::") and user_id:
        document_id = normalized.split("document::", 1)[1].strip()
        document = await get_db()[AIGERS_DOCUMENTS].find_one(
            {"document_id": document_id, "owner_user_id": user_id, "deleted_at": None},
            {"_id": 0, "document_id": 1, "filename": 1, "scope": 1, "text": 1, "context_excerpt": 1},
        )
        if not document:
            raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")
        return {
            "source_id": normalized,
            "label": document.get("filename") or document_id,
            "source_type": document.get("scope") or "document",
            "content": document.get("text") or document.get("context_excerpt") or "",
        }
    raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")


@router.post("/message")
async def compatibility_message(request: Request, body: dict):
    user_id = require_user_id(request)
    session_doc = {
        "title": _make_title((body.get("messages") or [{"content": "New AIger chat"}])[-1].get("content", "New AIger chat")),
        "mode": body.get("mode") or GENERAL_MODE,
        "model_name": body.get("model_name") or settings.LLM_MODEL,
        "preferred_tool": body.get("preferred_tool"),
        "enabled_tools": body.get("enabled_tools") or CHAT_SAFE_TOOL_NAMES.copy(),
    }
    create_response = await create_session(request, ChatSessionCreateRequest(**session_doc))
    session = create_response["session"]
    latest_user_content = ""
    for item in body.get("messages") or []:
        if item.get("role") == "user":
            latest_user_content = item.get("content", latest_user_content)
    if not latest_user_content:
        latest_user_content = "List available tools and what they do."
    response = await send_session_message(
        session["session_id"],
        request,
        ChatMessageRequest(
            content=latest_user_content,
            mode=session_doc["mode"],
            model_name=session_doc["model_name"],
            preferred_tool=session_doc["preferred_tool"],
            enabled_tools=session_doc["enabled_tools"],
        ),
    )
    return {"reply": response["reply"], "tool_results": response["tool_results"], "session": response["session"]}
