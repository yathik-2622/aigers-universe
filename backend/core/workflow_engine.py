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


async def _wait_for_hitl_resume(hitl_id: str, run_id: str) -> dict:
    db = get_db()
    event = resume_signals.get_or_create_event(hitl_id)
    timeout = settings.HITL_TIMEOUT_SECONDS

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        result = resume_signals.get_result(hitl_id) or {}
        resume_signals.clear(hitl_id)
        return result
    except asyncio.TimeoutError:
        record = await db.hitl_records.find_one({"hitl_id": hitl_id}, {"_id": 0})
        if record and record.get("status") in ("approved", "rejected"):
            return {
                "decision": "approve" if record["status"] == "approved" else "reject",
                "note": record.get("human_note", ""),
            }
        logger.warning("hitl.wait.timeout", hitl_id=hitl_id, run_id=run_id)
        return {"decision": "reject", "note": f"HITL timeout after {timeout}s"}


async def _execute_agent_step(state: WorkflowState, step_idx: int) -> dict:
    run_id = state["workflow_run_id"]
    agents = state["agents"]
    agent_config = agents[step_idx]
    agent_name = agent_config["name"]
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()

    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {"$set": {"current_step": step_idx, "current_agent": agent_name, "status": "running", "updated_at": now}},
    )

    upstream_messages = await get_a2a_messages(workflow_run_id=run_id) if step_idx > 0 else []
    input_data = {"original_input": state["input_data"], "previous_outputs": state.get("outputs", {})}

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

    next_agent_name = agents[step_idx + 1]["name"] if step_idx + 1 < len(agents) else "__end__"
    await send_a2a_message(
        from_agent=agent_name,
        to_agent=next_agent_name,
        message_type="result",
        payload=result.get("output", {}),
        workflow_run_id=run_id,
    )

    outputs = dict(state.get("outputs", {}))
    outputs[agent_name] = result.get("output", {})

    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {
            "$push": {
                "agent_results": {
                    "agent_id": agent_config["agent_id"],
                    "agent_name": agent_name,
                    "step_number": step_idx,
                    "status": result.get("status"),
                    "output": result.get("output", {}),
                    "tokens_used": result.get("tokens_used", 0),
                    "latency_ms": result.get("latency_ms", 0.0),
                    "tools_called": result.get("tools_called", []),
                    "completed_at": datetime.datetime.utcnow().isoformat(),
                }
            },
            "$set": {"outputs_by_agent": outputs, "updated_at": datetime.datetime.utcnow().isoformat()},
        },
    )

    if result.get("status") == "failed":
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "failed", "failure_reason": result.get("error") or "Agent failure"}},
        )
        return {"outputs": outputs, "status": "failed", "failure_reason": result.get("error", "")}

    run_doc = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1, "hitl_id": 1})
    if run_doc and run_doc.get("status") in ("paused", "resuming"):
        hitl_id = run_doc.get("hitl_id")
        if hitl_id:
            logger.info("workflow.paused.awaiting_hitl", run_id=run_id, hitl_id=hitl_id)
            decision = await _wait_for_hitl_resume(hitl_id, run_id)
            if decision.get("decision") == "reject":
                await db.workflow_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}"}},
                )
                return {"outputs": outputs, "status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}"}

            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {"status": "running", "hitl_id": None, "updated_at": datetime.datetime.utcnow().isoformat()}},
            )
            outputs[f"{agent_name}_hitl"] = {"approved": True, "note": decision.get("note", "")}
            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {"outputs_by_agent": outputs, "updated_at": datetime.datetime.utcnow().isoformat()}},
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
                "completed_at": datetime.datetime.utcnow().isoformat(),
                "updated_at": datetime.datetime.utcnow().isoformat(),
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
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            },
        )


async def _run_workflow_steps(state: WorkflowState, start_step: int = 0) -> None:
    run_id = state["workflow_run_id"]
    db = get_db()
    try:
        for step_idx in range(start_step, len(state["agents"])):
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
                            "completed_at": datetime.datetime.utcnow().isoformat(),
                            "updated_at": datetime.datetime.utcnow().isoformat(),
                        }
                    },
                )
                return
        await _finalize_run(run_id, state)
        logger.info("workflow.run.complete", run_id=run_id)
    except Exception as exc:
        logger.error("workflow.run.failed", run_id=run_id, error=str(exc), exc_info=True)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {
                "$set": {
                    "status": "failed",
                    "failure_reason": str(exc),
                    "completed_at": datetime.datetime.utcnow().isoformat(),
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            },
        )


def _next_step_index(run: dict, agent_configs: list[dict]) -> int:
    outputs = run.get("outputs_by_agent", {}) or {}
    completed_names = {name for name in outputs.keys() if not name.endswith("_hitl")}
    for idx, agent in enumerate(agent_configs):
        if agent["name"] not in completed_names:
            return idx
    return len(agent_configs)


async def build_and_run_workflow(workflow_id: str, input_data: dict, owner_user_id: str | None = None) -> str:
    db = get_db()
    wf = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0})
    if not wf:
        raise ValueError(f"Workflow '{workflow_id}' not found")

    agent_configs: list[dict] = []
    for agent_id in wf["agents"]:
        cfg = await agent_repo.get_by_id(agent_id)
        if not cfg:
            raise ValueError(f"Agent '{agent_id}' referenced in workflow not found")
        agent_configs.append(cfg)
    if len(agent_configs) < 2:
        raise ValueError("Workflow must have at least 2 agents")

    run_id = str(uuid.uuid4())
    started_at = datetime.datetime.utcnow().isoformat()
    await db.workflow_runs.insert_one(
        {
            "run_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": wf.get("name", ""),
            "project_id": wf.get("project_id"),
            "input_data": input_data,
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
        }
    )

    initial_state: WorkflowState = {
        "workflow_run_id": run_id,
        "owner_user_id": owner_user_id or wf.get("owner_user_id"),
        "input_data": {**input_data, "policy_ids": wf.get("policy_ids", [])},
        "agents": agent_configs,
        "current_step": 0,
        "outputs": {},
        "final_output": {},
        "status": "running",
    }
    asyncio.create_task(_run_workflow_steps(initial_state, start_step=0))
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

    agent_configs: list[dict] = []
    for agent_id in wf["agents"]:
        cfg = await agent_repo.get_by_id(agent_id)
        if not cfg:
            raise ValueError(f"Agent '{agent_id}' referenced in workflow not found")
        agent_configs.append(cfg)

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
        {"$set": {"status": "running", "current_step": start_step, "updated_at": datetime.datetime.utcnow().isoformat()}},
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
    asyncio.create_task(_run_workflow_steps(resume_state, start_step=start_step))
    return {"run_id": run_id, "status": "running", "resumed_from_step": start_step}
