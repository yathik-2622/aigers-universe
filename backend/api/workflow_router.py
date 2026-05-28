"""
Workflow API router — create workflow definitions and execute them.
"""
import asyncio
import json
import uuid
import datetime
import re
import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from core.llm_router import chat_completion
from core.api_errors import public_error, request_id_from
from core.report_builder import build_run_report
from db.mongo_client import get_db
from core.request_context import get_optional_role, get_optional_user_id
from core.workflow_engine import build_and_run_workflow, request_workflow_pause, request_workflow_stop, resume_workflow_run
from core.framework_runners import get_framework_runtime_health
from a2a.agent_communication import get_a2a_messages
from db.repositories.agent_repo import AgentRepository
from mcp_tools.tool_server import TOOL_REGISTRY, get_tool_health

logger = structlog.get_logger(__name__)
router = APIRouter()
agent_repo = AgentRepository()
DEFAULT_INPUT_BINDINGS = {
    "include_text_input": True,
    "include_uploaded_files": True,
    "include_github_repo": True,
    "include_knowledge_base": True,
    "include_upstream_outputs": True,
}
FRAMEWORK_TAGS = {"langgraph", "langchain", "crewai", "agno"}


def _report_needs_rematerialization(run: dict) -> bool:
    markdown = (run.get("report_markdown") or "").strip()
    structured = run.get("report_structured") or {}
    if not markdown:
        return True
    if "## Final Agent Objective" in markdown or "## Final Deliverable" in markdown or "## Upstream Agent Outputs" in markdown:
        return True
    if structured.get("primary_agent"):
        return False
    if structured.get("overall_decision") or structured.get("executive_summary"):
        return True
    return markdown.startswith("Review Summary:")


def _parse_iso(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _duration_ms(start_value: str | None, end_value: str | None = None) -> int | None:
    start_dt = _parse_iso(start_value)
    end_dt = _parse_iso(end_value) if end_value else datetime.datetime.utcnow()
    if not start_dt or not end_dt:
        return None
    return max(0, int((end_dt - start_dt).total_seconds() * 1000))


async def _attach_run_timing(db, run: dict) -> dict:
    if not run:
        return run

    agent_names = [agent.get("agent_name") for agent in run.get("agents", []) if agent.get("agent_name")]
    if agent_names:
        per_agent_cursor = db.agent_traces.aggregate(
            [
                {"$match": {"agent_name": {"$in": agent_names}, "status": "success"}},
                {"$group": {"_id": "$agent_name", "avg_latency_ms": {"$avg": "$latency_ms"}, "count": {"$sum": 1}}},
            ]
        )
        latency_by_agent = {
            item["_id"]: {"avg_latency_ms": round(item.get("avg_latency_ms") or 0.0, 2), "samples": int(item.get("count") or 0)}
            for item in await per_agent_cursor.to_list(200)
            if item.get("_id")
        }
    else:
        latency_by_agent = {}

    workflow_avg_total_ms = None
    if run.get("workflow_id"):
        workflow_run_cursor = db.workflow_runs.aggregate(
            [
                {"$match": {"workflow_id": run["workflow_id"], "status": "completed", "started_at": {"$ne": None}, "completed_at": {"$ne": None}}},
                {
                    "$project": {
                        "duration_ms": {
                            "$dateDiff": {
                                "startDate": {"$dateFromString": {"dateString": "$started_at"}},
                                "endDate": {"$dateFromString": {"dateString": "$completed_at"}},
                                "unit": "millisecond",
                            }
                        }
                    }
                },
                {"$group": {"_id": None, "avg_duration_ms": {"$avg": "$duration_ms"}}},
            ]
        )
        workflow_stats = await workflow_run_cursor.to_list(1)
        if workflow_stats:
            workflow_avg_total_ms = int(workflow_stats[0].get("avg_duration_ms") or 0)

    current_step = int(run.get("current_step") or 0)
    result_by_step = {
        item.get("step_number"): item
        for item in (run.get("agent_results") or [])
        if isinstance(item.get("step_number"), int)
    }
    agent_estimates = []
    total_agent_estimate_ms = 0
    remaining_ms = 0
    active_statuses = {"running", "resuming", "paused"}
    for idx, agent in enumerate(run.get("agents", []) or []):
        name = agent.get("agent_name", "")
        estimate = latency_by_agent.get(name, {})
        avg_latency_ms = int(estimate.get("avg_latency_ms") or 0)
        total_agent_estimate_ms += avg_latency_ms
        result = result_by_step.get(idx)
        if run.get("status") in active_statuses and result is None and idx >= current_step:
            remaining_ms += avg_latency_ms
        agent_estimates.append(
            {
                "agent_id": agent.get("agent_id"),
                "agent_name": name,
                "step_number": idx,
                "avg_latency_ms": avg_latency_ms,
                "samples": int(estimate.get("samples") or 0),
                "actual_latency_ms": int(result.get("latency_ms") or 0) if result else None,
            }
        )

    elapsed_ms = _duration_ms(run.get("started_at"), run.get("completed_at"))
    total_estimate_ms = workflow_avg_total_ms or total_agent_estimate_ms or None
    if run.get("status") == "completed":
        remaining_ms = 0
    elif elapsed_ms is not None and total_estimate_ms and total_estimate_ms > elapsed_ms:
        remaining_ms = max(remaining_ms, total_estimate_ms - elapsed_ms)

    run["timing"] = {
        "elapsed_ms": elapsed_ms,
        "estimated_total_ms": total_estimate_ms,
        "estimated_remaining_ms": remaining_ms,
        "workflow_average_total_ms": workflow_avg_total_ms,
        "agent_estimates": agent_estimates,
    }
    return run


async def _accessible_project_ids(db, user_id: str | None, role: str | None) -> list[str]:
    if not user_id or role == "admin":
        return []
    projects = await db.projects.find(
        {"$or": [{"owner_user_id": user_id}, {"member_ids": user_id}]},
        {"_id": 0, "project_id": 1},
    ).to_list(500)
    return [p["project_id"] for p in projects]


async def _workflow_query(db, request: Request, extra: dict | None = None) -> dict:
    query = dict(extra or {})
    user_id = get_optional_user_id(request)
    role = get_optional_role(request)
    if not user_id or role == "admin":
        return query
    project_ids = await _accessible_project_ids(db, user_id, role)
    query["$or"] = [{"owner_user_id": user_id}]
    if project_ids:
        query["$or"].append({"project_id": {"$in": project_ids}})
    return query


async def _run_query(db, request: Request, extra: dict | None = None) -> dict:
    query = dict(extra or {})
    user_id = get_optional_user_id(request)
    role = get_optional_role(request)
    if not user_id or role == "admin":
        return query
    project_ids = await _accessible_project_ids(db, user_id, role)
    query["$or"] = [{"owner_user_id": user_id}]
    if project_ids:
        query["$or"].append({"project_id": {"$in": project_ids}})
    return query


class CreateWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    project_id: str | None = Field(default=None)
    agents: list[str] = Field(..., description="Ordered list of agent_ids")
    input_type: str = Field(default="document")
    policy_ids: list[str] = Field(default_factory=list)
    canvas: dict = Field(default_factory=dict, description="ReactFlow nodes+edges JSON for restoring the canvas")

    @field_validator("agents")
    @classmethod
    def at_least_two_agents(cls, v):
        if len(v) < 2:
            raise ValueError("Workflow must have at least 2 agents")
        return v


class RunWorkflowRequest(BaseModel):
    input_data: dict = Field(...)


class AutoBuildWorkflowRequest(BaseModel):
    prompt: str = Field(..., min_length=12, max_length=12000)
    project_id: str | None = Field(default=None)
    auto_install_missing: bool = Field(default=False)


def _json_default(value):
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    return str(value)


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=_json_default)}\n\n"


def _orchestrator_event(stage: str, detail: str, status: str = "completed", tone: str = "info", payload: dict | None = None) -> dict:
    return {
        "type": "status_update",
        "channel": "workflow_orchestrator",
        "stage": stage,
        "label": stage,
        "detail": detail,
        "status": status,
        "tone": tone,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "payload": payload or None,
    }


def _preflight_clarifying_questions(prompt: str) -> list[str]:
    normalized = _normalized(prompt)
    if "clarifications" in normalized or "answer" in normalized:
        return []
    tokens = normalized.split()
    broad_terms = {"app", "platform", "system", "workflow", "solution", "project", "tool", "agent", "automation"}
    needs_more_context = len(tokens) < 22 or len(set(tokens) - broad_terms) < 8
    if not needs_more_context:
        return []
    return [
        "Who is the primary user or business team for this workflow?",
        "What source material should the agents trust first: uploaded files, knowledge base, repository, or web research?",
        "What final deliverable do you expect: architecture report, implementation plan, data extraction, market analysis, or executable workflow run?",
    ]


async def _llm_clarifying_questions(prompt: str) -> list[str]:
    fallback = _preflight_clarifying_questions(prompt)
    if not fallback:
        return []
    try:
        result = await chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an enterprise workflow intake architect. "
                        "Return strict JSON: {\"questions\": [str]}. "
                        "Ask 2-4 concise, prompt-specific questions needed before designing a workflow. "
                        "Questions must be tailored to the actual use case, not generic fixed intake questions. "
                        "Do not ask questions already answered in the prompt."
                    ),
                },
                {"role": "user", "content": prompt[:4000]},
            ],
            caller="workflow.auto_build.clarifying_questions",
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        payload = json.loads(result.get("content") or "{}")
        questions = [str(item).strip() for item in payload.get("questions", []) if str(item).strip()]
        return questions[:4] or fallback
    except Exception as exc:
        logger.warning("api.workflow.auto_build.clarifying_questions_failed", error=str(exc))
        return fallback


def _normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _tokenize(text: str) -> set[str]:
    return {token for token in _normalized(text).split() if token}


def _agent_summary(agent: dict) -> dict:
    return {
        "agent_id": agent["agent_id"],
        "name": agent["name"],
        "framework": agent.get("framework", "langgraph"),
        "description": agent.get("description", ""),
        "tools": agent.get("tools", []),
        "tags": agent.get("tags", []),
        "template_id": agent.get("template_id"),
        "a2a_enabled": agent.get("a2a_enabled", True),
        "a2a_mode": agent.get("a2a_mode", "local"),
        "remote_agent_card_url": agent.get("remote_agent_card_url", ""),
        "hitl_enabled": agent.get("hitl_enabled", False),
    }


def _template_summary(template: dict) -> dict:
    return {
        "template_id": template["template_id"],
        "name": template["name"],
        "framework": template.get("framework", "langgraph"),
        "description": template.get("description", ""),
        "tools": template.get("suggested_tools", []),
        "tags": template.get("tags", []),
        "hitl_enabled": template.get("hitl_enabled", False),
    }


def _score_inventory_match(prompt_tokens: set[str], item: dict) -> int:
    searchable = " ".join(
        [
            item.get("name", ""),
            item.get("description", ""),
            " ".join(item.get("tags", [])),
            " ".join(item.get("tools", [])),
            item.get("framework", ""),
        ]
    )
    return len(prompt_tokens & _tokenize(searchable))


def _fallback_step_templates(prompt: str, templates: list[dict]) -> list[str]:
    prompt_l = _normalized(prompt)
    ordered: list[str] = []

    def add(template_id: str) -> None:
        if template_id not in ordered:
            ordered.append(template_id)

    if any(term in prompt_l for term in ["contract", "msa", "clause", "legal", "vendor", "agreement"]):
        add("tpl_doc_classifier")
        add("tpl_data_extractor")
        add("tpl_risk_analyzer")
        if "compliance" in prompt_l or "privacy" in prompt_l or "regulatory" in prompt_l:
            add("tpl_compliance_checker")
        add("tpl_recommendation_advisor")
    if any(term in prompt_l for term in ["modernize", "modernization", "migration", "migrate", "legacy", "monolith", "streamlit", "nextjs", "java", "spring", ".net", "python", "react"]):
        if "java" in prompt_l and "spring" in prompt_l:
            add("tpl_java_to_spring_boot_architect")
        elif "java" in prompt_l and "python" in prompt_l:
            add("tpl_java_to_python_service_translator")
        elif "streamlit" in prompt_l and "next" in prompt_l:
            add("tpl_streamlit_to_nextjs_experience_migrator")
        elif "react" in prompt_l and "next" in prompt_l:
            add("tpl_react_to_nextjs_upgrade_planner")
        elif ".net" in prompt_l and "python" in prompt_l:
            add("tpl_dotnet_to_python_api_migrator")
        else:
            add("tpl_repo_mapper")
            add("tpl_dependency_analyst")
        add("tpl_migration_risk_board")
        add("tpl_code_remediation_planner")
        if "release" in prompt_l or "rollout" in prompt_l or "cutover" in prompt_l:
            add("tpl_release_planner")
    if not ordered:
        prompt_tokens = _tokenize(prompt)
        ranked = sorted(
            templates,
            key=lambda template: _score_inventory_match(prompt_tokens, _template_summary(template)),
            reverse=True,
        )
        for template in ranked[:4]:
            add(template["template_id"])
    return ordered[:5]


def _infer_goal_type(prompt: str) -> str:
    prompt_l = _normalized(prompt)
    if any(term in prompt_l for term in ["modernize", "migration", "legacy", "monolith", "upgrade", "refactor"]):
        return "modernization"
    if any(term in prompt_l for term in ["contract", "legal", "clause", "compliance", "privacy", "regulatory"]):
        return "governance"
    if any(term in prompt_l for term in ["architecture", "design", "system", "workflow", "orchestrator"]):
        return "architecture"
    if any(term in prompt_l for term in ["market", "product", "customer", "roi", "business"]):
        return "strategy"
    return "general"


def _default_market_signal(prompt: str) -> dict:
    prompt_l = _normalized(prompt)
    demand = "moderate"
    if any(term in prompt_l for term in ["modernize", "migration", "legacy", "automation", "agentic", "workflow"]):
        demand = "high"
    if any(term in prompt_l for term in ["experimental", "prototype", "moonshot"]):
        demand = "uncertain"
    return {
        "demand_signal": demand,
        "evidence_note": "Live market research could not be completed, so this signal falls back to prompt intent plus current AIger inventory coverage.",
        "truth_note": "Treat this as an orchestration readiness signal unless live market citations are present below.",
    }


def _clip_text(value: str, limit: int = 320) -> str:
    text = re.sub(r"\s+", " ", (value or "")).strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def _coerce_market_citation(label: str, source_type: str, source_ref: str, excerpt: str, url: str = "") -> dict:
    return {
        "label": label,
        "source_type": source_type,
        "source_ref": source_ref,
        "excerpt": _clip_text(excerpt, 420),
        "url": url,
    }


async def _run_market_research(prompt: str) -> dict:
    findings: list[dict] = []
    citations: list[dict] = []
    source_count = 0

    async def _try_tool(tool_name: str, **kwargs):
        tool = TOOL_REGISTRY.get(tool_name)
        if not tool:
            logger.info("api.workflow.auto_build.market_tool_missing", tool=tool_name)
            return None
        try:
            logger.info("api.workflow.auto_build.market_tool_start", tool=tool_name)
            result = await tool(**kwargs)
            logger.info("api.workflow.auto_build.market_tool_complete", tool=tool_name)
            return result
        except Exception as exc:
            logger.warning("api.workflow.auto_build.market_tool_failed", tool=tool_name, error=str(exc))
            return None

    wiki_result = await _try_tool("wikipedia_search", query=prompt[:160], limit=2)
    if wiki_result:
        for item in (wiki_result.get("results") or [])[:2]:
            description = item.get("description") or ""
            title = item.get("title") or "Wikipedia"
            url = item.get("url") or ""
            if not description:
                continue
            findings.append({"title": title, "summary": _clip_text(description), "source_type": "wikipedia", "url": url})
            citations.append(_coerce_market_citation(title, "wikipedia", url or title, description, url))
            source_count += 1

    docs_result = await _try_tool("official_docs_search", provider="all", query=prompt[:140], max_results=2)
    if docs_result:
        for item in (docs_result.get("results") or [])[:2]:
            title = item.get("title") or "Official documentation"
            snippet = item.get("snippet") or ""
            url = item.get("url") or ""
            if not snippet:
                continue
            findings.append({"title": title, "summary": _clip_text(snippet), "source_type": "official_docs", "url": url})
            citations.append(_coerce_market_citation(title, "official_docs", url or title, snippet, url))
            source_count += 1

    if source_count < 4:
        serp_result = await _try_tool(
            "serpapi_search",
            query=f"{prompt[:180]} market size adoption roi enterprise",
            num=5,
            location="United States",
        )
        if serp_result:
            for item in (serp_result.get("results") or [])[:3]:
                title = item.get("title") or item.get("source") or "Market result"
                snippet = item.get("snippet") or ""
                link = item.get("link") or ""
                if not snippet:
                    continue
                findings.append({"title": title, "summary": _clip_text(snippet), "source_type": "web_search", "url": link})
                citations.append(_coerce_market_citation(title, "web_search", link or title, snippet, link))
                source_count += 1
                if link:
                    page = await _try_tool("webpage_fetch", url=link, max_chars=2400)
                    page_content = (page or {}).get("content") or ""
                    if page_content:
                        findings.append({
                            "title": f"{title} detail",
                            "summary": _clip_text(page_content, 420),
                            "source_type": "webpage_fetch",
                            "url": link,
                        })
                        citations.append(_coerce_market_citation(f"{title} detail", "webpage_fetch", link, page_content, link))
                        source_count += 1
                if source_count >= 4:
                    break

    findings = findings[:6]
    citations = citations[:8]
    if citations:
        demand_signal = "high" if len(citations) >= 4 else "moderate"
        return {
            "demand_signal": demand_signal,
            "evidence_note": f"Live market research gathered {len(citations)} source-backed citation(s) using installed research tools.",
            "truth_note": "These findings are evidence-backed but still require human review before making commercial commitments.",
            "findings": findings,
            "citations": citations,
            "live": True,
        }
    fallback = _default_market_signal(prompt)
    return {**fallback, "findings": [], "citations": [], "live": False}


def _build_hitl_checkpoints(plan: dict, missing_templates: list[dict], creation_suggestions: list[dict]) -> list[dict]:
    checkpoints: list[dict] = []
    if missing_templates:
        checkpoints.append({
            "stage": "installation",
            "label": "Approve marketplace installs",
            "detail": f"Install {len(missing_templates)} missing marketplace agent template(s) before building the workflow.",
        })
    if creation_suggestions:
        checkpoints.append({
            "stage": "creation",
            "label": "Approve agent draft creation",
            "detail": f"Create {len(creation_suggestions)} suggested custom agent draft(s) because the current inventory does not fully cover the requested workflow.",
        })
    checkpoints.append({
        "stage": "execution",
        "label": "Approve workflow execution",
        "detail": "Confirm inputs, repository context, and KB scope before starting the final workflow run.",
    })
    return checkpoints


def _build_creation_suggestions(prompt: str, goal_type: str, missing_templates: list[dict], selected_agents: list[dict]) -> list[dict]:
    if not missing_templates and len(selected_agents) >= 2:
        return []
    prompt_excerpt = prompt.strip()[:240]
    suggestions: list[dict] = [
        {
            "name": "Use Case Research Synthesizer",
            "framework": "langgraph",
            "model_name": "gpt-4o",
            "tools": ["knowledge_base_search", "document_store", "webpage_fetch", "serpapi_search"],
            "description": "Researches the use case, extracts grounded constraints, and prepares evidence-backed orchestration inputs.",
            "system_prompt": (
                "You are a use-case research synthesizer. Infer the real business and technical intent from the user's prompt, "
                "collect the most relevant workspace and external evidence, summarize viability, call out uncertainty, and return only structured findings."
            ),
            "rationale": "Recommended when the workflow needs discovery, truth-checking, or broader evidence before execution planning.",
            "hitl_enabled": False,
            "tags": [goal_type, "research", "orchestration"],
        },
        {
            "name": "Architecture and Prompt Orchestrator",
            "framework": "langgraph",
            "model_name": "gpt-4o",
            "tools": ["knowledge_base_search", "document_store", "risk_scorer", "trigger_hitl"],
            "description": "Builds the end-to-end architecture, rich reusable prompts, agent boundaries, and approval checkpoints for the requested use case.",
            "system_prompt": (
                "You are an architecture and prompt orchestrator. Design an end-to-end agentic workflow, propose reusable prompts, "
                "identify tools and models per agent, and insert HITL checkpoints where installation, creation, or risk acceptance needs human approval."
            ),
            "rationale": "Recommended when no single installed or marketplace agent cleanly covers architecture synthesis plus orchestrator prompt design.",
            "hitl_enabled": True,
            "tags": [goal_type, "architecture", "prompting"],
        },
    ]
    return suggestions[:2]


def _build_plan_citations(
    selected_agents: list[dict],
    missing_templates: list[dict],
    creation_suggestions: list[dict],
    market_citations: list[dict] | None = None,
) -> list[dict]:
    citations: list[dict] = []
    for agent in selected_agents:
        citations.append({
            "label": agent.get("name") or agent.get("agent_id"),
            "source_type": "installed_agent",
            "source_ref": agent.get("agent_id"),
            "excerpt": agent.get("description", ""),
        })
    for template in missing_templates:
        citations.append({
            "label": template.get("name") or template.get("template_id"),
            "source_type": "marketplace_template",
            "source_ref": template.get("template_id"),
            "excerpt": template.get("description", ""),
        })
    for suggestion in creation_suggestions:
        citations.append({
            "label": suggestion.get("name"),
            "source_type": "agent_creation_suggestion",
            "source_ref": suggestion.get("framework"),
            "excerpt": suggestion.get("rationale", ""),
        })
    citations.extend(market_citations or [])
    return citations[:16]


def _build_architecture_summary(prompt: str, selected_agents: list[dict], creation_suggestions: list[dict]) -> str:
    stages = [agent.get("name") for agent in selected_agents if agent.get("name")]
    if creation_suggestions:
      stages.extend(suggestion.get("name") for suggestion in creation_suggestions if suggestion.get("name"))
    pipeline = " -> ".join(stages[:6]) or "Discovery -> Planning -> Validation -> Delivery"
    return (
        f"Suggested orchestration path: {pipeline}. "
        f"The workflow should start from the user's intent, enrich it with grounded repo/KB evidence, then move through planning, risk review, and final delivery artifacts for: {prompt.strip()[:180]}."
    )


def _build_design_document_markdown(
    prompt: str,
    enterprise_report: dict,
    selected_agents: list[dict],
    missing_templates: list[dict],
    creation_suggestions: list[dict],
    market_signal: dict,
    citations: list[dict],
) -> str:
    report = enterprise_report or {}
    agent_lines = []
    for index, agent in enumerate(selected_agents, start=1):
        agent_lines.append(
            f"{index}. **{agent.get('name', 'Agent')}** ({agent.get('framework', 'langgraph')}) - "
            f"{agent.get('description') or 'Executes its assigned workflow capability.'}"
        )
    for suggestion in creation_suggestions:
        agent_lines.append(
            f"{len(agent_lines) + 1}. **{suggestion.get('name', 'Custom agent')}** ({suggestion.get('framework', 'langgraph')}) - "
            f"{suggestion.get('description') or suggestion.get('rationale') or 'Custom capability generated for this use case.'}"
        )
    if not agent_lines and missing_templates:
        for template in missing_templates:
            agent_lines.append(
                f"{len(agent_lines) + 1}. **{template.get('name', 'Marketplace agent')}** ({template.get('framework', 'langgraph')}) - "
                f"{template.get('description') or 'Marketplace capability pending installation.'}"
            )

    citation_lines = []
    for index, citation in enumerate(citations[:8], start=1):
        label = citation.get("label") or citation.get("source_ref") or f"Source {index}"
        url = citation.get("url") or ""
        if url and citation.get("source_type") in {"web_search", "webpage_fetch", "official_docs", "wikipedia"}:
            citation_lines.append(f"- [{label}]({url})")

    return "\n".join(
        [
            f"# {report.get('title') or 'Enterprise Solution Design'}",
            "",
            "## 1. Use Case Understanding",
            report.get("usecase_understanding") or prompt.strip(),
            "",
            "## 2. Market Validation",
            report.get("market_evaluation") or market_signal.get("evidence_note") or "Market validation requires live research citations before production investment decisions.",
            "\n".join(citation_lines) if citation_lines else "- No live market citations were available during this run.",
            "",
            "## 3. Market Differentiation",
            report.get("market_comparison") or "The use case should differentiate through workflow specificity, governed agent orchestration, evidence-backed outputs, and HITL controls.",
            "",
            "## 4. Key Differentiators",
            "\n".join(f"- {item}" for item in (report.get("key_differentiators") or ["Grounded enterprise workflow design", "Marketplace-aware agent composition", "Human approval gates for risk and installation"])) ,
            "",
            "## 5. Target Architecture",
            report.get("technical_architecture") or "Prompt intake -> clarification -> market validation -> agent/workflow planning -> HITL installation gate -> canvas generation -> governed execution.",
            "",
            "## 6. Agent Workflow Plan",
            "\n".join(agent_lines) or "- Custom architecture and orchestration agents should be created for this workflow.",
            "",
            "## 7. Required Tools And Runtime Protocols",
            "### Tools",
            "\n".join(f"- {item}" for item in (report.get("tools_required") or ["Knowledge base search", "Document store", "Marketplace template registry", "HITL approval service"])) ,
            "",
            "### Runtime Protocols",
            "\n".join(f"- {item}" for item in (report.get("protocols_and_cloud") or ["HTTP APIs", "Server-sent events", "A2A handoffs", "HITL approval workflow"])) ,
            "",
            "## 8. Implementation Notes",
            report.get("design_document") or "Build the workflow as a governed AIger canvas with explicit input bindings, scoped tools, reusable prompts, and audit-ready citations.",
        ]
    )


def _ensure_enterprise_report(
    prompt: str,
    plan: dict,
    selected_agents: list[dict],
    missing_templates: list[dict],
    creation_suggestions: list[dict],
    market_signal: dict,
    citations: list[dict],
) -> dict:
    report = dict(plan.get("enterprise_report") or {})
    report.setdefault("usecase_understanding", plan.get("workflow_description") or prompt.strip())
    report.setdefault("market_evaluation", market_signal.get("evidence_note") or _default_market_signal(prompt).get("evidence_note"))
    report.setdefault("market_comparison", "Compared the requested workflow against available market signals, installed inventory, and marketplace seed agents to identify exact-fit and gap capabilities.")
    report.setdefault("pros", ["Can be converted into a governed multi-agent workflow", "Supports market-backed validation and reusable technical documentation"])
    report.setdefault("cons", ["Requires human confirmation when the prompt lacks business context", "Live market evidence depends on configured research tools"])
    report.setdefault("key_objectives", ["Understand the user intent", "Validate market relevance", "Design the target architecture", "Build an executable AIger workflow"])
    report.setdefault("key_identifiers", [_infer_goal_type(prompt), "enterprise-workflow", "agentic-orchestration"])
    report.setdefault("key_differentiators", ["Clarification-first architecture planning", "Marketplace exact-match install gate", "Automatic custom agent creation when no exact seed agent exists"])
    report.setdefault("technical_architecture", plan.get("architecture_summary") or _build_architecture_summary(prompt, selected_agents, creation_suggestions))
    report.setdefault("tech_stack", ["AIger workflow builder", "LangGraph/LangChain/CrewAI/Agno agents", "MongoDB-backed registry", "SSE orchestration stream"])
    report.setdefault("agent_blueprint", [agent.get("name") for agent in selected_agents if agent.get("name")] + [item.get("name") for item in creation_suggestions if item.get("name")])
    report.setdefault("tools_required", sorted({tool for agent in selected_agents for tool in (agent.get("tools") or [])} | {tool for item in creation_suggestions for tool in (item.get("tools") or [])}))
    report.setdefault("protocols_and_cloud", ["HTTP APIs", "Server-sent events", "A2A local handoffs", "HITL approval workflow"])
    report["design_document_markdown"] = _build_design_document_markdown(prompt, report, selected_agents, missing_templates, creation_suggestions, market_signal, citations)
    return report


async def _llm_auto_plan(prompt: str, installed_agents: list[dict], templates: list[dict]) -> dict:
    messages = [
        {
            "role": "system",
            "content": (
                "You are the AIger's Universe LangGraph-style workflow orchestration planner. "
                "Act as a best-in-class 30+ year senior enterprise solution architect, technical architect, product strategist, and agentic workflow designer. "
                "Follow this exact sequence: understand the user prompt; ask only necessary clarifying questions; validate the use case against the market with citations when tools provide them; identify market differentiators; create full technical design documentation in Markdown; plan the AIger workflow with agent count, agent roles, prompts, tools, frameworks, inputs, outputs, and HITL gates; then map that design to installed agents and marketplace seed agents. "
                "Do not merely pick agents. First understand the use case, then design the POC independently of current platform inventory, then map that design onto installed agents and marketplace templates. "
                "Ask clarifying questions only when essential information is missing. If clarifications are present, incorporate them and continue. "
                "Evaluate market fit, cite evidence when available, identify pros, cons, risks, differentiators, business objectives, technical objectives, architecture, tech stack, cloud/protocol/tool choices, and the agents required to build the POC. "
                "Only after that, compare installed agents and marketplace templates for exact role/prompt fit. Prefer installed agents only when their description and intended prompt match the role. Use marketplace templates when a matching installed agent is absent. Suggest custom agent creation when neither fits. "
                "For every custom agent suggestion, create a production-grade system_prompt that is specific to the user's use case, includes inputs, tools, output contract, grounding rules, and HITL behavior. "
                "Return strict JSON with this schema: "
                "{\"workflow_name\": str, \"workflow_description\": str, \"goal_type\": str, "
                "\"reasoning_summary\": str, \"executive_summary\": str, \"architecture_summary\": str, "
                "\"orchestrator_prompt\": str, \"recommended_steps\": ["
                "{\"label\": str, \"why\": str, \"selection_type\": \"installed_agent\"|\"template\", "
                "\"agent_id\": str, \"template_id\": str, "
                "\"input_bindings\": {\"include_text_input\": bool, \"include_uploaded_files\": bool, "
                "\"include_github_repo\": bool, \"include_knowledge_base\": bool, \"include_upstream_outputs\": bool}}], "
                "\"workflow_input_hints\": {\"needs_text\": bool, \"needs_files\": bool, \"needs_repo_import\": bool, \"needs_kb\": bool}, "
                "\"hitl_checkpoints\": [{\"stage\": str, \"label\": str, \"detail\": str}], "
                "\"clarifying_questions\": [str], "
                "\"enterprise_report\": {\"usecase_understanding\": str, \"market_evaluation\": str, \"market_comparison\": str, \"pros\": [str], \"cons\": [str], \"key_objectives\": [str], \"key_identifiers\": [str], \"key_differentiators\": [str], \"design_document\": str, \"design_document_markdown\": str, \"technical_architecture\": str, \"tech_stack\": [str], \"agent_blueprint\": [str], \"tools_required\": [str], \"protocols_and_cloud\": [str]}, "
                "\"agent_creation_suggestions\": [{\"name\": str, \"framework\": str, \"model_name\": str, \"tools\": [str], \"description\": str, \"system_prompt\": str, \"rationale\": str, \"hitl_enabled\": bool, \"tags\": [str]}]}. "
                "Use 2 to 6 workflow steps. Do not invent installed agent IDs or template IDs. Leave irrelevant id fields as empty strings. "
                "Do not expose hidden chain-of-thought; provide concise operational reasoning summaries and evidence-backed recommendations."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "user_prompt": prompt,
                    "installed_agents": [_agent_summary(agent) for agent in installed_agents],
                    "marketplace_templates": [_template_summary(template) for template in templates],
                }
            ),
        },
    ]
    result = await chat_completion(
        messages=messages,
        caller="workflow.auto_build",
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(result.get("content") or "{}")


def _coerce_input_bindings(bindings: dict | None) -> dict:
    return {key: bool((bindings or {}).get(key, DEFAULT_INPUT_BINDINGS[key])) for key in DEFAULT_INPUT_BINDINGS}


async def _install_template_for_user(template: dict, user_id: str | None) -> dict:
    db = get_db()
    existing_query = {"template_id": template["template_id"], "status": "active"}
    if user_id:
        existing_query["owner_user_id"] = user_id
    existing = await db.agents.find_one(existing_query, {"_id": 0})
    if existing:
        return existing
    agent_data = {
        "name": template["name"],
        "framework": template["framework"],
        "description": template.get("description", ""),
        "system_prompt": template.get("default_system_prompt", ""),
        "model_name": template.get("default_model_name", "gpt-4o"),
        "tools": template.get("suggested_tools", []),
        "hitl_enabled": template.get("hitl_enabled", False),
        "tags": template.get("tags", []),
        "a2a_enabled": template.get("a2a_enabled", True),
        "a2a_mode": "local",
        "remote_agent_card_url": "",
        "template_id": template["template_id"],
        "owner_user_id": user_id,
    }
    agent_id = await agent_repo.create(agent_data)
    return {"agent_id": agent_id, **agent_data, "status": "active"}


async def _create_custom_agent_for_user(suggestion: dict, user_id: str | None) -> dict:
    agent_data = {
        "name": suggestion.get("name") or "Custom Orchestrator Agent",
        "framework": suggestion.get("framework") or "langgraph",
        "description": suggestion.get("description") or suggestion.get("rationale") or "",
        "system_prompt": suggestion.get("system_prompt") or suggestion.get("rationale") or "Custom AIger orchestrator agent.",
        "model_name": suggestion.get("model_name") or "gpt-4o",
        "tools": suggestion.get("tools") or [],
        "hitl_enabled": bool(suggestion.get("hitl_enabled")),
        "tags": suggestion.get("tags") or [],
        "a2a_enabled": True,
        "a2a_mode": "local",
        "remote_agent_card_url": "",
        "owner_user_id": user_id,
        "generated_by": "workflow_orchestrator",
    }
    agent_id = await agent_repo.create(agent_data)
    return {"agent_id": agent_id, **agent_data, "status": "active"}


def _build_canvas_nodes(selected_agents: list[dict], step_map: dict[str, dict], workflow_id: str) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    for index, agent in enumerate(selected_agents):
        node_id = f"auto_{workflow_id}_{index + 1}"
        step = step_map.get(agent["agent_id"], {})
        nodes.append(
            {
                "id": node_id,
                "type": "agent",
                "position": {"x": 80 + index * 320, "y": 160 + (index % 2) * 28},
                "data": {
                    "agent_id": agent["agent_id"],
                    "name": agent["name"],
                    "framework": agent.get("framework", "langgraph"),
                    "system_prompt": agent.get("system_prompt", ""),
                    "model_name": agent.get("model_name", "gpt-4o"),
                    "tools": agent.get("tools", []),
                    "hitl_enabled": agent.get("hitl_enabled", False),
                    "a2a_enabled": agent.get("a2a_enabled", True),
                    "a2a_mode": agent.get("a2a_mode", "local"),
                    "remote_agent_card_url": agent.get("remote_agent_card_url", ""),
                    "tags": agent.get("tags", []),
                    "input_bindings": _coerce_input_bindings(step.get("input_bindings")),
                    "plan_label": step.get("label", agent["name"]),
                    "plan_why": step.get("why", ""),
                },
            }
        )
        if index:
            edges.append(
                {
                    "id": f"auto_edge_{index}",
                    "source": nodes[index - 1]["id"],
                    "target": node_id,
                    "animated": True,
                }
            )
    return nodes, edges


async def _resolve_auto_plan(
    *,
    prompt: str,
    installed_agents: list[dict],
    templates: list[dict],
    auto_install_missing: bool,
    user_id: str | None,
) -> dict:
    logger.info("api.workflow.auto_build.plan_start", auto_install_missing=auto_install_missing, prompt_excerpt=prompt[:180])
    template_by_id = {template["template_id"]: template for template in templates}
    installed_by_id = {agent["agent_id"]: agent for agent in installed_agents}
    installed_by_template = {
        agent.get("template_id"): agent
        for agent in installed_agents
        if agent.get("template_id")
    }

    try:
        plan = await _llm_auto_plan(prompt, installed_agents, templates)
    except Exception as exc:
        logger.warning("api.workflow.auto_build.llm_failed", error=str(exc))
        plan = {
            "workflow_name": "Auto-built workflow",
            "workflow_description": prompt[:240],
            "goal_type": _infer_goal_type(prompt),
            "reasoning_summary": "Built from marketplace and installed-agent fallback matching.",
            "executive_summary": "The planner matched the prompt against installed agents first, then fell back to marketplace inventory where coverage was missing.",
            "architecture_summary": "",
            "orchestrator_prompt": "",
            "recommended_steps": [
                {
                    "label": template_by_id[template_id]["name"],
                    "why": template_by_id[template_id].get("description", ""),
                    "selection_type": "template",
                    "agent_id": "",
                    "template_id": template_id,
                    "input_bindings": dict(DEFAULT_INPUT_BINDINGS),
                }
                for template_id in _fallback_step_templates(prompt, templates)
                if template_id in template_by_id
            ],
            "workflow_input_hints": {
                "needs_text": True,
                "needs_files": True,
                "needs_repo_import": any(term in _normalized(prompt) for term in ["repo", "repository", "codebase", "java", "python", "spring", "streamlit", "react", "next"]),
                "needs_kb": True,
            },
            "hitl_checkpoints": [],
            "agent_creation_suggestions": [],
        }

    selected_agents: list[dict] = []
    missing_templates: list[dict] = []
    installed_now: list[dict] = []
    step_map: dict[str, dict] = {}

    for step in (plan.get("recommended_steps") or [])[:5]:
        agent_id = (step.get("agent_id") or "").strip()
        template_id = (step.get("template_id") or "").strip()
        agent = installed_by_id.get(agent_id)
        if not agent and template_id:
            agent = installed_by_template.get(template_id)
        if agent:
            if agent["agent_id"] not in step_map:
                step_map[agent["agent_id"]] = step
                selected_agents.append(agent)
            continue

        template = template_by_id.get(template_id)
        if not template:
            continue
        if auto_install_missing:
            created = await _install_template_for_user(template, user_id)
            installed_by_id[created["agent_id"]] = created
            installed_by_template[template["template_id"]] = created
            installed_now.append({"template_id": template["template_id"], "agent_id": created["agent_id"], "name": created["name"]})
            step_map[created["agent_id"]] = step
            selected_agents.append(created)
        else:
            if all(item["template_id"] != template_id for item in missing_templates):
                missing_templates.append(
                    {
                        "template_id": template["template_id"],
                        "name": template["name"],
                        "framework": template.get("framework", "langgraph"),
                        "description": template.get("description", ""),
                        "tags": [tag for tag in template.get("tags", []) if tag not in FRAMEWORK_TAGS],
                    }
                )

    if len(selected_agents) < 2 and not auto_install_missing:
        for template_id in _fallback_step_templates(prompt, templates):
            agent = installed_by_template.get(template_id)
            template = template_by_id.get(template_id)
            if agent and all(existing["agent_id"] != agent["agent_id"] for existing in selected_agents):
                step_map[agent["agent_id"]] = {"label": agent["name"], "why": agent.get("description", ""), "input_bindings": dict(DEFAULT_INPUT_BINDINGS)}
                selected_agents.append(agent)
            elif template and all(item["template_id"] != template_id for item in missing_templates):
                missing_templates.append(
                    {
                        "template_id": template["template_id"],
                        "name": template["name"],
                        "framework": template.get("framework", "langgraph"),
                        "description": template.get("description", ""),
                        "tags": [tag for tag in template.get("tags", []) if tag not in FRAMEWORK_TAGS],
                    }
                )
            if len(selected_agents) + len(missing_templates) >= 2:
                break

    if auto_install_missing and len(selected_agents) < 2:
        raise HTTPException(status_code=422, detail="The orchestrator could not assemble at least two valid agents for this workflow prompt.")

    goal_type = plan.get("goal_type") or _infer_goal_type(prompt)
    creation_suggestions = plan.get("agent_creation_suggestions") or _build_creation_suggestions(prompt, goal_type, missing_templates, selected_agents)
    auto_created_agents: list[dict] = []
    if creation_suggestions and not missing_templates:
        for suggestion in creation_suggestions[: max(0, 4 - len(selected_agents))]:
            created = await _create_custom_agent_for_user(suggestion, user_id)
            auto_created_agents.append({"agent_id": created["agent_id"], "name": created["name"], "framework": created.get("framework", "langgraph")})
            step_map[created["agent_id"]] = {
                "label": suggestion.get("name") or created["name"],
                "why": suggestion.get("rationale") or suggestion.get("description") or "Custom generated for uncovered use-case capability.",
                "input_bindings": dict(DEFAULT_INPUT_BINDINGS),
            }
            selected_agents.append(created)
        creation_suggestions = []
    hitl_checkpoints = plan.get("hitl_checkpoints") or _build_hitl_checkpoints(plan, missing_templates, creation_suggestions)
    architecture_summary = plan.get("architecture_summary") or _build_architecture_summary(prompt, selected_agents, creation_suggestions)
    market_signal = await _run_market_research(prompt)
    citations = _build_plan_citations(
        selected_agents,
        missing_templates,
        creation_suggestions,
        market_citations=market_signal.get("citations") or [],
    )
    logger.info(
        "api.workflow.auto_build.plan_resolved",
        selected_agents=len(selected_agents),
        missing_templates=len(missing_templates),
        creation_suggestions=len(creation_suggestions),
        hitl_checkpoints=len(hitl_checkpoints),
        market_citations=len(market_signal.get("citations") or []),
    )

    workflow_id = str(uuid.uuid4())
    nodes, edges = _build_canvas_nodes(selected_agents, step_map, workflow_id)
    enterprise_report = _ensure_enterprise_report(
        prompt,
        plan,
        selected_agents,
        missing_templates,
        creation_suggestions,
        market_signal,
        citations,
    )
    orchestrator_events = [
        {"tone": "accent", "label": "Reasoning", "text": "Understood the use case and classified the workflow goal."},
        {"tone": "info", "label": "Extracting", "text": f"Compared {len(installed_agents)} installed agent(s) with {len(templates)} marketplace template(s)."},
        {"tone": "info", "label": "Planning agents", "text": f"Selected {len(selected_agents)} installed or newly installed agent(s)."},
        {"tone": "warn" if missing_templates else "ok", "label": "Checking marketplace", "text": f"Exact-match marketplace installs needed: {len(missing_templates)}."},
        {"tone": "accent" if market_signal.get("live") else "warn", "label": "Researching market", "text": market_signal.get("evidence_note", "")},
        {"tone": "ok", "label": "Designing workflow", "text": f"Prepared {len(hitl_checkpoints)} human approval checkpoint(s)."},
    ]
    return {
        "workflow_id": workflow_id,
        "workflow_name": plan.get("workflow_name") or "Auto-built workflow",
        "workflow_description": plan.get("workflow_description") or prompt[:240],
        "goal_type": goal_type,
        "reasoning_summary": plan.get("reasoning_summary") or "",
        "executive_summary": plan.get("executive_summary") or plan.get("reasoning_summary") or "",
        "architecture_summary": architecture_summary,
        "orchestrator_prompt": plan.get("orchestrator_prompt") or (
            "Infer the user's true intent, gather the most relevant KB, repository, and tool evidence, "
            "recommend the best agent workflow with explicit model/tool choices, pause for installation or creation approvals, "
            "and produce a grounded architecture summary plus execution-ready prompts."
        ),
        "nodes": nodes,
        "edges": edges,
        "selected_agent_ids": [agent["agent_id"] for agent in selected_agents],
        "missing_templates": missing_templates,
        "installed_now": installed_now,
        "auto_created_agents": auto_created_agents,
        "workflow_input_hints": plan.get("workflow_input_hints") or {},
        "hitl_checkpoints": hitl_checkpoints,
        "clarifying_questions": (plan.get("clarifying_questions") or [])[:5],
        "enterprise_report": enterprise_report,
        "agent_creation_suggestions": creation_suggestions,
        "citations": citations,
        "orchestrator_events": orchestrator_events,
        "market_signal": market_signal,
        "market_research": market_signal.get("findings") or [],
        "ready": len(selected_agents) >= 2 and not missing_templates,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_workflow(request: Request, body: CreateWorkflowRequest):
    db = get_db()
    workflow_id = str(uuid.uuid4())
    doc = {
        "workflow_id": workflow_id,
        **body.model_dump(),
        "owner_user_id": get_optional_user_id(request),
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    await db.workflow_definitions.insert_one(doc)
    logger.info("api.workflow.created", workflow_id=workflow_id, name=body.name)
    return {"workflow_id": workflow_id, "name": body.name}


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, request: Request, body: CreateWorkflowRequest):
    db = get_db()
    existing = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0, "workflow_id": 1, "owner_user_id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    role = get_optional_role(request)
    user_id = get_optional_user_id(request)
    if role != "admin" and existing.get("owner_user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the workflow owner or an admin can edit this workflow")
    await db.workflow_definitions.update_one(
        {"workflow_id": workflow_id},
        {
            "$set": {
                **body.model_dump(),
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }
        },
    )
    logger.info("api.workflow.updated", workflow_id=workflow_id, name=body.name)
    return {"workflow_id": workflow_id, "name": body.name, "updated": True}


@router.post("/auto-build")
async def auto_build_workflow(request: Request, body: AutoBuildWorkflowRequest):
    db = get_db()
    user_id = get_optional_user_id(request)
    agent_query = {"status": "active"}
    if user_id:
        agent_query["owner_user_id"] = user_id
    installed_agents = await db.agents.find(agent_query, {"_id": 0}).to_list(500)
    templates = await db.marketplace_templates.find({}, {"_id": 0}).to_list(500)
    if not templates:
        raise HTTPException(status_code=503, detail="Marketplace templates are not available yet")

    plan = await _resolve_auto_plan(
        prompt=body.prompt.strip(),
        installed_agents=installed_agents,
        templates=templates,
        auto_install_missing=body.auto_install_missing,
        user_id=user_id,
    )
    logger.info(
        "api.workflow.auto_build.complete",
        ready=plan["ready"],
        missing=len(plan["missing_templates"]),
        selected=len(plan["selected_agent_ids"]),
        installed_now=len(plan["installed_now"]),
    )
    return plan


@router.post("/auto-build/stream")
async def stream_auto_build_workflow(request: Request, body: AutoBuildWorkflowRequest):
    async def event_generator():
        db = get_db()
        user_id = get_optional_user_id(request)
        prompt = body.prompt.strip()
        yield _sse_event("status_update", _orchestrator_event("Orchestrator started", "Opened a streamed planning session for this workflow.", "running", "accent"))

        clarifying_questions = await _llm_clarifying_questions(prompt)
        if clarifying_questions:
            payload = {
                "type": "requires_input",
                "channel": "workflow_orchestrator",
                "stage": "Clarify requirements",
                "label": "Clarify requirements",
                "detail": "The request is still broad, so workflow assembly is paused until these answers are provided.",
                "tone": "warn",
                "questions": clarifying_questions,
                "partial_plan": {
                    "workflow_id": str(uuid.uuid4()),
                    "workflow_name": "Clarification needed",
                    "workflow_description": prompt,
                    "goal_type": _infer_goal_type(prompt),
                    "ready": False,
                    "clarifying_questions": clarifying_questions,
                    "nodes": [],
                    "edges": [],
                    "selected_agent_ids": [],
                    "missing_templates": [],
                    "installed_now": [],
                    "workflow_input_hints": {"needs_text": True, "needs_files": True, "needs_repo_import": False, "needs_kb": True},
                    "hitl_checkpoints": [{
                        "stage": "clarification",
                        "label": "Answer planner questions",
                        "detail": "The orchestrator will continue after these inputs are added.",
                    }],
                    "enterprise_report": {},
                    "agent_creation_suggestions": [],
                    "citations": [],
                    "orchestrator_events": [_orchestrator_event("Clarify requirements", "Paused before agent selection to avoid guessing.", "paused", "warn")],
                    "market_signal": _default_market_signal(prompt),
                    "market_research": [],
                },
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }
            yield _sse_event("requires_input", payload)
            yield _sse_event("end", {"status": "waiting_for_input"})
            return

        yield _sse_event("status_update", _orchestrator_event("Load inventory", "Loading installed agents and marketplace templates.", "running", "info"))
        agent_query = {"status": "active"}
        if user_id:
            agent_query["owner_user_id"] = user_id
        installed_agents = await db.agents.find(agent_query, {"_id": 0}).to_list(500)
        templates = await db.marketplace_templates.find({}, {"_id": 0}).to_list(500)
        yield _sse_event("status_update", _orchestrator_event("Compare inventory", f"Found {len(installed_agents)} installed agent(s) and {len(templates)} marketplace template(s).", "completed", "info"))
        if not templates:
            yield _sse_event("error", {"type": "error", "channel": "workflow_orchestrator", "detail": "Marketplace templates are not available yet"})
            return

        yield _sse_event("status_update", _orchestrator_event("Plan workflow", "Selecting agents, checking prompt fit, HITL gates, and missing capabilities.", "running", "accent"))
        try:
            plan = await _resolve_auto_plan(
                prompt=prompt,
                installed_agents=installed_agents,
                templates=templates,
                auto_install_missing=body.auto_install_missing,
                user_id=user_id,
            )
        except Exception as exc:
            logger.error("api.workflow.auto_build.stream_failed", error=str(exc), exc_info=True)
            yield _sse_event("error", {"type": "error", "channel": "workflow_orchestrator", "detail": str(exc)})
            return

        for event in plan.get("orchestrator_events") or []:
            yield _sse_event("status_update", _orchestrator_event(event.get("label") or "Planner event", event.get("text") or event.get("detail") or "Planner event received.", "completed", event.get("tone") or "info"))
        yield _sse_event("final_plan", {"type": "final_plan", "channel": "workflow_orchestrator", "plan": plan, "timestamp": datetime.datetime.utcnow().isoformat()})
        yield _sse_event("end", {"status": "completed"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("")
async def list_workflows(request: Request, project_id: str | None = None):
    db = get_db()
    query = await _workflow_query(db, request, {"project_id": project_id} if project_id else {})
    workflows = await db.workflow_definitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"workflows": workflows, "count": len(workflows)}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request):
    db = get_db()
    query = await _workflow_query(db, request, {"workflow_id": workflow_id})
    wf = await db.workflow_definitions.find_one(query, {"_id": 0})
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    return wf


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, request: Request):
    db = get_db()
    wf = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0, "workflow_id": 1, "owner_user_id": 1})
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    role = get_optional_role(request)
    user_id = get_optional_user_id(request)
    if role != "admin" and wf.get("owner_user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the workflow owner or an admin can delete this workflow")
    await db.workflow_definitions.delete_one({"workflow_id": workflow_id})
    return {"success": True, "workflow_id": workflow_id}


@router.post("/{workflow_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_workflow(workflow_id: str, request: Request, body: RunWorkflowRequest):
    db = get_db()
    query = await _workflow_query(db, request, {"workflow_id": workflow_id})
    user_id = get_optional_user_id(request)
    wf = await db.workflow_definitions.find_one(query)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    stored_agents = await db.agents.find({"agent_id": {"$in": wf.get("agents", [])}, "status": "active"}, {"_id": 0}).to_list(500)
    framework_health = get_framework_runtime_health()
    blocking_frameworks = []
    required_tools = set()
    for agent in stored_agents:
        framework = (agent.get("framework") or "langgraph").lower()
        state = framework_health.get(framework, {})
        if state.get("status") == "unhealthy" and not state.get("fallback_available"):
            blocking_frameworks.append({"agent_id": agent.get("agent_id"), "name": agent.get("name"), "framework": framework, "error": state.get("error")})
        required_tools.update(agent.get("tools", []) or [])
    blocking_tools = []
    warning_tools = []
    for tool_name in sorted(required_tools):
        if tool_name not in TOOL_REGISTRY:
            blocking_tools.append({"name": tool_name, "error": "Tool not registered"})
            continue
        health = await get_tool_health(tool_name)
        if health.get("status") == "unhealthy" and health.get("blocking", False):
            blocking_tools.append(health)
        elif health.get("status") in {"unhealthy", "degraded"}:
            warning_tools.append(health)
    if blocking_frameworks or blocking_tools:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Workflow preflight failed",
                "framework_issues": blocking_frameworks,
                "tool_issues": blocking_tools,
                "warnings": warning_tools,
            },
        )
    try:
        run_id = await build_and_run_workflow(workflow_id=workflow_id, input_data=body.input_data, owner_user_id=user_id)
        return {"run_id": run_id, "status": "running", "warnings": warning_tools}
    except Exception as exc:
        logger.error("api.workflow.run_failed", workflow_id=workflow_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=public_error("Failed to start workflow", "WORKFLOW_START_FAILED", request_id_from(request)))


@router.get("/runs/all")
async def list_all_runs(request: Request, limit: int = 50):
    db = get_db()
    query = await _run_query(db, request)
    runs = await db.workflow_runs.find(query, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
    return {"runs": runs, "count": len(runs)}


@router.get("/runs/{run_id}")
async def get_run_status(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    # Attach A2A messages live
    run["a2a_messages"] = await get_a2a_messages(workflow_run_id=run_id)
    run = await _attach_run_timing(db, run)
    return run


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str, request: Request):
    db = get_db()
    run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "run_id": 1, "owner_user_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    role = get_optional_role(request)
    user_id = get_optional_user_id(request)
    if role != "admin" and run.get("owner_user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the workflow run owner or an admin can delete this run")
    await db.workflow_runs.delete_one({"run_id": run_id})
    await db.agent_traces.delete_many({"workflow_run_id": run_id})
    await db.a2a_messages.delete_many({"workflow_run_id": run_id})
    await db.hitl_records.delete_many({"workflow_run_id": run_id})
    return {"success": True, "run_id": run_id}


@router.get("/runs/{run_id}/report")
async def get_run_report(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    if run["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Run status is '{run['status']}' — report not ready")
    return {
        "run_id": run_id,
        "status": run["status"],
        "report": run.get("final_output", {}),
        "outputs_by_agent": run.get("outputs_by_agent", {}),
        "markdown": run.get("report_markdown", ""),
        "structured": run.get("report_structured", {}),
        "pii_findings": run.get("pii_findings", []),
        "citations": run.get("citations", []),
        "failure_reason": run.get("failure_reason"),
    }


@router.get("/runs/{run_id}/report-materialized")
async def get_run_report_materialized(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    if run["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail=f"Run status is '{run['status']}' - report not ready")
    if _report_needs_rematerialization(run):
        logger.info("api.workflow.report.materializing", run_id=run_id, status=run["status"])
        report = await build_run_report(run)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "report_markdown": report["markdown"],
                    "report_structured": report["structured"],
                    "pii_findings": report["pii_findings"],
                    "citations": report["citations"],
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            },
        )
        run = await db.workflow_runs.find_one(query, {"_id": 0})
    return {
        "run_id": run_id,
        "status": run["status"],
        "report": run.get("final_output", {}),
        "outputs_by_agent": run.get("outputs_by_agent", {}),
        "markdown": run.get("report_markdown", ""),
        "structured": run.get("report_structured", {}),
        "pii_findings": run.get("pii_findings", []),
        "citations": run.get("citations", []),
        "failure_reason": run.get("failure_reason"),
    }


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    try:
        return await resume_workflow_run(run_id)
    except Exception as exc:
        logger.error("api.workflow.resume_failed", run_id=run_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=public_error("Failed to resume workflow", "WORKFLOW_RESUME_FAILED", request_id_from(request)))


@router.post("/runs/{run_id}/pause")
async def pause_run(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    try:
        return await request_workflow_pause(run_id)
    except Exception as exc:
        logger.error("api.workflow.pause_failed", run_id=run_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=public_error("Failed to request workflow pause", "WORKFLOW_PAUSE_FAILED", request_id_from(request)))


@router.post("/runs/{run_id}/stop")
async def stop_run(run_id: str, request: Request):
    db = get_db()
    query = await _run_query(db, request, {"run_id": run_id})
    run = await db.workflow_runs.find_one(query, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    try:
        return await request_workflow_stop(run_id)
    except Exception as exc:
        logger.error("api.workflow.stop_failed", run_id=run_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=public_error("Failed to request workflow stop", "WORKFLOW_STOP_FAILED", request_id_from(request)))



@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request):
    """
    Server-Sent Events stream of run state.

    Emits a JSON `data:` event whenever the run document or its A2A message
    count changes. Closes the connection once the run reaches a terminal
    state (`completed` or `failed`). Browser EventSource consumers receive
    instant push updates with no polling.
    """
    db = get_db()

    async def event_generator():
        last_run_payload: str | None = None
        last_a2a_ids: list[str] = []
        sent_snapshot = False
        idle_loops = 0
        max_idle_loops = 600  # ~5 min @ 500ms — guards against orphaned streams

        while True:
            query = await _run_query(db, request, {"run_id": run_id})
            run = await db.workflow_runs.find_one(query, {"_id": 0})
            if not run:
                yield f"event: error\ndata: {json.dumps({'error': 'run not found'})}\n\n"
                return

            a2a_messages = await get_a2a_messages(workflow_run_id=run_id)
            run_payload = json.dumps(run, default=str)
            current_a2a_ids = [msg.get("message_id", "") for msg in a2a_messages]
            emitted = False

            if not sent_snapshot:
                snapshot = await _attach_run_timing(db, {**run, "a2a_messages": a2a_messages})
                yield f"event: run_snapshot\ndata: {json.dumps(snapshot, default=str)}\n\n"
                yield _sse_event("status_update", {
                    "type": "status_update",
                    "channel": "workflow_run",
                    "stage": "Run snapshot",
                    "label": f"Run {run.get('status', 'unknown')}",
                    "detail": f"Workflow run snapshot loaded with {len(a2a_messages)} A2A message(s).",
                    "status": run.get("status"),
                    "tone": "live" if run.get("status") in {"running", "resuming"} else "info",
                    "payload": {"run_id": run_id, "current_step": run.get("current_step")},
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                })
                last_run_payload = run_payload
                last_a2a_ids = current_a2a_ids
                sent_snapshot = True
                idle_loops = 0
                emitted = True
            else:
                if run_payload != last_run_payload:
                    payload = await _attach_run_timing(db, dict(run))
                    yield f"event: run_update\ndata: {json.dumps(payload, default=str)}\n\n"
                    yield _sse_event("status_update", {
                        "type": "status_update",
                        "channel": "workflow_run",
                        "stage": "Run update",
                        "label": f"Run {run.get('status', 'unknown')}",
                        "detail": run.get("failure_reason") or f"Workflow moved to step {run.get('current_step', 'n/a')}.",
                        "status": run.get("status"),
                        "tone": "bad" if run.get("status") == "failed" else "ok" if run.get("status") == "completed" else "live",
                        "payload": {"run_id": run_id, "current_step": run.get("current_step")},
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                    })
                    last_run_payload = run_payload
                    emitted = True

                if len(current_a2a_ids) < len(last_a2a_ids):
                    yield f"event: a2a_reset\ndata: {json.dumps(a2a_messages, default=str)}\n\n"
                    last_a2a_ids = current_a2a_ids
                    emitted = True
                elif len(current_a2a_ids) > len(last_a2a_ids):
                    known = set(last_a2a_ids)
                    new_messages = [msg for msg in a2a_messages if msg.get("message_id", "") not in known]
                    for message in new_messages:
                        yield f"event: a2a_message\ndata: {json.dumps(message, default=str)}\n\n"
                        yield _sse_event("status_update", {
                            "type": "status_update",
                            "channel": "workflow_run",
                            "stage": "A2A message",
                            "label": f"{message.get('from_agent', 'Agent')} → {message.get('to_agent', 'Agent')}",
                            "detail": message.get("message_type") or "A2A handoff",
                            "status": "completed",
                            "tone": "tool",
                            "payload": message.get("payload"),
                            "timestamp": message.get("timestamp") or datetime.datetime.utcnow().isoformat(),
                        })
                    last_a2a_ids = current_a2a_ids
                    emitted = emitted or bool(new_messages)

                if emitted:
                    idle_loops = 0
                else:
                    idle_loops += 1

            # Close stream when terminal
            if run.get("status") in ("completed", "failed", "stopped"):
                yield f"event: end\ndata: {json.dumps({'status': run['status']})}\n\n"
                return

            if idle_loops > max_idle_loops:
                yield "event: timeout\ndata: {}\n\n"
                return

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
