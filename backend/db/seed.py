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
        "tags": ["langgraph", "classification", "document-intake"],
        "a2a_enabled": True,
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
        "tags": ["langgraph", "extraction", "structured-output"],
        "a2a_enabled": True,
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
        "tags": ["langgraph", "risk", "governance"],
        "a2a_enabled": True,
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
        "tags": ["langgraph", "compliance", "hitl"],
        "a2a_enabled": True,
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
        "tags": ["langgraph", "advisory", "decision-support"],
        "a2a_enabled": True,
    },
]


def _extra_template(
    template_id: str,
    name: str,
    framework: str,
    description: str,
    prompt: str,
    tools: list[str],
    category: str,
    icon: str,
    hitl_enabled: bool = False,
    tags: list[str] | None = None,
) -> dict:
    return {
        "template_id": template_id,
        "name": name,
        "framework": framework,
        "description": description,
        "default_system_prompt": prompt,
        "suggested_tools": tools,
        "hitl_enabled": hitl_enabled,
        "category": category,
        "icon": icon,
        "tags": tags or [framework, category.lower()],
        "a2a_enabled": True,
    }


MARKETPLACE_TEMPLATES.extend([
    _extra_template("tpl_repo_mapper", "Repository Mapper", "langgraph", "Maps repository structure, major modules, and architectural seams.", "You are a senior software cartographer. Use the knowledge base and web tools to map the repository, identify major modules, infer responsibilities, and return only JSON with modules, boundaries, risks, and modernization opportunities.", ["knowledge_base_search", "document_store", "wikipedia_search"], "Modernization", "Database"),
    _extra_template("tpl_architecture_summarizer", "Architecture Summarizer", "langchain", "Builds an executive summary of the current-state architecture.", "You are an architecture summarizer. Use uploaded KB material and external documentation references to produce a concise current-state architecture summary with systems, interfaces, dependencies, and hotspots. Return only JSON.", ["knowledge_base_search", "webpage_fetch", "document_store"], "Modernization", "FileText"),
    _extra_template("tpl_dependency_analyst", "Dependency Analyst", "crewai", "Finds risky or outdated dependency patterns in codebase context.", "You are a dependency risk analyst. Review KB-uploaded package manifests, architecture notes, and external docs. Return only JSON with risky dependencies, upgrade blockers, and remediation paths.", ["knowledge_base_search", "webpage_fetch", "risk_scorer"], "Modernization", "AlertTriangle"),
    _extra_template("tpl_api_surface_mapper", "API Surface Mapper", "langgraph", "Catalogs APIs, contracts, and interface boundaries.", "You are an API modernization analyst. Extract APIs, protocols, contracts, and ownership boundaries from KB material. Identify undocumented or unstable interfaces. Return only JSON.", ["knowledge_base_search", "document_store"], "Modernization", "Database"),
    _extra_template("tpl_db_schema_analyst", "DB Schema Analyst", "langchain", "Analyzes schema artifacts and migration pain points.", "You are a database modernization strategist. Review schema docs, SQL artifacts, and KB notes. Return only JSON with entities, coupling issues, migration risks, and sequencing advice.", ["knowledge_base_search", "risk_scorer"], "Data", "Database"),
    _extra_template("tpl_strangler_planner", "Strangler Planner", "langgraph", "Designs strangler-fig migration phases.", "You are a transformation architect. Design a phased strangler migration roadmap based on KB context and documented system boundaries. Return only JSON with phases, prerequisites, risks, and success metrics.", ["knowledge_base_search", "risk_scorer", "document_store"], "Modernization", "Lightbulb"),
    _extra_template("tpl_service_decomposer", "Service Decomposer", "crewai", "Suggests service boundaries for monolith decomposition.", "You are a service decomposition specialist. Analyze domain boundaries, dependency clusters, and operational constraints from KB inputs. Return only JSON with candidate services, anti-patterns, and migration heuristics.", ["knowledge_base_search", "risk_scorer"], "Modernization", "Lightbulb"),
    _extra_template("tpl_cloud_migration_planner", "Cloud Migration Planner", "langchain", "Creates cloud migration sequences and guardrails.", "You are a cloud migration planner. Use KB inputs and external docs to outline migration waves, infrastructure concerns, observability needs, and rollback plans. Return only JSON.", ["knowledge_base_search", "webpage_fetch", "serpapi_search"], "Cloud", "Lightbulb"),
    _extra_template("tpl_infra_config_reviewer", "Infra Config Reviewer", "langgraph", "Reviews infrastructure config snippets and environment assumptions.", "You are an infrastructure reviewer. Inspect KB-uploaded IaC, configs, and environment docs for modernization blockers, security issues, and drift risks. Return only JSON.", ["knowledge_base_search", "risk_scorer"], "Cloud", "AlertTriangle"),
    _extra_template("tpl_test_gap_analyzer", "Test Gap Analyzer", "crewai", "Finds test coverage blind spots in modernization plans.", "You are a software assurance analyst. Identify missing test layers, risky unverified paths, and rollout validation gaps from KB material. Return only JSON.", ["knowledge_base_search", "risk_scorer", "document_store"], "Quality", "AlertTriangle"),
    _extra_template("tpl_security_posture_reviewer", "Security Posture Reviewer", "langgraph", "Assesses modernization risks from a security lens.", "You are a security modernization reviewer. Use KB context and official references to identify auth, secrets, data exposure, and surface-hardening risks. Return only JSON.", ["knowledge_base_search", "webpage_fetch", "risk_scorer", "trigger_hitl"], "Security", "ShieldCheck", True),
    _extra_template("tpl_observability_planner", "Observability Planner", "langchain", "Designs logging, tracing, and metrics plans.", "You are an observability strategist. Use system context to recommend logs, traces, dashboards, SLIs, and rollout alerts for modernization programs. Return only JSON.", ["knowledge_base_search", "document_store"], "Operations", "Lightbulb"),
    _extra_template("tpl_release_planner", "Release Orchestration Planner", "crewai", "Builds rollout and rollback plans for releases.", "You are a release orchestration planner. Return only JSON with phased rollout plan, dependencies, rollback triggers, freeze windows, and communications guidance.", ["knowledge_base_search", "risk_scorer"], "Delivery", "Lightbulb"),
    _extra_template("tpl_ci_cd_modernizer", "CI/CD Modernizer", "langgraph", "Reviews build and delivery setup for modernization readiness.", "You are a CI/CD modernization specialist. Analyze pipelines, environments, and deployment notes from KB uploads. Return only JSON with target-state pipeline recommendations and blockers.", ["knowledge_base_search", "webpage_fetch"], "Delivery", "Database"),
    _extra_template("tpl_docs_synthesizer", "Documentation Synthesizer", "langchain", "Synthesizes scattered KB artifacts into coherent documentation.", "You are a technical documentation synthesizer. Use KB inputs to produce structured summaries, dependency maps, and architecture narratives. Return only JSON.", ["knowledge_base_search", "document_store"], "Documentation", "FileText"),
    _extra_template("tpl_github_issue_triager", "GitHub Issue Triager", "crewai", "Turns repo context into actionable triage insights.", "You are a repo triage specialist. Use imported GitHub KB material to identify likely issue areas, impacted modules, and probable owners. Return only JSON.", ["knowledge_base_search", "document_store"], "Repo Ops", "Database"),
    _extra_template("tpl_migration_risk_board", "Migration Risk Board", "langgraph", "Creates a risk board for transformation programs.", "You are a transformation risk board analyst. Aggregate technical, delivery, security, and adoption risks from KB evidence. Return only JSON.", ["knowledge_base_search", "risk_scorer", "document_store"], "Modernization", "AlertTriangle"),
    _extra_template("tpl_policy_evidence_collector", "Policy Evidence Collector", "langchain", "Collects policy evidence from KB and external references.", "You are a governance evidence collector. Use KB and external sources to gather policy evidence, unresolved gaps, and review notes. Return only JSON.", ["knowledge_base_search", "policy_library_search", "webpage_fetch"], "Governance", "ShieldCheck"),
    _extra_template("tpl_external_docs_researcher", "External Docs Researcher", "langgraph", "Pulls relevant official-doc context for modernization analysis.", "You are a documentation researcher. Use live web tools to gather relevant official guidance, summarize applicability, and cite source links. Return only JSON.", ["serpapi_search", "webpage_fetch", "wikipedia_search"], "Research", "FileText"),
    _extra_template("tpl_code_remediation_planner", "Code Remediation Planner", "crewai", "Turns codebase findings into prioritized remediation tasks.", "You are a code remediation planner. Based on KB findings, produce a prioritized remediation backlog with rationale, dependencies, and expected impact. Return only JSON.", ["knowledge_base_search", "risk_scorer", "document_store"], "Modernization", "Lightbulb"),
    _extra_template("tpl_portfolio_roadmap_strategist", "Portfolio Roadmap Strategist", "langchain", "Creates cross-project modernization roadmaps.", "You are a portfolio modernization strategist. Build a roadmap across systems, teams, and dependencies using KB evidence and external constraints. Return only JSON.", ["knowledge_base_search", "risk_scorer"], "Strategy", "Lightbulb"),
    _extra_template("tpl_legacy_java_advisor", "Legacy Java Advisor", "langgraph", "Specialist for legacy Java migration and decomposition.", "You are a legacy Java modernization specialist. Use KB repo context and external docs to identify migration paths, framework upgrades, and risky code zones. Return only JSON.", ["knowledge_base_search", "serpapi_search", "webpage_fetch"], "Modernization", "Database"),
    _extra_template("tpl_dotnet_modernization_strategist", ".NET Modernization Strategist", "crewai", "Plans modernization for legacy .NET estates.", "You are a .NET transformation strategist. Review KB material and return only JSON with upgrade paths, service extraction candidates, and risk controls.", ["knowledge_base_search", "webpage_fetch", "risk_scorer"], "Modernization", "Lightbulb"),
    _extra_template("tpl_frontend_refresh_planner", "Frontend Refresh Planner", "langchain", "Recommends frontend modernization and design-system migration plans.", "You are a frontend modernization planner. Use KB and external references to propose UI architecture cleanup, design-system migration, and delivery sequencing. Return only JSON.", ["knowledge_base_search", "webpage_fetch"], "Frontend", "Lightbulb"),
    _extra_template("tpl_data_contract_analyst", "Data Contract Analyst", "langgraph", "Finds fragile data contracts and integration assumptions.", "You are a data contract analyst. Review KB docs for event schemas, API payloads, and integration contracts. Return only JSON with fragile assumptions and remediation paths.", ["knowledge_base_search", "risk_scorer"], "Data", "AlertTriangle"),
    _extra_template("tpl_weather_context_agent", "Weather Context Agent", "langchain", "Demonstrates real-time weather enrichment for workflows.", "You are a realtime context agent. Use weather tools when location context matters and return only JSON with observations and operational implications.", ["weather_current", "openweather_current"], "Realtime", "Database"),
    _extra_template("tpl_java_to_spring_boot_architect", "Java to Spring Boot Architect", "crewai", "Designs an incremental path from legacy Java stacks to Spring Boot services.", "You are a senior migration architect for legacy Java to Spring Boot transformations. Use workflow inputs, KB context, and official Java/Spring docs to produce only JSON with target modules, migration phases, dependency shifts, risky APIs, test strategy, and rollout controls.", ["knowledge_base_search", "java_docs_search", "spring_docs_search", "document_store", "risk_scorer"], "Migration", "Lightbulb", tags=["crewai", "migration", "java", "spring-boot"]),
    _extra_template("tpl_java_to_python_service_translator", "Java to Python Service Translator", "agno", "Maps Java service behavior into Python service boundaries and implementation strategy.", "You are a Java-to-Python modernization specialist. Analyze workflow input code, imported repositories, and official docs. Return only JSON with module mappings, runtime assumptions, framework recommendations, concurrency differences, and translation risks.", ["knowledge_base_search", "java_docs_search", "python_docs_search", "risk_scorer"], "Migration", "Database", tags=["agno", "migration", "java", "python"]),
    _extra_template("tpl_streamlit_to_nextjs_experience_migrator", "Streamlit to Next.js Experience Migrator", "agno", "Converts Streamlit interaction patterns into Next.js UX and delivery plans.", "You are a frontend migration strategist moving Streamlit experiences to Next.js. Use workflow input files, KB evidence, and official docs to return only JSON with page inventory, state transitions, server/client split, API contracts, and migration sequence.", ["knowledge_base_search", "python_docs_search", "official_docs_search", "document_store"], "Migration", "Lightbulb", tags=["agno", "migration", "streamlit", "nextjs"]),
    _extra_template("tpl_react_to_nextjs_upgrade_planner", "React to Next.js Upgrade Planner", "crewai", "Plans route, rendering, data-fetching, and deployment changes for React to Next.js migrations.", "You are a React to Next.js migration planner. Return only JSON with routing migration map, SSR/ISR opportunities, API boundaries, package changes, and deployment caveats using workflow inputs and official docs.", ["knowledge_base_search", "official_docs_search", "risk_scorer"], "Migration", "Lightbulb", tags=["crewai", "migration", "react", "nextjs"]),
    _extra_template("tpl_python_to_streamlit_prototyper", "Python to Streamlit Prototyper", "agno", "Turns Python scripts and notebooks into Streamlit app plans.", "You are a Python app modernization specialist. Use workflow inputs and official docs to return only JSON with UI sections, session-state strategy, chart/data widgets, and refactoring tasks for packaging as Streamlit.", ["knowledge_base_search", "python_docs_search", "document_store"], "Migration", "FileText", tags=["agno", "migration", "python", "streamlit"]),
    _extra_template("tpl_dotnet_to_python_api_migrator", ".NET to Python API Migrator", "crewai", "Builds a phased migration plan from .NET services into Python APIs.", "You are a .NET to Python migration architect. Review workflow inputs, imported repositories, and official docs. Return only JSON with endpoint mappings, DI/runtime replacements, auth changes, serialization differences, and release guardrails.", ["knowledge_base_search", "dotnet_docs_search", "python_docs_search", "risk_scorer"], "Migration", "AlertTriangle", tags=["crewai", "migration", "dotnet", "python"]),
    _extra_template("tpl_spring_boot_to_microservices_cutover", "Spring Boot Microservice Cutover Planner", "agno", "Plans extraction and cutover from modular Spring Boot apps into independently deployed services.", "You are a Spring Boot cutover planner. Use repository context, workflow inputs, and official docs to return only JSON with bounded contexts, service contracts, infra needs, and cutover sequencing.", ["knowledge_base_search", "spring_docs_search", "document_store", "risk_scorer"], "Migration", "Database", tags=["agno", "migration", "spring-boot", "microservices"]),
])


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
