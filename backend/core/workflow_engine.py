"""
Workflow engine with Mongo-backed progress persistence.
Runs can be resumed after logout or backend restart from the last completed step.
"""
import asyncio
import datetime
import uuid
import structlog

from typing import TypedDict

from a2a.agent_communication import get_a2a_messages, send_a2a_message
from config import settings
from core.agent_registry import invoke_agent_by_id
from core.report_builder import build_run_report
from db.mongo_client import get_db
from db.repositories.agent_repo import AgentRepository
from hitl import resume_signals
from observability.tracer import record_trace

logger = structlog.get_logger(__name__)
agent_repo = AgentRepository()
_RUN_TASKS: dict[str, asyncio.Task] = {}


class WorkflowState(TypedDict, total=False):
    workflow_run_id: str
    owner_user_id: str | None
    input_data: dict
    agents: list[dict]
    current_step: int
    outputs: dict
    final_output: dict
    status: str
    failure_reason: str


DEFAULT_INPUT_BINDINGS = {
    "include_text_input": True,
    "include_uploaded_files": True,
    "include_github_repo": True,
    "include_knowledge_base": True,
    "include_upstream_outputs": True,
}


def _utcnow_iso() -> str:
    return datetime.datetime.utcnow().isoformat()


def _track_run_task(run_id: str, task: asyncio.Task) -> None:
    existing = _RUN_TASKS.get(run_id)
    if existing and not existing.done():
        existing.cancel()
    _RUN_TASKS[run_id] = task

    def _cleanup(_task: asyncio.Task) -> None:
        if _RUN_TASKS.get(run_id) is _task:
            _RUN_TASKS.pop(run_id, None)
    task.add_done_callback(_cleanup)


def _cancel_run_task(run_id: str) -> bool:
    task = _RUN_TASKS.get(run_id)
    if not task or task.done():
        return False
    task.cancel()
    return True


def _parse_iso(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _hydrate_workflow_inputs(input_data: dict) -> dict:
    workflow_inputs = dict((input_data or {}).get("workflow_inputs") or {})
    upload_ids = workflow_inputs.get("upload_document_ids") or []
    repo_document_id = workflow_inputs.get("repo_document_id")
    if not upload_ids and not repo_document_id:
        return input_data

    db = get_db()
    all_ids = list(dict.fromkeys([*upload_ids, *([repo_document_id] if repo_document_id else [])]))
    docs = await db.documents.find(
        {"document_id": {"$in": all_ids}},
        {"_id": 0, "document_id": 1, "filename": 1, "category": 1, "text": 1, "text_length": 1, "source_meta": 1, "scope": 1},
    ).to_list(len(all_ids) or 1)
    docs_by_id = {doc["document_id"]: doc for doc in docs}

    workflow_inputs["uploaded_files"] = [
        {
            "document_id": doc_id,
            "filename": docs_by_id[doc_id].get("filename", ""),
            "category": docs_by_id[doc_id].get("category", ""),
            "scope": docs_by_id[doc_id].get("scope", "workflow_input"),
            "text_length": docs_by_id[doc_id].get("text_length", 0),
            "text_excerpt": (docs_by_id[doc_id].get("text", "") or "")[:6000],
        }
        for doc_id in upload_ids
        if doc_id in docs_by_id
    ]
    if repo_document_id and repo_document_id in docs_by_id:
        repo_doc = docs_by_id[repo_document_id]
        workflow_inputs["github_repo"] = {
            "document_id": repo_document_id,
            "filename": repo_doc.get("filename", ""),
            "repo_url": (repo_doc.get("source_meta") or {}).get("repo_url", workflow_inputs.get("repo_url", "")),
            "text_length": repo_doc.get("text_length", 0),
            "text_excerpt": (repo_doc.get("text", "") or "")[:10000],
        }

    return {**(input_data or {}), "workflow_inputs": workflow_inputs}


async def _read_run_control(run_id: str) -> dict:
    db = get_db()
    run = await db.workflow_runs.find_one(
        {"run_id": run_id},
        {"_id": 0, "status": 1, "control": 1, "current_step": 1, "completed_at": 1, "hitl_id": 1},
    )
    return run or {}


async def _apply_requested_control(run_id: str, next_step: int) -> str | None:
    db = get_db()
    run = await _read_run_control(run_id)
    control = run.get("control") or {}
    if control.get("stop_requested"):
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "status": "stopped",
                    "current_step": next_step,
                    "completed_at": _utcnow_iso(),
                    "updated_at": _utcnow_iso(),
                }
            },
        )
        return "stopped"
    if control.get("pause_requested"):
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "status": "paused",
                    "current_step": next_step,
                    "updated_at": _utcnow_iso(),
                }
            },
        )
        return "paused"
    return None


def _compose_agent_input(state: WorkflowState, agent_config: dict) -> dict:
    original_input = dict(state["input_data"] or {})
    bindings = {**DEFAULT_INPUT_BINDINGS, **(agent_config.get("input_bindings") or {})}
    workflow_inputs = dict(original_input.get("workflow_inputs") or {})

    if not bindings["include_text_input"]:
        workflow_inputs.pop("text", None)
        original_input.pop("user_prompt", None)
    if not bindings["include_uploaded_files"]:
        workflow_inputs.pop("uploaded_files", None)
        workflow_inputs.pop("upload_document_ids", None)
    if not bindings["include_github_repo"]:
        workflow_inputs.pop("github_repo", None)
        workflow_inputs.pop("repo_document_id", None)
        workflow_inputs.pop("repo_url", None)
    if not bindings["include_knowledge_base"]:
        original_input.pop("document_id", None)
        original_input.pop("filename", None)
        original_input["kb_mode"] = "disabled"

    original_input["workflow_inputs"] = workflow_inputs
    input_payload = {"original_input": original_input}
    if bindings["include_upstream_outputs"]:
        input_payload["previous_outputs"] = state.get("outputs", {})
    return input_payload


def _resolve_agent_configs(wf: dict, stored_agents: list[dict]) -> list[dict]:
    canvas_nodes = (wf.get("canvas") or {}).get("nodes") or []
    if not canvas_nodes:
        return stored_agents
    node_lookup = {node.get("data", {}).get("agent_id"): node for node in canvas_nodes if node.get("data", {}).get("agent_id")}
    sorted_nodes = sorted(canvas_nodes, key=lambda node: node.get("position", {}).get("x", 0))
    stored_lookup = {agent["agent_id"]: agent for agent in stored_agents}
    resolved = []
    for node in sorted_nodes:
        agent_id = node.get("data", {}).get("agent_id")
        if not agent_id or agent_id not in stored_lookup:
            continue
        overrides = node.get("data", {})
        base = dict(stored_lookup[agent_id])
        for key in ("name", "framework", "system_prompt", "model_name", "tools", "hitl_enabled", "input_bindings", "a2a_enabled", "a2a_mode", "remote_agent_card_url", "tags"):
            if key in overrides:
                base[key] = overrides[key]
        base["workflow_node_id"] = node.get("id")
        resolved.append(base)
    if resolved:
        return resolved
    return [dict(stored_lookup[agent["agent_id"]], workflow_node_id=node_lookup.get(agent["agent_id"], {}).get("id")) for agent in stored_agents]


async def _wait_for_hitl_resume(hitl_id: str, run_id: str) -> dict:
    db = get_db()
    event = resume_signals.get_or_create_event(hitl_id)
    timeout = settings.HITL_TIMEOUT_SECONDS
    started = datetime.datetime.utcnow()

    while True:
        if event.is_set():
            result = resume_signals.get_result(hitl_id) or {}
            resume_signals.clear(hitl_id)
            return result

        run = await _read_run_control(run_id)
        control = run.get("control") or {}
        if control.get("stop_requested") or run.get("status") == "stopped":
            return {"decision": "stop", "note": "Workflow stopped by user"}
        if run.get("status") == "failed":
            return {"decision": "reject", "note": run.get("failure_reason") or "Workflow failed while paused"}

        elapsed = (datetime.datetime.utcnow() - started).total_seconds()
        if elapsed >= timeout:
            record = await db.hitl_records.find_one({"hitl_id": hitl_id}, {"_id": 0})
            if record and record.get("status") in ("approved", "rejected"):
                return {
                    "decision": "approve" if record["status"] == "approved" else "reject",
                    "note": record.get("human_note", ""),
                }
            logger.warning("hitl.wait.timeout", hitl_id=hitl_id, run_id=run_id)
            return {"decision": "reject", "note": f"HITL timeout after {timeout}s"}

        await asyncio.sleep(1)


async def _execute_agent_step(state: WorkflowState, step_idx: int) -> dict:
    run_id = state["workflow_run_id"]
    agents = state["agents"]
    agent_config = agents[step_idx]
    agent_name = agent_config["name"]
    db = get_db()
    now = _utcnow_iso()

    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {"$set": {"current_step": step_idx, "current_agent": agent_name, "status": "running", "updated_at": now}},
    )

    upstream_messages = await get_a2a_messages(workflow_run_id=run_id) if step_idx > 0 else []
    input_data = _compose_agent_input(state, agent_config)

    result = await invoke_agent_by_id(
        agent_config=agent_config,
        input_data=input_data,
        workflow_run_id=run_id,
        step_number=step_idx,
        upstream_messages=upstream_messages,
    )

    await record_trace(
        workflow_run_id=run_id,
        owner_user_id=state.get("owner_user_id"),
        agent_id=agent_config["agent_id"],
        agent_name=agent_name,
        framework=agent_config.get("framework", "langgraph"),
        step_number=step_idx,
        input_summary=str(input_data)[:500],
        full_output=result.get("output", {}),
        tokens_used=result.get("tokens_used", 0),
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
        latency_ms=result.get("latency_ms", 0.0),
        tools_called=result.get("tools_called", []),
        status=result.get("status", "success"),
        error=result.get("error"),
    )

    outputs = dict(state.get("outputs", {}))
    agent_result_entry = {
        "agent_id": agent_config["agent_id"],
        "agent_name": agent_name,
        "step_number": step_idx,
        "status": result.get("status"),
        "output": result.get("output", {}),
        "tokens_used": result.get("tokens_used", 0),
        "latency_ms": result.get("latency_ms", 0.0),
        "tools_called": result.get("tools_called", []),
        "completed_at": _utcnow_iso(),
        "error": result.get("error"),
    }

    if result.get("status") == "failed":
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$push": {"agent_results": agent_result_entry},
                "$set": {
                    "status": "failed",
                    "failure_reason": result.get("error") or "Agent failure",
                    "updated_at": _utcnow_iso(),
                },
            },
        )
        return {"outputs": outputs, "status": "failed", "failure_reason": result.get("error", "")}

    outputs[agent_name] = result.get("output", {})
    next_agent_name = agents[step_idx + 1]["name"] if step_idx + 1 < len(agents) else "__end__"
    await send_a2a_message(
        from_agent=agent_name,
        to_agent=next_agent_name,
        message_type="result",
        payload=result.get("output", {}),
        workflow_run_id=run_id,
    )

    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {
            "$push": {"agent_results": agent_result_entry},
            "$set": {"outputs_by_agent": outputs, "updated_at": datetime.datetime.utcnow().isoformat()},
        },
    )

    run_doc = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1, "hitl_id": 1})
    if run_doc and run_doc.get("status") in ("paused", "resuming"):
        hitl_id = run_doc.get("hitl_id")
        if hitl_id:
            logger.info("workflow.paused.awaiting_hitl", run_id=run_id, hitl_id=hitl_id)
            decision = await _wait_for_hitl_resume(hitl_id, run_id)
            if decision.get("decision") == "stop":
                await db.workflow_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"status": "stopped", "failure_reason": None, "hitl_id": None, "completed_at": _utcnow_iso(), "updated_at": _utcnow_iso()}},
                )
                return {"outputs": outputs, "status": "stopped"}
            if decision.get("decision") == "reject":
                await db.workflow_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}", "updated_at": _utcnow_iso()}},
                )
                return {"outputs": outputs, "status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}"}

            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {"status": "running", "hitl_id": None, "updated_at": _utcnow_iso()}},
            )
            outputs[f"{agent_name}_hitl"] = {"approved": True, "note": decision.get("note", "")}
            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {"outputs_by_agent": outputs, "updated_at": _utcnow_iso()}},
            )

    return {"outputs": outputs, "current_step": step_idx + 1}


async def _finalize_run(run_id: str, state: WorkflowState) -> None:
    db = get_db()
    outputs = state.get("outputs", {})
    last_agent_name = state["agents"][-1]["name"]
    final_output = outputs.get(last_agent_name, outputs)
    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {
            "$set": {
                "status": "completed",
                "final_output": final_output,
                "outputs_by_agent": outputs,
                "completed_at": _utcnow_iso(),
                "updated_at": _utcnow_iso(),
            }
        },
    )
    run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0})
    if run:
        report = await build_run_report(run)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "report_markdown": report["markdown"],
                    "report_structured": report["structured"],
                    "pii_findings": report["pii_findings"],
                    "citations": report["citations"],
                    "updated_at": _utcnow_iso(),
                }
            },
        )


async def _run_workflow_steps(state: WorkflowState, start_step: int = 0) -> None:
    run_id = state["workflow_run_id"]
    db = get_db()
    try:
        for step_idx in range(start_step, len(state["agents"])):
            control_status = await _apply_requested_control(run_id, step_idx)
            if control_status == "paused":
                logger.info("workflow.run.paused_by_user", run_id=run_id, step=step_idx)
                return
            if control_status == "stopped":
                logger.info("workflow.run.stopped_by_user", run_id=run_id, step=step_idx)
                return

            result = await _execute_agent_step(state, step_idx)
            state["outputs"] = result.get("outputs", state.get("outputs", {}))
            state["current_step"] = result.get("current_step", step_idx)
            if result.get("status") == "failed":
                await db.workflow_runs.update_one(
                    {"run_id": run_id},
                    {
                        "$set": {
                            "status": "failed",
                            "failure_reason": result.get("failure_reason") or "Workflow failed",
                            "completed_at": _utcnow_iso(),
                            "updated_at": _utcnow_iso(),
                        }
                    },
                )
                return
            if result.get("status") == "stopped":
                await db.workflow_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"status": "stopped", "completed_at": _utcnow_iso(), "updated_at": _utcnow_iso()}},
                )
                return
            control_status = await _apply_requested_control(run_id, step_idx + 1)
            if control_status == "paused":
                logger.info("workflow.run.paused_by_user", run_id=run_id, step=step_idx + 1)
                return
            if control_status == "stopped":
                logger.info("workflow.run.stopped_by_user", run_id=run_id, step=step_idx + 1)
                return
        await _finalize_run(run_id, state)
        logger.info("workflow.run.complete", run_id=run_id)
    except asyncio.CancelledError:
        logger.info("workflow.run.cancelled", run_id=run_id)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "status": "stopped",
                    "completed_at": _utcnow_iso(),
                    "updated_at": _utcnow_iso(),
                    "failure_reason": None,
                }
            },
        )
        return
    except Exception as exc:
        logger.error("workflow.run.failed", run_id=run_id, error=str(exc), exc_info=True)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "status": "failed",
                    "failure_reason": str(exc),
                    "completed_at": _utcnow_iso(),
                    "updated_at": _utcnow_iso(),
                }
            },
        )


def _next_step_index(run: dict, agent_configs: list[dict]) -> int:
    agent_results = run.get("agent_results", []) or []
    latest_by_step: dict[int, dict] = {}
    for item in agent_results:
        step_number = item.get("step_number")
        if isinstance(step_number, int):
            latest_by_step[step_number] = item

    for idx, agent in enumerate(agent_configs):
        latest = latest_by_step.get(idx)
        if not latest:
            return idx
        if latest.get("status") != "success":
            return idx
        if agent["name"] not in (run.get("outputs_by_agent", {}) or {}):
            return idx
    return len(agent_configs)


async def build_and_run_workflow(workflow_id: str, input_data: dict, owner_user_id: str | None = None) -> str:
    db = get_db()
    wf = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0})
    if not wf:
        raise ValueError(f"Workflow '{workflow_id}' not found")

    stored_agent_configs: list[dict] = []
    for agent_id in wf["agents"]:
        cfg = await agent_repo.get_by_id(agent_id)
        if not cfg:
            raise ValueError(f"Agent '{agent_id}' referenced in workflow not found")
        stored_agent_configs.append(cfg)
    agent_configs = _resolve_agent_configs(wf, stored_agent_configs)
    if len(agent_configs) < 2:
        raise ValueError("Workflow must have at least 2 agents")

    hydrated_input_data = await _hydrate_workflow_inputs(input_data)
    workflow_inputs = hydrated_input_data.get("workflow_inputs") or {}
    upload_doc_ids = workflow_inputs.get("upload_document_ids") or []
    if len(upload_doc_ids) > settings.WORKFLOW_INPUT_MAX_FILES:
        raise ValueError(f"Workflow input file count exceeds limit ({settings.WORKFLOW_INPUT_MAX_FILES})")
    total_text_chars = len((workflow_inputs.get("text") or ""))
    total_file_bytes = 0
    for item in workflow_inputs.get("uploaded_files") or []:
        total_text_chars += len(item.get("text_excerpt") or "")
    github_repo = workflow_inputs.get("github_repo") or {}
    total_text_chars += len(github_repo.get("text_excerpt") or "")
    all_ids = [*upload_doc_ids, *([workflow_inputs.get("repo_document_id")] if workflow_inputs.get("repo_document_id") else [])]
    if all_ids:
        docs = await db.documents.find({"document_id": {"$in": all_ids}}, {"_id": 0, "file_size_bytes": 1}).to_list(len(all_ids))
        total_file_bytes = sum(int(doc.get("file_size_bytes", 0) or 0) for doc in docs)
    if total_file_bytes > settings.WORKFLOW_INPUT_MAX_TOTAL_BYTES:
        raise ValueError(f"Workflow input total file size exceeds limit ({settings.WORKFLOW_INPUT_MAX_TOTAL_BYTES} bytes)")
    if total_text_chars > settings.WORKFLOW_INPUT_MAX_TEXT_CHARS:
        raise ValueError(f"Workflow input text exceeds limit ({settings.WORKFLOW_INPUT_MAX_TEXT_CHARS} chars)")
    run_id = str(uuid.uuid4())
    if all_ids:
        await db.documents.update_many(
            {"document_id": {"$in": all_ids}},
            {
                "$set": {
                    "workflow_run_id": run_id,
                    "retention_expires_at": (datetime.datetime.utcnow() + datetime.timedelta(days=settings.WORKFLOW_INPUT_RETENTION_DAYS)).isoformat(),
                }
            },
        )
    started_at = datetime.datetime.utcnow().isoformat()
    await db.workflow_runs.insert_one(
        {
            "run_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": wf.get("name", ""),
            "project_id": wf.get("project_id"),
            "input_data": hydrated_input_data,
            "policy_ids": wf.get("policy_ids", []),
            "owner_user_id": owner_user_id or wf.get("owner_user_id"),
            "agents": [{"agent_id": a["agent_id"], "agent_name": a["name"]} for a in agent_configs],
            "status": "running",
            "current_step": 0,
            "agent_results": [],
            "outputs_by_agent": {},
            "final_output": {},
            "report_markdown": "",
            "report_structured": {},
            "pii_findings": [],
            "started_at": started_at,
            "updated_at": started_at,
            "completed_at": None,
            "failure_reason": None,
            "control": {"pause_requested": False, "stop_requested": False, "requested_at": None},
        }
    )

    initial_state: WorkflowState = {
        "workflow_run_id": run_id,
        "owner_user_id": owner_user_id or wf.get("owner_user_id"),
        "input_data": {**hydrated_input_data, "policy_ids": wf.get("policy_ids", [])},
        "agents": agent_configs,
        "current_step": 0,
        "outputs": {},
        "final_output": {},
        "status": "running",
    }
    task = asyncio.create_task(_run_workflow_steps(initial_state, start_step=0))
    _track_run_task(run_id, task)
    return run_id


async def resume_workflow_run(run_id: str) -> dict:
    db = get_db()
    run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0})
    if not run:
        raise ValueError(f"Run '{run_id}' not found")
    if run.get("status") == "completed":
        return {"run_id": run_id, "status": "completed", "message": "Run already completed"}

    wf = await db.workflow_definitions.find_one({"workflow_id": run["workflow_id"]}, {"_id": 0})
    if not wf:
        raise ValueError(f"Workflow '{run['workflow_id']}' not found")

    stored_agent_configs: list[dict] = []
    for agent_id in wf["agents"]:
        cfg = await agent_repo.get_by_id(agent_id)
        if not cfg:
            raise ValueError(f"Agent '{agent_id}' referenced in workflow not found")
        stored_agent_configs.append(cfg)
    agent_configs = _resolve_agent_configs(wf, stored_agent_configs)

    start_step = _next_step_index(run, agent_configs)
    if start_step >= len(agent_configs):
        state: WorkflowState = {
            "workflow_run_id": run_id,
            "owner_user_id": run.get("owner_user_id"),
            "input_data": run.get("input_data", {}),
            "agents": agent_configs,
            "outputs": run.get("outputs_by_agent", {}),
        }
        await _finalize_run(run_id, state)
        return {"run_id": run_id, "status": "completed", "message": "Run finalized from persisted state"}

    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {
            "$set": {
                "status": "running",
                "current_step": start_step,
                "completed_at": None,
                "updated_at": _utcnow_iso(),
                "control": {"pause_requested": False, "stop_requested": False, "requested_at": None},
            }
        },
    )
    resume_state: WorkflowState = {
        "workflow_run_id": run_id,
        "owner_user_id": run.get("owner_user_id"),
        "input_data": run.get("input_data", {}),
        "agents": agent_configs,
        "current_step": start_step,
        "outputs": run.get("outputs_by_agent", {}),
        "final_output": run.get("final_output", {}),
        "status": "running",
    }
    task = asyncio.create_task(_run_workflow_steps(resume_state, start_step=start_step))
    _track_run_task(run_id, task)
    return {"run_id": run_id, "status": "running", "resumed_from_step": start_step}


async def request_workflow_pause(run_id: str) -> dict:
    db = get_db()
    run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1, "current_step": 1})
    if not run:
        raise ValueError(f"Run '{run_id}' not found")
    if run.get("status") in ("completed", "failed", "stopped"):
        return {"run_id": run_id, "status": run.get("status"), "message": "Run is already terminal"}
    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {"$set": {"control.pause_requested": True, "control.requested_at": _utcnow_iso(), "updated_at": _utcnow_iso()}},
    )
    return {"run_id": run_id, "status": run.get("status"), "requested": "pause", "current_step": run.get("current_step", 0)}


async def request_workflow_stop(run_id: str) -> dict:
    db = get_db()
    run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1, "current_step": 1, "hitl_id": 1})
    if not run:
        raise ValueError(f"Run '{run_id}' not found")
    if run.get("status") in ("completed", "failed", "stopped"):
        return {"run_id": run_id, "status": run.get("status"), "message": "Run is already terminal"}

    cancelled = _cancel_run_task(run_id)
    update = {
        "$set": {
            "control.stop_requested": True,
            "control.requested_at": _utcnow_iso(),
            "updated_at": _utcnow_iso(),
        }
    }
    if run.get("status") == "paused" or cancelled:
        update["$set"].update({"status": "stopped", "hitl_id": None, "completed_at": _utcnow_iso()})
    await db.workflow_runs.update_one({"run_id": run_id}, update)
    return {
        "run_id": run_id,
        "status": "stopped" if (run.get("status") == "paused" or cancelled) else run.get("status"),
        "requested": "stop",
        "current_step": run.get("current_step", 0),
        "cancelled_active_task": cancelled,
    }
