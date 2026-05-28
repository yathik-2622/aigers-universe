import json
import re

from db.collection_names import AIGERS_DOCUMENTS
from db.mongo_client import get_db


PII_PATTERNS = [
    ("Email address", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)),
    ("Phone number", re.compile(r"\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b")),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("Credit card", re.compile(r"\b(?:\d[ -]*?){13,16}\b")),
]

PREFERRED_TEXT_KEYS = (
    "markdown",
    "report_markdown",
    "final_report",
    "summary_markdown",
    "sttm_markdown",
    "ddl_sql",
    "sql",
    "mermaid",
    "text",
    "summary",
    "description",
    "result",
)
NOISE_OUTPUT_KEYS = {"approved", "note", "citations", "pii_findings", "redlines"}


def _line_map(text: str) -> list[dict]:
    lines = text.splitlines()
    mapped: list[dict] = []
    for idx, line in enumerate(lines, start=1):
        if line.strip():
            mapped.append({"line_number": idx, "text": line.strip()})
    return mapped


def _find_pii(lines: list[dict]) -> list[dict]:
    findings: list[dict] = []
    for line in lines:
        for label, pattern in PII_PATTERNS:
            for match in pattern.finditer(line["text"]):
                original = match.group(0)
                findings.append({
                    "line_number": line["line_number"],
                    "type": label,
                    "original_text": original,
                    "redacted_text": line["text"].replace(original, "[REDACTED]"),
                    "reason": f"{label} should be redacted or minimized.",
                })
    return findings[:20]


def _excerpt(text: str, limit: int = 800) -> str:
    compact = re.sub(r"\s+", " ", (text or "")).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


def _is_probably_markdown(text: str) -> bool:
    sample = (text or "").strip()
    if not sample:
        return False
    markers = ("# ", "## ", "```", "|", "- ", "* ", "1. ", "erDiagram", "CREATE TABLE")
    return any(marker in sample for marker in markers)


def _extract_primary_text(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        for item in value:
            candidate = _extract_primary_text(item)
            if candidate:
                return candidate
        return ""
    if isinstance(value, dict):
        for key in PREFERRED_TEXT_KEYS:
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                text = candidate.strip()
                if key in {"sql", "ddl_sql"} and "```" not in text:
                    return f"```sql\n{text}\n```"
                if key == "mermaid" and "```" not in text:
                    return f"```mermaid\n{text}\n```"
                return text
        for nested in value.values():
            candidate = _extract_primary_text(nested)
            if candidate:
                return candidate
    return ""


def _as_list(value) -> list:
    return value if isinstance(value, list) else ([] if value in (None, "") else [value])


def _humanize_key(value: str) -> str:
    return re.sub(r"[_\-]+", " ", str(value or "")).strip().title()


def _format_structured_value(value, indent: int = 0) -> list[str]:
    prefix = "  " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            if key in NOISE_OUTPUT_KEYS and not item:
                continue
            label = _humanize_key(key)
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}- **{label}:**")
                lines.extend(_format_structured_value(item, indent + 1))
            else:
                lines.append(f"{prefix}- **{label}:** {item}")
        return lines
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, dict):
                lines.extend(_format_structured_value(item, indent))
            else:
                lines.append(f"{prefix}- {item}")
        return lines
    return [f"{prefix}- {value}"]


def _format_dict_table(items: list[dict], preferred_keys: list[str]) -> list[str]:
    rows = [item for item in items if isinstance(item, dict)]
    if not rows:
        return []
    keys = [key for key in preferred_keys if any(row.get(key) not in (None, "", []) for row in rows)]
    if not keys:
        keys = list(rows[0].keys())[:4]
    lines = [
        "| " + " | ".join(_humanize_key(key) for key in keys) + " |",
        "| " + " | ".join("---" for _ in keys) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_excerpt(str(row.get(key, "-")), 260).replace("|", "/") for key in keys) + " |")
    return lines


def _format_agent_output_markdown(agent_name: str, output) -> list[str]:
    if not isinstance(output, dict):
        return _format_structured_value(output)
    lines: list[str] = []
    scalar_items = []
    for key, value in output.items():
        if key in NOISE_OUTPUT_KEYS and not value:
            continue
        if isinstance(value, (dict, list)):
            continue
        scalar_items.append((key, value))
    if scalar_items:
        lines.extend(["| Field | Value |", "|---|---|"])
        for key, value in scalar_items:
            lines.append(f"| {_humanize_key(key)} | {_excerpt(str(value), 420).replace('|', '/')} |")
    table_preferences = {
        "violations": ["severity", "issue", "rule_name", "reason", "remediation", "recommendation"],
        "redlines": ["original", "replacement", "reason"],
        "recommended_fixes": ["issue", "recommendation"],
        "recommendations": ["priority", "action", "rationale"],
        "key_clauses": ["title", "description", "content"],
        "entities": ["name", "role", "type", "value"],
        "dates": ["type", "value"],
        "amounts": ["type", "value"],
    }
    for key, preferred in table_preferences.items():
        value = output.get(key)
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            lines.extend(["", f"#### {_humanize_key(key)}"])
            lines.extend(_format_dict_table(value, preferred))
    for key, value in output.items():
        if key in table_preferences or key in NOISE_OUTPUT_KEYS or not isinstance(value, list):
            continue
        if value and all(not isinstance(item, dict) for item in value):
            lines.extend(["", f"#### {_humanize_key(key)}"])
            lines.extend(f"- {item}" for item in value)
    if not lines:
        lines.extend(_format_structured_value(output))
    return lines


def _build_outcome_markdown(final_output: dict) -> list[str]:
    summary = final_output.get("summary") or final_output.get("executive_summary") or final_output.get("result") or ""
    recommendation = final_output.get("overall_recommendation") or final_output.get("approval_recommendation") or final_output.get("decision") or ""
    lines = []
    if summary:
        lines.extend(["## Outcome Summary", str(summary)])
    if recommendation:
        lines.extend(["", "## Decision", f"**{str(recommendation).upper()}**"])
    actions = final_output.get("recommendations") or final_output.get("recommended_fixes") or final_output.get("mitigations") or []
    if actions:
        lines.extend(["", "## Priority Actions"])
        table_rows = []
        for item in _as_list(actions):
            if isinstance(item, dict):
                priority = item.get("priority") or item.get("severity") or "ACTION"
                action = item.get("action") or item.get("recommendation") or item.get("issue") or item.get("title") or "Recommended action"
                rationale = item.get("rationale") or item.get("reason") or ""
                table_rows.append((priority, action, rationale))
            else:
                table_rows.append(("ACTION", str(item), ""))
        if table_rows:
            lines.extend(["| Priority | Action | Rationale |", "|---|---|---|"])
            for priority, action, rationale in table_rows:
                lines.append(f"| {priority} | {action} | {rationale or '-'} |")
    brief = final_output.get("executive_brief") or final_output.get("key_findings") or final_output.get("key_risks") or []
    if brief:
        lines.extend(["", "## Key Findings"])
        lines.extend(f"- {item}" for item in _as_list(brief))
    if not lines:
        primary_text = _extract_primary_text(final_output)
        if primary_text:
            lines.extend(["## Outcome", primary_text])
        else:
            lines.extend(["## Outcome", "The workflow completed. Review structured results below."])
    return lines


async def _resolve_last_agent_context(run: dict) -> dict:
    agents = run.get("agents") or []
    if not agents:
        return {}

    last_agent = agents[-1]
    agent_id = last_agent.get("agent_id")
    workflow_id = run.get("workflow_id")
    db = get_db()

    if workflow_id:
        wf = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0, "canvas": 1, "agents": 1})
        canvas_nodes = ((wf or {}).get("canvas") or {}).get("nodes") or []
        sorted_nodes = sorted(canvas_nodes, key=lambda node: node.get("position", {}).get("x", 0))
        for node in reversed(sorted_nodes):
            data = node.get("data") or {}
            if data.get("agent_id") == agent_id:
                return {
                    "agent_id": agent_id,
                    "agent_name": data.get("name") or last_agent.get("agent_name") or "Final agent",
                    "system_prompt": data.get("system_prompt", ""),
                    "framework": data.get("framework", ""),
                    "tools": data.get("tools", []),
                }

    if agent_id:
        agent_doc = await db.agents.find_one({"agent_id": agent_id}, {"_id": 0, "name": 1, "system_prompt": 1, "framework": 1, "tools": 1})
        if agent_doc:
            return {
                "agent_id": agent_id,
                "agent_name": agent_doc.get("name") or last_agent.get("agent_name") or "Final agent",
                "system_prompt": agent_doc.get("system_prompt", ""),
                "framework": agent_doc.get("framework", ""),
                "tools": agent_doc.get("tools", []),
            }

    return {
        "agent_id": agent_id,
        "agent_name": last_agent.get("agent_name") or "Final agent",
        "system_prompt": "",
        "framework": "",
        "tools": [],
    }


def _build_domain_markdown(run: dict, last_agent: dict, final_output: dict) -> str:
    title = run.get("workflow_name") or "Workflow Report"
    status = (run.get("status") or "unknown").upper()
    agent_name = last_agent.get("agent_name") or "Final agent"

    lines = [f"# {title}", "", f"**Status:** {status}", f"**Final agent:** {agent_name}"]
    if run.get("failure_reason"):
        lines.append(f"**Failure reason:** {run['failure_reason']}")

    lines.extend(["", *_build_outcome_markdown(final_output)])
    lines.extend(["", "## Structured Result", "```json", json.dumps(final_output or {}, indent=2, default=str), "```"])
    outputs = run.get("outputs_by_agent") or {}
    if outputs:
        lines.extend(["", "## Agent Evidence Trail"])
        for agent, output in outputs.items():
            if agent == agent_name:
                continue
            lines.append(f"### {agent}")
            lines.extend(_format_agent_output_markdown(agent, output))
    return "\n".join(lines).strip()


async def build_run_report(run: dict) -> dict:
    db = get_db()
    input_data = run.get("input_data") or {}
    document_id = input_data.get("document_id")
    doc = await db[AIGERS_DOCUMENTS].find_one({"document_id": document_id}, {"_id": 0, "text": 1, "filename": 1}) if document_id else None
    workflow_inputs = input_data.get("workflow_inputs") or {}

    fallback_sections = []
    workflow_text = (workflow_inputs.get("text") or "").strip()
    if workflow_text:
        fallback_sections.append(f"Workflow text input:\n{workflow_text}")
    for item in workflow_inputs.get("uploaded_files") or []:
        excerpt = (item.get("text_excerpt") or "").strip()
        if excerpt:
            fallback_sections.append(f"Uploaded workflow file: {item.get('filename', 'file')}\n{excerpt}")
    repo_input = workflow_inputs.get("github_repo") or {}
    repo_excerpt = (repo_input.get("text_excerpt") or "").strip()
    if repo_excerpt:
        fallback_sections.append(f"Workflow GitHub import: {repo_input.get('repo_url') or repo_input.get('filename', 'repo')}\n{repo_excerpt}")

    text = (doc or {}).get("text", "") or "\n\n".join(fallback_sections)
    lines = _line_map(text)[:200]
    pii_findings = _find_pii(lines)

    last_agent = await _resolve_last_agent_context(run)
    final_output = run.get("final_output") or {}
    markdown = _build_domain_markdown(run, last_agent, final_output)

    structured = {
        "report_title": run.get("workflow_name") or "Workflow Report",
        "status": run.get("status"),
        "primary_agent": last_agent.get("agent_name") or "",
        "primary_agent_prompt": last_agent.get("system_prompt", ""),
        "summary": _excerpt(_extract_primary_text(final_output) or json.dumps(final_output, default=str), 1200),
        "final_output": final_output,
        "workflow_inputs_present": {
            "knowledge_base_document": bool(doc),
            "uploaded_file_count": len(workflow_inputs.get("uploaded_files") or []),
            "github_repo": bool(repo_input),
        },
        "citations": [],
        "markdown": markdown,
    }
    if doc:
        structured["citations"].append({
            "label": doc.get("filename", "knowledge-base document"),
            "excerpt": _excerpt((doc.get("text") or ""), 240),
            "source_type": "knowledge_base_document",
            "source_ref": doc.get("document_id", ""),
            "content_url": f"/api/documents/{doc.get('document_id')}/content",
        })
    for item in workflow_inputs.get("uploaded_files") or []:
        if (item.get("text_excerpt") or "").strip():
            structured["citations"].append({
                "label": item.get("filename", "workflow-input"),
                "excerpt": _excerpt(item.get("text_excerpt", ""), 240),
                "source_type": "workflow_input",
                "source_ref": item.get("document_id", ""),
                "content_url": f"/api/documents/{item.get('document_id')}/content" if item.get("document_id") else "",
            })

    return {
        "structured": structured,
        "markdown": markdown,
        "pii_findings": pii_findings,
        "citations": structured["citations"],
    }
