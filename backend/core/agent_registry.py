"""
Agent registry / runtime — invokes a registered agent with input data.

Each agent has:
  - system_prompt: LLM instructions
  - tools: list of MCP tool names the agent may call
  - hitl_enabled: pause workflow after this agent runs for human review

Strategy:
  1. Build messages: system_prompt + serialised input_data + (optional) prior A2A messages.
  2. Call the LLM with the agent's tool schemas advertised.
  3. If the LLM returns tool calls, invoke them via TOOL_REGISTRY and feed results back.
  4. Loop until the LLM produces a final assistant message or max iterations reached.
  5. Return the agent's structured output plus token/latency/tools_called metadata.
"""
import json
import time
import structlog

from core.llm_router import chat_completion
from mcp_tools.tool_server import TOOL_REGISTRY

logger = structlog.get_logger(__name__)


# OpenAI tool schemas — agents advertise which of these they can use
TOOL_SCHEMAS: dict[str, dict] = {
    "semantic_search": {
        "type": "function",
        "function": {
            "name": "semantic_search",
            "description": "Search indexed documents using semantic similarity (FAISS).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language query"},
                    "top_k": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "document_store": {
        "type": "function",
        "function": {
            "name": "document_store",
            "description": "Store or retrieve structured data in agent-owned MongoDB collections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["store", "retrieve"]},
                    "collection": {"type": "string"},
                    "data": {"type": "object"},
                    "query": {"type": "object"},
                    "limit": {"type": "integer", "default": 50},
                },
                "required": ["action", "collection"],
            },
        },
    },
    "rules_engine_check": {
        "type": "function",
        "function": {
            "name": "rules_engine_check",
            "description": "Check text content against the platform governance rules. Returns matched rules and overall PASS/FAIL/REVIEW.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "rule_category": {"type": "string"},
                    "policy_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["text"],
            },
        },
    },
    "risk_scorer": {
        "type": "function",
        "function": {
            "name": "risk_scorer",
            "description": "Score text for risk level (RED/AMBER/GREEN) with rationale and concerns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "context": {"type": "string"},
                },
                "required": ["text"],
            },
        },
    },
    "trigger_hitl": {
        "type": "function",
        "function": {
            "name": "trigger_hitl",
            "description": "Pause the current workflow and create a Human-in-the-Loop approval request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_run_id": {"type": "string"},
                    "agent_name": {"type": "string"},
                    "reason": {"type": "string"},
                    "severity": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                    "context": {"type": "object"},
                },
                "required": ["workflow_run_id", "agent_name", "reason", "severity"],
            },
        },
    },
}


def _build_tools_payload(tool_names: list[str]) -> list[dict]:
    """Build the OpenAI tools array for the agent's enabled MCP tools."""
    return [TOOL_SCHEMAS[name] for name in tool_names if name in TOOL_SCHEMAS]


async def _invoke_tool(name: str, args: dict, workflow_run_id: str, agent_name: str, policy_ids: list[str] | None = None) -> dict:
    """Invoke a tool by name from the TOOL_REGISTRY, auto-injecting workflow context."""
    fn = TOOL_REGISTRY.get(name)
    if fn is None:
        return {"error": f"Tool '{name}' not registered"}

    # Inject workflow context for trigger_hitl so the agent doesn't have to know it
    if name == "trigger_hitl":
        args.setdefault("workflow_run_id", workflow_run_id)
        args.setdefault("agent_name", agent_name)
    if name == "rules_engine_check" and policy_ids:
        args.setdefault("policy_ids", policy_ids)

    try:
        return await fn(**args)
    except Exception as exc:
        logger.error("agent.tool.failed", tool=name, error=str(exc), exc_info=True)
        return {"error": str(exc), "tool": name}


async def invoke_agent_by_id(
    agent_config: dict,
    input_data: dict,
    workflow_run_id: str,
    step_number: int,
    upstream_messages: list[dict] | None = None,
    max_tool_iterations: int = 5,
) -> dict:
    """
    Invoke a single agent end-to-end.

    Returns dict with: output, tokens_used, latency_ms, tools_called, status, error
    """
    agent_name = agent_config["name"]
    framework = agent_config.get("framework", "langgraph")
    system_prompt = agent_config.get("system_prompt", "")
    enabled_tools = agent_config.get("tools", []) or []
    selected_policy_ids = (input_data.get("original_input") or {}).get("policy_ids", [])

    logger.info("agent.invoke.start", agent_name=agent_name, framework=framework, step=step_number)
    start = time.perf_counter()

    # Compose the user message from input_data + any upstream A2A messages
    user_parts = [f"INPUT DATA:\n{json.dumps(input_data, default=str)[:6000]}"]
    if upstream_messages:
        upstream_summary = json.dumps(
            [{"from": m["from_agent"], "type": m["message_type"], "payload": m["payload"]} for m in upstream_messages],
            default=str,
        )[:4000]
        user_parts.append(f"\nUPSTREAM AGENT MESSAGES:\n{upstream_summary}")
    if selected_policy_ids:
        user_parts.append(
            f"\nSELECTED POLICY IDS:\n{json.dumps(selected_policy_ids)}\nUse these policies when performing compliance or redline work."
        )

    messages: list[dict] = [
        {"role": "system", "content": system_prompt or "You are a helpful AI agent in an enterprise workflow."},
        {"role": "user", "content": "\n".join(user_parts)},
    ]

    tools_payload = _build_tools_payload(enabled_tools)
    tools_called: list[str] = []
    total_tokens = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    final_content = ""

    try:
        for _iteration in range(max_tool_iterations):
            # Call the LLM with or without tools depending on what the agent has enabled
            if tools_payload:
                # Use the raw client to support tools (chat_completion wrapper doesn't expose tools)
                from core.llm_router import _client  # internal access
                from config import settings as _settings
                resp = await _client.chat.completions.create(
                    model=_settings.LLM_MODEL,
                    messages=messages,
                    temperature=0.2,
                    tools=tools_payload,
                    tool_choice="auto",
                )
                msg = resp.choices[0].message
                if resp.usage:
                    total_tokens += resp.usage.total_tokens
                    total_prompt_tokens += resp.usage.prompt_tokens
                    total_completion_tokens += resp.usage.completion_tokens

                tool_calls = msg.tool_calls or []
                if not tool_calls:
                    final_content = msg.content or ""
                    break

                # Append assistant tool-call message
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                        }
                        for tc in tool_calls
                    ],
                })

                # Execute each tool call
                for tc in tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError:
                        tool_args = {}
                    tool_result = await _invoke_tool(tool_name, tool_args, workflow_run_id, agent_name, selected_policy_ids)
                    tools_called.append(tool_name)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(tool_result, default=str)[:6000],
                    })
            else:
                # No tools — single shot LLM call
                result = await chat_completion(messages=messages, caller=f"agent.{agent_name}")
                final_content = result["content"] or ""
                total_tokens += result["tokens_used"]
                total_prompt_tokens += result["prompt_tokens"]
                total_completion_tokens += result["completion_tokens"]
                break

        # Try to parse final content as JSON; fall back to raw text
        output: dict
        try:
            # Strip markdown code fences if present
            stripped = final_content.strip()
            if stripped.startswith("```"):
                stripped = stripped.split("```")[1]
                if stripped.startswith("json"):
                    stripped = stripped[4:]
                stripped = stripped.strip().rstrip("`").strip()
            output = json.loads(stripped) if stripped else {"text": final_content}
            if not isinstance(output, dict):
                output = {"result": output}
        except json.JSONDecodeError:
            output = {"text": final_content}

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "agent.invoke.complete",
            agent_name=agent_name,
            tokens=total_tokens,
            tools_called=tools_called,
            latency_ms=latency_ms,
        )

        return {
            "agent_name": agent_name,
            "framework": framework,
            "output": output,
            "tokens_used": total_tokens,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "latency_ms": latency_ms,
            "tools_called": tools_called,
            "status": "success",
            "error": None,
        }

    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.error("agent.invoke.failed", agent_name=agent_name, error=str(exc), exc_info=True)
        return {
            "agent_name": agent_name,
            "framework": framework,
            "output": {},
            "tokens_used": total_tokens,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "latency_ms": latency_ms,
            "tools_called": tools_called,
            "status": "failed",
            "error": str(exc),
        }
