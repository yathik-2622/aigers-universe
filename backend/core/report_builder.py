import json
import re

from core.llm_router import chat_completion
from db.mongo_client import get_db


PII_PATTERNS = [
    ("Email address", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)),
    ("Phone number", re.compile(r"\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b")),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("Credit card", re.compile(r"\b(?:\d[ -]*?){13,16}\b")),
]


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


def _fallback_markdown(run: dict, policies: list[dict], pii_findings: list[dict]) -> str:
    outputs = run.get("outputs_by_agent", {})
    risk = outputs.get("Risk Analyzer", {})
    compliance = outputs.get("Compliance Checker", {})
    lines = [
        f"# {run.get('workflow_name') or 'Workflow Report'}",
        "",
        f"**Status:** {run.get('status', 'unknown').upper()}",
        f"**Risk level:** {risk.get('risk_level', 'UNKNOWN')}",
        f"**Compliance:** {compliance.get('compliance_status', 'UNKNOWN')}",
        "",
        "## Policy Set",
    ]
    if policies:
        lines.extend([f"- **{p['rule_name']}** ({p.get('severity', 'LOW')}): {p.get('description', '')}" for p in policies])
    else:
        lines.append("- No policies were attached to this workflow.")
    lines.extend(["", "## PII Redlines"])
    if pii_findings:
        for item in pii_findings:
            lines.append(
                f"- Line {item['line_number']}: `{item['original_text']}` -> `{item['redacted_text']}` ({item['reason']})"
            )
    else:
        lines.append("- No obvious PII patterns were detected.")
    lines.extend(["", "## Agent Findings"])
    for agent_name, output in outputs.items():
        lines.append(f"### {agent_name}")
        lines.append("```json")
        lines.append(json.dumps(output, indent=2))
        lines.append("```")
    return "\n".join(lines)


async def build_run_report(run: dict) -> dict:
    db = get_db()
    document_id = (run.get("input_data") or {}).get("document_id")
    doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0, "text": 1, "filename": 1}) if document_id else None
    policies = []
    policy_ids = run.get("policy_ids") or []
    if policy_ids:
        policies = await db.governance_rules.find({"rule_id": {"$in": policy_ids}}, {"_id": 0}).to_list(200)

    text = (doc or {}).get("text", "")
    lines = _line_map(text)[:200]
    pii_findings = _find_pii(lines)
    llm_payload = {
        "workflow_name": run.get("workflow_name"),
        "status": run.get("status"),
        "failure_reason": run.get("failure_reason"),
        "outputs_by_agent": run.get("outputs_by_agent", {}),
        "final_output": run.get("final_output", {}),
        "policies": policies,
        "document_filename": (doc or {}).get("filename", ""),
        "document_lines": lines,
        "pii_findings": pii_findings,
    }
    try:
        response = await chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a legal operations reviewer. Produce ONLY valid JSON with keys: "
                        "executive_summary (string), overall_decision (string), redlines (array of objects with line_number, "
                        "issue, original_text, suggested_text, policy_reference), pii_findings (array), "
                        "policy_recommendations (array of strings), next_actions (array of strings), citations (array of objects with label, excerpt, source_type, source_ref), markdown (string). "
                        "The markdown must be human-readable with headings, bullets, and concise policy-aligned guidance."
                    ),
                },
                {"role": "user", "content": json.dumps(llm_payload, default=str)[:14000]},
            ],
            caller="workflow_report_builder",
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response["content"])
        markdown = parsed.get("markdown") or _fallback_markdown(run, policies, pii_findings)
        return {
            "structured": parsed,
            "markdown": markdown,
            "pii_findings": parsed.get("pii_findings", pii_findings),
            "citations": parsed.get("citations", []),
        }
    except Exception:
        markdown = _fallback_markdown(run, policies, pii_findings)
        return {
            "structured": {
                "executive_summary": "Fallback report generated because structured synthesis was unavailable.",
                "overall_decision": run.get("status", "unknown").upper(),
                "redlines": [],
                "pii_findings": pii_findings,
                "policy_recommendations": [],
                "next_actions": [],
                "citations": [],
                "markdown": markdown,
            },
            "markdown": markdown,
            "pii_findings": pii_findings,
            "citations": [],
        }
