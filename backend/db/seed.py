"""
Seed marketplace templates and governance rules at startup.
Idempotent — uses upsert keyed by template_id / rule_id.
"""
import structlog
from config import settings
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)


MARKETPLACE_TEMPLATES = [
    {
        "template_id": "tpl_doc_classifier",
        "name": "Document Classifier",
        "framework": "langgraph",
        "description": "Classifies uploaded documents into categories (contract, invoice, policy, report, other).",
        "default_system_prompt": (
            "You are a senior enterprise intake analyst. Determine the dominant business document type with high precision. "
            "Use the document filename, structure, legal terms, headings, and semantic evidence. "
            "If the type is ambiguous, explain the ambiguity explicitly instead of overclaiming. "
            "Allowed categories: contract, invoice, policy, report, other. "
            "Return only JSON: {\"category\": str, \"confidence\": float, \"reasoning\": str, "
            "\"secondary_candidates\": [str], \"key_evidence\": [str]}."
        ),
        "suggested_tools": ["semantic_search"],
        "hitl_enabled": False,
        "category": "Analysis",
        "icon": "FileText",
    },
    {
        "template_id": "tpl_data_extractor",
        "name": "Data Extractor",
        "framework": "langgraph",
        "description": "Extracts structured fields and entities from unstructured document text.",
        "default_system_prompt": (
            "You are an enterprise contract data extraction specialist. Extract operationally useful fields, not generic fluff. "
            "Capture parties, roles, dates, payment terms, notice periods, obligations, governing law, termination triggers, "
            "renewal terms, confidentiality language, and any placeholders or missing values that weaken execution readiness. "
            "Return only JSON: {\"entities\": [...], \"parties\": [...], \"dates\": [...], \"amounts\": [...], "
            "\"key_clauses\": [...], \"missing_required_fields\": [...], \"document_gaps\": [...]}."
        ),
        "suggested_tools": ["semantic_search", "document_store"],
        "hitl_enabled": False,
        "category": "Extraction",
        "icon": "Database",
    },
    {
        "template_id": "tpl_risk_analyzer",
        "name": "Risk Analyzer",
        "framework": "langgraph",
        "description": "Analyzes content for business and operational risk using the platform risk scorer.",
        "default_system_prompt": (
            "You are a principal enterprise risk reviewer. Call the risk_scorer tool and combine that score with document-specific risk analysis. "
            "Prioritize legal, privacy, compliance, execution, ambiguity, financial, and reputational risks. "
            "Red flags include placeholders, missing counterparties, missing dates, undefined obligations, PII leakage, and unenforceable language. "
            "Return only JSON: {\"risk_level\": \"RED\"|\"AMBER\"|\"GREEN\", \"score\": int, \"key_risks\": [...], "
            "\"risk_rationale\": str, \"mitigations\": [...], \"approval_recommendation\": str}."
        ),
        "suggested_tools": ["risk_scorer", "semantic_search"],
        "hitl_enabled": False,
        "category": "Risk",
        "icon": "AlertTriangle",
    },
    {
        "template_id": "tpl_compliance_checker",
        "name": "Compliance Checker",
        "framework": "langgraph",
        "description": "Checks content against governance rules. Pauses workflow for human review on violations.",
        "default_system_prompt": (
            "You are a compliance officer. Use the rules_engine_check tool to validate the content. "
            "If selected policy IDs are present in the input, use them when checking compliance. "
            "Use the policy_library_search tool when you need policy-specific clauses or uploaded policy text. "
            "Identify policy violations, PII that should be redacted, and concrete remediation guidance. "
            "For each issue, provide a quote or line-based excerpt when possible and recommend policy-aligned replacement wording. "
            "If any HIGH severity rule is violated, call trigger_hitl with severity=HIGH and a clear reason. "
            "Return JSON: {\"compliance_status\": \"PASS\"|\"FAIL\"|\"REVIEW\", \"violations\": [...], "
            "\"pii_findings\": [...], \"redlines\": [...], \"recommended_fixes\": [...], \"citations\": [...]}."
        ),
        "suggested_tools": ["rules_engine_check", "policy_library_search", "trigger_hitl"],
        "hitl_enabled": True,
        "category": "Compliance",
        "icon": "ShieldCheck",
    },
    {
        "template_id": "tpl_recommendation_advisor",
        "name": "Recommendation Advisor",
        "framework": "langgraph",
        "description": "Synthesises upstream agent outputs into actionable recommendations for the end user.",
        "default_system_prompt": (
            "You are an executive review advisor. Synthesize all upstream findings into a board-ready final recommendation set. "
            "Separate blockers from nice-to-have improvements. Recommend whether to approve, redline, escalate, or reject the document. "
            "Return only JSON: {\"summary\": str, \"overall_recommendation\": str, "
            "\"recommendations\": [{\"priority\": \"HIGH\"|\"MEDIUM\"|\"LOW\", \"action\": str, \"rationale\": str}], "
            "\"executive_brief\": [str]}."
        ),
        "suggested_tools": ["document_store"],
        "hitl_enabled": False,
        "category": "Advisory",
        "icon": "Lightbulb",
    },
]


GOVERNANCE_RULES = [
    {
        "rule_id": "rule_pii_disclosure",
        "rule_name": "No Unredacted PII Disclosure",
        "category": "privacy",
        "severity": "HIGH",
        "description": "Documents must not contain unredacted personally identifiable information (SSN, credit card, passport).",
        "applicable_to": ["compliance", "privacy", "all"],
    },
    {
        "rule_id": "rule_data_retention",
        "rule_name": "Data Retention Limit 90 Days",
        "category": "privacy",
        "severity": "MEDIUM",
        "description": "User data must not be retained beyond 90 days without explicit consent.",
        "applicable_to": ["compliance", "privacy", "all"],
    },
    {
        "rule_id": "rule_financial_disclosure",
        "rule_name": "Financial Threshold Disclosure",
        "category": "financial",
        "severity": "HIGH",
        "description": "Any transaction or commitment over $100,000 must be disclosed and approved.",
        "applicable_to": ["compliance", "financial", "all"],
    },
    {
        "rule_id": "rule_export_controls",
        "rule_name": "Export Control Compliance",
        "category": "regulatory",
        "severity": "HIGH",
        "description": "Content must comply with international export control regulations (ITAR, EAR).",
        "applicable_to": ["compliance", "regulatory", "all"],
    },
    {
        "rule_id": "rule_third_party_data",
        "rule_name": "Third-Party Data Sharing Consent",
        "category": "privacy",
        "severity": "MEDIUM",
        "description": "Third-party data sharing requires documented user consent.",
        "applicable_to": ["compliance", "privacy", "all"],
    },
]


async def run_seed() -> None:
    """Idempotent seed of marketplace templates and governance rules."""
    db = get_db()

    for tpl in MARKETPLACE_TEMPLATES:
        tpl["default_model_name"] = settings.LLM_MODEL
        await db.marketplace_templates.update_one(
            {"template_id": tpl["template_id"]},
            {"$set": tpl},
            upsert=True,
        )
    logger.info("seed.templates.upserted", count=len(MARKETPLACE_TEMPLATES))

    for rule in GOVERNANCE_RULES:
        await db.governance_rules.update_one(
            {"rule_id": rule["rule_id"]},
            {"$set": rule},
            upsert=True,
        )
    logger.info("seed.rules.upserted", count=len(GOVERNANCE_RULES))

    await _dedupe_active_agents(db)


async def _dedupe_active_agents(db) -> None:
    """
    Startup hygiene: backfill template_id on legacy agents and collapse
    duplicate active rows (same template_id + name + framework) into a
    single oldest-wins canonical agent.

    Custom variants installed with `custom_name` keep a unique pair and are
    never collapsed.
    """
    # Backfill template_id by exact-name match on marketplace_templates
    templates = await db.marketplace_templates.find({}, {"_id": 0, "template_id": 1, "name": 1}).to_list(100)
    name_to_template = {t["name"]: t["template_id"] for t in templates}

    backfilled = 0
    async for agent in db.agents.find({"template_id": {"$exists": False}, "status": "active"}, {"_id": 0}):
        tpl_id = name_to_template.get(agent["name"])
        if tpl_id:
            await db.agents.update_one({"agent_id": agent["agent_id"]}, {"$set": {"template_id": tpl_id}})
            backfilled += 1

    # Group and dedupe (oldest wins)
    active = await db.agents.find({"status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    groups: dict[tuple, list[str]] = {}
    for a in active:
        key = (a.get("template_id") or f"__custom__::{a['name']}", a["name"], a.get("framework", "langgraph"))
        groups.setdefault(key, []).append(a["agent_id"])

    deactivated_ids: list[str] = []
    for ids in groups.values():
        deactivated_ids.extend(ids[1:])

    if deactivated_ids:
        await db.agents.update_many(
            {"agent_id": {"$in": deactivated_ids}},
            {"$set": {"status": "inactive", "deactivated_reason": "duplicate_cleanup"}},
        )

    logger.info(
        "seed.agents.dedupe",
        backfilled_template_ids=backfilled,
        groups=len(groups),
        deactivated=len(deactivated_ids),
    )
