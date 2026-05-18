import json
import os
import time

import structlog
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from a2a.agent_communication import dispatch_remote_agent
from config import settings
from mcp_tools.tool_server import TOOL_REGISTRY

logger = structlog.get_logger(__name__)


def _safe_message_name(value: str) -> str:
    allowed = []
    for ch in value.lower():
        if ch.isalnum() or ch in {"_", "-"}:
            allowed.append(ch)
        else:
            allowed.append("_")
    safe = "".join(allowed).strip("_") or "agent"
    return safe[:64]


def _make_crewai_tool(base_tool, tool):
    name = base_tool.name
    description = base_tool.description or name

    @tool(name)
    async def _wrapped_tool(**kwargs):
        result = await base_tool.ainvoke(kwargs)
        return result if isinstance(result, str) else json.dumps(result, default=str)

    _wrapped_tool.__doc__ = description
    return _wrapped_tool


def _make_agno_tool(base_tool, tool):
    name = base_tool.name
    description = base_tool.description or name

    @tool
    async def _wrapped_tool(**kwargs):
        result = await base_tool.ainvoke(kwargs)
        return result if isinstance(result, str) else json.dumps(result, default=str)

    _wrapped_tool.__name__ = name
    _wrapped_tool.__doc__ = description
    return _wrapped_tool


def _compose_user_message(input_data: dict, upstream_messages: list[dict] | None, selected_policy_ids: list[str]) -> str:
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
    return "\n".join(user_parts)


def _parse_output(final_content: str) -> dict:
    try:
        stripped = final_content.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("```")[1]
            if stripped.startswith("json"):
                stripped = stripped[4:]
            stripped = stripped.strip().rstrip("`").strip()
        output = json.loads(stripped) if stripped else {"text": final_content}
        if not isinstance(output, dict):
            output = {"result": output}
        return output
    except json.JSONDecodeError:
        return {"text": final_content}


def _extract_usage_from_messages(messages: list[BaseMessage]) -> tuple[int, int, int]:
    total_tokens = 0
    prompt_tokens = 0
    completion_tokens = 0
    for message in messages:
        usage = getattr(message, "usage_metadata", None) or {}
        if usage:
            total_tokens += int(usage.get("total_tokens", 0) or 0)
            prompt_tokens += int(usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0) or 0)
            completion_tokens += int(usage.get("output_tokens", 0) or usage.get("completion_tokens", 0) or 0)
            continue
        response_metadata = getattr(message, "response_metadata", None) or {}
        token_usage = response_metadata.get("token_usage", {})
        total_tokens += int(token_usage.get("total_tokens", 0) or 0)
        prompt_tokens += int(token_usage.get("prompt_tokens", 0) or 0)
        completion_tokens += int(token_usage.get("completion_tokens", 0) or 0)
    return total_tokens, prompt_tokens, completion_tokens


def _extract_tools_called(messages: list[BaseMessage]) -> list[str]:
    called: list[str] = []
    for message in messages:
        tool_calls = getattr(message, "tool_calls", None) or []
        for tool_call in tool_calls:
            name = tool_call.get("name")
            if name:
                called.append(name)
    return called


def _extract_final_message(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.content:
            if isinstance(message.content, list):
                parts = [part.get("text", "") for part in message.content if isinstance(part, dict)]
                return "\n".join(part for part in parts if part).strip()
            return str(message.content)
    return ""


def _make_langchain_llm(model_name: str) -> ChatOpenAI:
    return ChatOpenAI(
        model=model_name,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        temperature=0.2,
        max_retries=2,
        stream_usage=True,
    )


def _build_langchain_tools(
    enabled_tools: list[str],
    workflow_run_id: str,
    agent_name: str,
    selected_policy_ids: list[str],
) -> list[StructuredTool]:
    tools: list[StructuredTool] = []

    async def semantic_search(query: str, top_k: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["semantic_search"](query=query, top_k=top_k), default=str)

    async def document_store(action: str, collection: str, data: dict | None = None, query: dict | None = None, limit: int = 50) -> str:
        return json.dumps(
            await TOOL_REGISTRY["document_store"](action=action, collection=collection, data=data, query=query, limit=limit),
            default=str,
        )

    async def rules_engine_check(text: str, rule_category: str | None = None, policy_ids: list[str] | None = None) -> str:
        return json.dumps(
            await TOOL_REGISTRY["rules_engine_check"](
                text=text,
                rule_category=rule_category,
                policy_ids=policy_ids or selected_policy_ids or None,
            ),
            default=str,
        )

    async def risk_scorer(text: str, context: str = "") -> str:
        return json.dumps(await TOOL_REGISTRY["risk_scorer"](text=text, context=context), default=str)

    async def policy_library_search(query: str, policy_ids: list[str] | None = None, limit: int = 5) -> str:
        return json.dumps(
            await TOOL_REGISTRY["policy_library_search"](query=query, policy_ids=policy_ids or selected_policy_ids or None, limit=limit),
            default=str,
        )

    async def wikipedia_search(query: str, limit: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["wikipedia_search"](query=query, limit=limit), default=str)

    async def webpage_fetch(url: str, max_chars: int = 5000) -> str:
        return json.dumps(await TOOL_REGISTRY["webpage_fetch"](url=url, max_chars=max_chars), default=str)

    async def weather_current(latitude: float, longitude: float, timezone: str = "auto") -> str:
        return json.dumps(await TOOL_REGISTRY["weather_current"](latitude=latitude, longitude=longitude, timezone=timezone), default=str)

    async def openweather_current(latitude: float, longitude: float, units: str = "metric") -> str:
        return json.dumps(await TOOL_REGISTRY["openweather_current"](latitude=latitude, longitude=longitude, units=units), default=str)

    async def serpapi_search(query: str, num: int = 5, location: str | None = None) -> str:
        return json.dumps(await TOOL_REGISTRY["serpapi_search"](query=query, num=num, location=location), default=str)

    async def official_docs_search(provider: str, query: str, max_results: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["official_docs_search"](provider=provider, query=query, max_results=max_results), default=str)

    async def java_docs_search(query: str, max_results: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["java_docs_search"](query=query, max_results=max_results), default=str)

    async def python_docs_search(query: str, max_results: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["python_docs_search"](query=query, max_results=max_results), default=str)

    async def spring_docs_search(query: str, max_results: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["spring_docs_search"](query=query, max_results=max_results), default=str)

    async def dotnet_docs_search(query: str, max_results: int = 5) -> str:
        return json.dumps(await TOOL_REGISTRY["dotnet_docs_search"](query=query, max_results=max_results), default=str)

    async def remote_agent_discover(agent_card_url: str) -> str:
        return json.dumps(await TOOL_REGISTRY["remote_agent_discover"](agent_card_url=agent_card_url), default=str)

    async def remote_agent_dispatch(agent_card_url: str, input_data: dict, message_type: str = "delegation") -> str:
        return json.dumps(
            await TOOL_REGISTRY["remote_agent_dispatch"](
                agent_card_url=agent_card_url,
                input_data=input_data,
                workflow_run_id=workflow_run_id,
                from_agent=agent_name,
                message_type=message_type,
            ),
            default=str,
        )

    async def trigger_hitl(reason: str, severity: str, context: dict | None = None) -> str:
        return json.dumps(
            await TOOL_REGISTRY["trigger_hitl"](
                workflow_run_id=workflow_run_id,
                agent_name=agent_name,
                reason=reason,
                severity=severity,
                context=context or {},
            ),
            default=str,
        )

    available = {
        "semantic_search": semantic_search,
        "document_store": document_store,
        "rules_engine_check": rules_engine_check,
        "risk_scorer": risk_scorer,
        "policy_library_search": policy_library_search,
        "wikipedia_search": wikipedia_search,
        "webpage_fetch": webpage_fetch,
        "weather_current": weather_current,
        "openweather_current": openweather_current,
        "serpapi_search": serpapi_search,
        "official_docs_search": official_docs_search,
        "java_docs_search": java_docs_search,
        "python_docs_search": python_docs_search,
        "spring_docs_search": spring_docs_search,
        "dotnet_docs_search": dotnet_docs_search,
        "remote_agent_discover": remote_agent_discover,
        "remote_agent_dispatch": remote_agent_dispatch,
        "trigger_hitl": trigger_hitl,
    }
    descriptions = {
        "semantic_search": "Search indexed documents using semantic similarity.",
        "document_store": "Store or retrieve structured agent data from MongoDB.",
        "rules_engine_check": "Check text against governance rules and selected workflow policies.",
        "risk_scorer": "Score text for business and compliance risk.",
        "policy_library_search": "Search uploaded policy documents and saved rules for guidance.",
        "wikipedia_search": "Search Wikipedia for public background and reference links.",
        "webpage_fetch": "Fetch a web page and return cleaned text content.",
        "weather_current": "Fetch current weather from Open-Meteo.",
        "openweather_current": "Fetch current weather from OpenWeather with API key.",
        "serpapi_search": "Fetch live search engine results via SerpAPI.",
        "official_docs_search": "Search official documentation for languages and frameworks.",
        "java_docs_search": "Search official Oracle Java documentation.",
        "python_docs_search": "Search official Python documentation.",
        "spring_docs_search": "Search official Spring documentation.",
        "dotnet_docs_search": "Search official .NET documentation.",
        "remote_agent_discover": "Fetch a remote A2A agent card over HTTP.",
        "remote_agent_dispatch": "Dispatch work to a remote A2A agent over HTTP using the current workflow context.",
        "trigger_hitl": "Pause the workflow and request human review. Workflow and agent context are injected automatically.",
    }

    for tool_name in enabled_tools:
        fn = available.get(tool_name)
        if fn:
            tools.append(
                StructuredTool.from_function(
                    coroutine=fn,
                    name=tool_name,
                    description=descriptions[tool_name],
                    parse_docstring=False,
                )
            )
    return tools


async def _run_langgraph(
    agent_name: str,
    system_prompt: str,
    model_name: str,
    enabled_tools: list[str],
    user_message: str,
    workflow_run_id: str,
    selected_policy_ids: list[str],
) -> dict:
    llm = _make_langchain_llm(model_name)
    tools = _build_langchain_tools(enabled_tools, workflow_run_id, agent_name, selected_policy_ids)
    runner = create_react_agent(model=llm, tools=tools, prompt=system_prompt or None, name=_safe_message_name(agent_name))
    result = await runner.ainvoke({"messages": [HumanMessage(content=user_message)]})
    messages = result.get("messages", [])
    total_tokens, prompt_tokens, completion_tokens = _extract_usage_from_messages(messages)
    return {
        "content": _extract_final_message(messages),
        "tools_called": _extract_tools_called(messages),
        "tokens_used": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
    }


async def _run_langchain(
    agent_name: str,
    system_prompt: str,
    model_name: str,
    enabled_tools: list[str],
    user_message: str,
    workflow_run_id: str,
    selected_policy_ids: list[str],
) -> dict:
    llm = _make_langchain_llm(model_name)
    tools = _build_langchain_tools(enabled_tools, workflow_run_id, agent_name, selected_policy_ids)
    runner = create_agent(model=llm, tools=tools, system_prompt=system_prompt or None, name=_safe_message_name(agent_name))
    result = await runner.ainvoke({"messages": [{"role": "user", "content": user_message}]})
    messages = result.get("messages", [])
    total_tokens, prompt_tokens, completion_tokens = _extract_usage_from_messages(messages)
    return {
        "content": _extract_final_message(messages),
        "tools_called": _extract_tools_called(messages),
        "tokens_used": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
    }


async def _run_crewai(
    agent_name: str,
    system_prompt: str,
    model_name: str,
    enabled_tools: list[str],
    user_message: str,
    workflow_run_id: str,
    selected_policy_ids: list[str],
) -> dict:
    os.environ.setdefault("CREWAI_STORAGE_DIR", "aigers-universe")
    try:
        from crewai import Agent, Crew, LLM, Process, Task
        from crewai.tools import tool
    except Exception as exc:
        raise RuntimeError(f"CrewAI runtime unavailable: {exc}") from exc

    base_tools = _build_langchain_tools(enabled_tools, workflow_run_id, agent_name, selected_policy_ids)
    crew_tools = [_make_crewai_tool(base_tool, tool) for base_tool in base_tools]

    llm = LLM(
        model=f"openai/{model_name}",
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        temperature=0.2,
        max_retries=2,
    )
    agent = Agent(
        role=agent_name,
        goal="Execute the assigned workflow step accurately and return only the final structured result.",
        backstory=system_prompt or "You are a reliable enterprise workflow agent.",
        tools=crew_tools,
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )
    task = Task(
        description=user_message,
        expected_output="Return the final answer as strict JSON when possible. Do not wrap it in commentary.",
        agent=agent,
    )
    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
    output = await crew.kickoff_async()
    content = getattr(output, "raw", None) or str(output)
    usage_metrics = getattr(crew, "usage_metrics", None) or {}
    return {
        "content": content,
        "tools_called": enabled_tools,
        "tokens_used": int(usage_metrics.get("total_tokens", 0) or 0),
        "prompt_tokens": int(usage_metrics.get("prompt_tokens", 0) or 0),
        "completion_tokens": int(usage_metrics.get("completion_tokens", 0) or 0),
    }


async def _run_agno(
    agent_name: str,
    system_prompt: str,
    model_name: str,
    enabled_tools: list[str],
    user_message: str,
    workflow_run_id: str,
    selected_policy_ids: list[str],
) -> dict:
    try:
        from agno.agent import Agent
        from agno.models.openai import OpenAIChat
        from agno.tools import tool
    except Exception as exc:
        raise RuntimeError(f"Agno runtime unavailable: {exc}") from exc

    base_tools = _build_langchain_tools(enabled_tools, workflow_run_id, agent_name, selected_policy_ids)
    agno_tools = [_make_agno_tool(base_tool, tool) for base_tool in base_tools]

    model = OpenAIChat(id=model_name, api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    agent = Agent(
        name=agent_name,
        model=model,
        instructions=system_prompt or "You are a reliable enterprise workflow agent.",
        tools=agno_tools,
        markdown=True,
    )
    response = await agent.arun(user_message)
    content = getattr(response, "content", None) or str(response)
    return {
        "content": content,
        "tools_called": enabled_tools,
        "tokens_used": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
    }


async def run_framework_agent(
    agent_config: dict,
    input_data: dict,
    workflow_run_id: str,
    step_number: int,
    upstream_messages: list[dict] | None = None,
) -> dict:
    agent_name = agent_config["name"]
    framework = (agent_config.get("framework") or "langgraph").lower()
    model_name = agent_config.get("model_name") or settings.LLM_MODEL
    enabled_tools = agent_config.get("tools", []) or []
    system_prompt = agent_config.get("system_prompt", "")
    selected_policy_ids = (input_data.get("original_input") or {}).get("policy_ids", [])
    user_message = _compose_user_message(input_data, upstream_messages, selected_policy_ids)
    start = time.perf_counter()
    a2a_mode = (agent_config.get("a2a_mode") or "local").lower()
    remote_agent_card_url = (agent_config.get("remote_agent_card_url") or "").strip()

    logger.info("agent.invoke.start", agent_name=agent_name, framework=framework, step=step_number, model=model_name)

    try:
        if agent_config.get("a2a_enabled", True) and a2a_mode == "remote" and remote_agent_card_url:
            remote = await dispatch_remote_agent(
                agent_card_url=remote_agent_card_url,
                input_data=input_data,
                workflow_run_id=workflow_run_id,
                from_agent=agent_name,
                message_type="delegation",
            )
            remote_result = (remote.get("result") or {}).get("result") or {}
            remote_output = remote_result.get("output", remote_result)
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            return {
                "agent_name": agent_name,
                "framework": framework,
                "output": remote_output if isinstance(remote_output, dict) else {"result": remote_output},
                "tokens_used": remote_result.get("tokens_used", 0),
                "prompt_tokens": remote_result.get("prompt_tokens", 0),
                "completion_tokens": remote_result.get("completion_tokens", 0),
                "latency_ms": latency_ms,
                "tools_called": ["remote_agent_dispatch"],
                "status": remote_result.get("status", "success"),
                "error": remote_result.get("error"),
            }
        if framework == "langchain":
            raw = await _run_langchain(agent_name, system_prompt, model_name, enabled_tools, user_message, workflow_run_id, selected_policy_ids)
        elif framework == "crewai":
            raw = await _run_crewai(agent_name, system_prompt, model_name, enabled_tools, user_message, workflow_run_id, selected_policy_ids)
        elif framework == "agno":
            raw = await _run_agno(agent_name, system_prompt, model_name, enabled_tools, user_message, workflow_run_id, selected_policy_ids)
        else:
            raw = await _run_langgraph(agent_name, system_prompt, model_name, enabled_tools, user_message, workflow_run_id, selected_policy_ids)

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return {
            "agent_name": agent_name,
            "framework": framework,
            "output": _parse_output(raw.get("content", "")),
            "tokens_used": raw.get("tokens_used", 0),
            "prompt_tokens": raw.get("prompt_tokens", 0),
            "completion_tokens": raw.get("completion_tokens", 0),
            "latency_ms": latency_ms,
            "tools_called": raw.get("tools_called", []),
            "status": "success",
            "error": None,
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.error("agent.invoke.failed", agent_name=agent_name, framework=framework, error=str(exc), exc_info=True)
        return {
            "agent_name": agent_name,
            "framework": framework,
            "output": {},
            "tokens_used": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "latency_ms": latency_ms,
            "tools_called": [],
            "status": "failed",
            "error": str(exc),
        }
