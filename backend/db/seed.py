"""
Seed marketplace templates and governance rules at startup.
Idempotent — uses upsert keyed by template_id / rule_id.
"""
import structlog
from db.mongo_client import get_db

logger = structlog.get_logger(__name__)


MARKETPLACE_TEMPLATES = [
    {
        "template_id": "tpl_doc_classifier",
        "name": "Document Classifier",
        "framework": "langgraph",
        "description": "Classifies uploaded documents into categories (contract, invoice, policy, report, other).",
        "default_system_prompt": (
            "You are a document classification expert. Given the document text, classify it into one of: "
            "contract, invoice, policy, report, other. Respond with a JSON object: "
            "{\"category\": str, \"confidence\": float (0-1), \"reasoning\": str}."
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
            "You are a data extraction expert. Extract all named entities, dates, amounts, parties, "
            "and key clauses from the provided document. Return JSON: "
            "{\"entities\": [...], \"dates\": [...], \"amounts\": [...], \"key_clauses\": [...]}."
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
            "You are a senior risk analyst. Analyze the provided content. Call the risk_scorer tool to get a numerical score. "
            "Return JSON: {\"risk_level\": \"RED\"|\"AMBER\"|\"GREEN\", \"score\": int, \"key_risks\": [...], \"mitigations\": [...]}."
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
            "If any HIGH severity rule is violated, call trigger_hitl with severity=HIGH and a clear reason. "
            "Return JSON: {\"compliance_status\": \"PASS\"|\"FAIL\"|\"REVIEW\", \"violations\": [...]}."
        ),
        "suggested_tools": ["rules_engine_check", "trigger_hitl"],
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
            "You are a senior advisor. Synthesise all upstream agent findings into clear, prioritised recommendations. "
            "Return JSON: {\"summary\": str, \"recommendations\": [{\"priority\": \"HIGH\"|\"MEDIUM\"|\"LOW\", \"action\": str, \"rationale\": str}]}."
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
