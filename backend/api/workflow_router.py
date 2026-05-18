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
from core.report_builder import build_run_report
from db.mongo_client import get_db
from core.request_context import get_optional_role, get_optional_user_id
from core.workflow_engine import build_and_run_workflow, resume_workflow_run
from a2a.agent_communication import get_a2a_messages
from db.repositories.agent_repo import AgentRepository

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


async def _llm_auto_plan(prompt: str, installed_agents: list[dict], templates: list[dict]) -> dict:
    messages = [
        {
            "role": "system",
            "content": (
                "You are the AIger's Universe workflow orchestration planner. "
                "Select the smallest high-signal multi-agent workflow for the user's prompt. "
                "Prefer already installed agents when they fit. Use marketplace templates only when an installed agent is missing. "
                "Return strict JSON with this schema: "
                "{\"workflow_name\": str, \"workflow_description\": str, \"goal_type\": str, "
                "\"reasoning_summary\": str, \"recommended_steps\": ["
                "{\"label\": str, \"why\": str, \"selection_type\": \"installed_agent\"|\"template\", "
                "\"agent_id\": str, \"template_id\": str, "
                "\"input_bindings\": {\"include_text_input\": bool, \"include_uploaded_files\": bool, "
                "\"include_github_repo\": bool, \"include_knowledge_base\": bool, \"include_upstream_outputs\": bool}}], "
                "\"workflow_input_hints\": {\"needs_text\": bool, \"needs_files\": bool, \"needs_repo_import\": bool, \"needs_kb\": bool}}. "
                "Use 2 to 5 steps. Do not invent IDs. Leave irrelevant id fields as empty strings."
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
            "goal_type": "general",
            "reasoning_summary": "Built from marketplace and installed-agent fallback matching.",
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

    workflow_id = str(uuid.uuid4())
    nodes, edges = _build_canvas_nodes(selected_agents, step_map, workflow_id)
    return {
        "workflow_id": workflow_id,
        "workflow_name": plan.get("workflow_name") or "Auto-built workflow",
        "workflow_description": plan.get("workflow_description") or prompt[:240],
        "goal_type": plan.get("goal_type") or "general",
        "reasoning_summary": plan.get("reasoning_summary") or "",
        "nodes": nodes,
        "edges": edges,
        "selected_agent_ids": [agent["agent_id"] for agent in selected_agents],
        "missing_templates": missing_templates,
        "installed_now": installed_now,
        "workflow_input_hints": plan.get("workflow_input_hints") or {},
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


@router.post("/{workflow_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_workflow(workflow_id: str, request: Request, body: RunWorkflowRequest):
    db = get_db()
    query = await _workflow_query(db, request, {"workflow_id": workflow_id})
    user_id = get_optional_user_id(request)
    wf = await db.workflow_definitions.find_one(query)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    try:
        run_id = await build_and_run_workflow(workflow_id=workflow_id, input_data=body.input_data, owner_user_id=user_id)
        return {"run_id": run_id, "status": "running"}
    except Exception as exc:
        logger.error("api.workflow.run_failed", workflow_id=workflow_id, error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start workflow: {exc}")


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
    return run


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
    if not (run.get("report_markdown") or "").strip():
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
        raise HTTPException(status_code=500, detail=f"Failed to resume workflow: {exc}")



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
        last_payload: str | None = None
        idle_loops = 0
        max_idle_loops = 600  # ~5 min @ 500ms — guards against orphaned streams

        while True:
            query = await _run_query(db, request, {"run_id": run_id})
            run = await db.workflow_runs.find_one(query, {"_id": 0})
            if not run:
                yield f"event: error\ndata: {json.dumps({'error': 'run not found'})}\n\n"
                return

            run["a2a_messages"] = await get_a2a_messages(workflow_run_id=run_id)
            payload = json.dumps(run, default=str)

            if payload != last_payload:
                yield f"data: {payload}\n\n"
                last_payload = payload
                idle_loops = 0
            else:
                idle_loops += 1

            # Close stream when terminal
            if run.get("status") in ("completed", "failed"):
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
