"""
Workflow engine — orchestrates a chain of agents using LangGraph.
Uses InMemorySaver checkpointer so workflows can pause (interrupt) and resume.
A2A messages are persisted between every adjacent agent pair.

NOTE on HITL: When an agent calls the trigger_hitl tool, the tool sets the workflow run
status to 'paused' in MongoDB and creates a hitl_records row. After the agent finishes
(possibly with a tool-call result of {status:'paused'}), the engine checks the run status
and, if paused, awaits the resume_signals event for that hitl_id (with a timeout fallback
to MongoDB polling so the engine recovers across restarts).
"""
import asyncio
import datetime
import uuid
import structlog

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import InMemorySaver
from typing import TypedDict, Annotated

from db.mongo_client import get_db
from db.repositories.agent_repo import AgentRepository
from a2a.agent_communication import send_a2a_message, get_a2a_messages
from observability.tracer import record_trace
from core.agent_registry import invoke_agent_by_id
from hitl import resume_signals
from config import settings

logger = structlog.get_logger(__name__)
agent_repo = AgentRepository()


class WorkflowState(TypedDict, total=False):
    """LangGraph state passed between nodes."""
    workflow_run_id: str
    input_data: dict
    agents: list[dict]  # ordered list of full agent_config dicts
    current_step: int
    outputs: dict  # agent_name -> output dict
    final_output: dict
    status: str
    failure_reason: str


def _build_state_graph(num_nodes: int) -> StateGraph:
    """Build a linear LangGraph StateGraph with `num_nodes` agent-execution nodes."""
    graph = StateGraph(WorkflowState)

    async def make_node_fn(step_idx: int):
        async def node_fn(state: WorkflowState) -> dict:
            return await _execute_agent_step(state, step_idx)
        return node_fn

    # Add nodes
    node_names = [f"agent_{i}" for i in range(num_nodes)]
    for i, name in enumerate(node_names):
        # Create closure for each step index
        async def _fn(state: WorkflowState, _i=i) -> dict:
            return await _execute_agent_step(state, _i)
        graph.add_node(name, _fn)

    # Linear edges
    graph.set_entry_point(node_names[0])
    for i in range(len(node_names) - 1):
        graph.add_edge(node_names[i], node_names[i + 1])
    graph.add_edge(node_names[-1], END)

    return graph


async def _wait_for_hitl_resume(hitl_id: str, run_id: str) -> dict:
    """Wait for either the in-process resume signal or MongoDB status change."""
    db = get_db()
    event = resume_signals.get_or_create_event(hitl_id)
    timeout = settings.HITL_TIMEOUT_SECONDS

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        result = resume_signals.get_result(hitl_id) or {}
        resume_signals.clear(hitl_id)
        return result
    except asyncio.TimeoutError:
        # Fallback: check MongoDB once for late approval (e.g. server restart)
        record = await db.hitl_records.find_one({"hitl_id": hitl_id}, {"_id": 0})
        if record and record.get("status") in ("approved", "rejected"):
            return {"decision": "approve" if record["status"] == "approved" else "reject", "note": record.get("human_note", "")}
        # No human decision within timeout — auto-reject for safety
        logger.warning("hitl.wait.timeout", hitl_id=hitl_id)
        return {"decision": "reject", "note": f"HITL timeout after {timeout}s"}


async def _execute_agent_step(state: WorkflowState, step_idx: int) -> dict:
    """Execute one agent in the workflow chain and update shared state."""
    run_id = state["workflow_run_id"]
    agents = state["agents"]
    agent_config = agents[step_idx]
    agent_name = agent_config["name"]
    db = get_db()

    # Update workflow run current_step
    await db.workflow_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "current_step": step_idx,
            "current_agent": agent_name,
            "status": "running",
            "updated_at": datetime.datetime.utcnow().isoformat(),
        }},
    )

    # Gather upstream A2A messages for context
    upstream_messages = await get_a2a_messages(workflow_run_id=run_id) if step_idx > 0 else []

    # Determine input for this agent: original input + previous outputs
    input_data = {
        "original_input": state["input_data"],
        "previous_outputs": state.get("outputs", {}),
    }

    # Invoke the agent
    result = await invoke_agent_by_id(
        agent_config=agent_config,
        input_data=input_data,
        workflow_run_id=run_id,
        step_number=step_idx,
        upstream_messages=upstream_messages,
    )

    # Record observability trace
    await record_trace(
        workflow_run_id=run_id,
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

    # Send A2A message to the next agent (or to '__end__' for the last one)
    next_agent_name = agents[step_idx + 1]["name"] if step_idx + 1 < len(agents) else "__end__"
    await send_a2a_message(
        from_agent=agent_name,
        to_agent=next_agent_name,
        message_type="result",
        payload=result.get("output", {}),
        workflow_run_id=run_id,
    )

    # Update outputs map
    outputs = dict(state.get("outputs", {}))
    outputs[agent_name] = result.get("output", {})

    # Update workflow_runs.agent_results array for live UI
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
            "$set": {"updated_at": datetime.datetime.utcnow().isoformat()},
        },
    )

    # If the agent had an explicit error, mark workflow failed and short-circuit
    if result.get("status") == "failed":
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "failed", "failure_reason": result.get("error") or "Agent failure"}},
        )
        return {"outputs": outputs, "status": "failed", "failure_reason": result.get("error", "")}

    # Check if the agent triggered HITL (workflow_runs.status was set to 'paused')
    run_doc = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1, "hitl_id": 1})
    if run_doc and run_doc.get("status") == "paused":
        hitl_id = run_doc.get("hitl_id")
        logger.info("workflow.paused.awaiting_hitl", run_id=run_id, hitl_id=hitl_id)
        decision = await _wait_for_hitl_resume(hitl_id, run_id)

        if decision.get("decision") == "reject":
            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {"status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}"}},
            )
            return {"outputs": outputs, "status": "failed", "failure_reason": f"HITL rejected: {decision.get('note', '')}"}

        # Approved — clear paused state and continue
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "running", "hitl_id": None, "updated_at": datetime.datetime.utcnow().isoformat()}},
        )
        outputs[agent_name + "_hitl"] = {"approved": True, "note": decision.get("note", "")}

    return {"outputs": outputs, "current_step": step_idx + 1}


async def build_and_run_workflow(workflow_id: str, input_data: dict) -> str:
    """Build a LangGraph workflow from a saved definition and execute it asynchronously."""
    db = get_db()
    wf = await db.workflow_definitions.find_one({"workflow_id": workflow_id}, {"_id": 0})
    if not wf:
        raise ValueError(f"Workflow '{workflow_id}' not found")

    # Fetch full agent configs in order
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

    # Create the workflow_run row up front
    await db.workflow_runs.insert_one({
        "run_id": run_id,
        "workflow_id": workflow_id,
        "workflow_name": wf.get("name", ""),
        "input_data": input_data,
        "agents": [{"agent_id": a["agent_id"], "agent_name": a["name"]} for a in agent_configs],
        "status": "running",
        "current_step": 0,
        "agent_results": [],
        "final_output": {},
        "started_at": started_at,
        "updated_at": started_at,
        "completed_at": None,
        "failure_reason": None,
    })

    # Build graph
    graph = _build_state_graph(num_nodes=len(agent_configs))
    checkpointer = InMemorySaver()
    compiled = graph.compile(checkpointer=checkpointer)

    initial_state: WorkflowState = {
        "workflow_run_id": run_id,
        "input_data": input_data,
        "agents": agent_configs,
        "current_step": 0,
        "outputs": {},
        "final_output": {},
        "status": "running",
    }

    # Fire-and-forget: run the graph in the background
    asyncio.create_task(_execute_graph(compiled, initial_state, run_id))
    return run_id


async def _execute_graph(compiled, initial_state, run_id: str) -> None:
    """Run the compiled LangGraph to completion and finalize the run record."""
    db = get_db()
    config = {"configurable": {"thread_id": run_id}}
    try:
        final_state = await compiled.ainvoke(initial_state, config=config)
        # If graph completed but the run was failed mid-way, leave the failed status
        current_run = await db.workflow_runs.find_one({"run_id": run_id}, {"_id": 0, "status": 1})
        if current_run and current_run.get("status") not in ("failed",):
            outputs = final_state.get("outputs", {})
            # Use the last agent's output as the final output
            last_agent_name = initial_state["agents"][-1]["name"]
            final_output = outputs.get(last_agent_name, outputs)
            await db.workflow_runs.update_one(
                {"run_id": run_id},
                {"$set": {
                    "status": "completed",
                    "final_output": final_output,
                    "outputs_by_agent": outputs,
                    "completed_at": datetime.datetime.utcnow().isoformat(),
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }},
            )
        logger.info("workflow.run.complete", run_id=run_id)
    except Exception as exc:
        logger.error("workflow.run.failed", run_id=run_id, error=str(exc), exc_info=True)
        await db.workflow_runs.update_one(
            {"run_id": run_id},
            {"$set": {
                "status": "failed",
                "failure_reason": str(exc),
                "completed_at": datetime.datetime.utcnow().isoformat(),
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }},
        )
