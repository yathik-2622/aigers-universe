import json

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from config import settings
from core.agent_registry import TOOL_SCHEMAS
from core.request_context import require_user_id
from core.llm_router import _client
from mcp_tools.tool_server import TOOL_REGISTRY

router = APIRouter()
SAFE_TOOL_NAMES = [name for name in TOOL_REGISTRY.keys() if name != "trigger_hitl"]


class ToolChatRequest(BaseModel):
    messages: list[dict] = Field(default_factory=list)
    preferred_tool: str | None = Field(default=None)


async def _invoke_tool(name: str, args: dict) -> dict:
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return {"error": f"Unknown tool '{name}'"}
    return await fn(**args)


@router.post("/message")
async def tool_chat(request: Request, body: ToolChatRequest):
    require_user_id(request)
    tools_payload = [TOOL_SCHEMAS[name] for name in SAFE_TOOL_NAMES if name in TOOL_SCHEMAS]
    resp = await _client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=body.messages or [{"role": "user", "content": "List available tools and what they do."}],
        tools=tools_payload,
        tool_choice={"type": "function", "function": {"name": body.preferred_tool}} if body.preferred_tool in SAFE_TOOL_NAMES else "auto",
        temperature=0.2,
    )
    msg = resp.choices[0].message
    tool_results = []
    if msg.tool_calls:
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            result = await _invoke_tool(tc.function.name, args)
            tool_results.append({"tool": tc.function.name, "args": args, "result": result})
    content = msg.content or ""
    if tool_results and not content:
        followup_messages = list(body.messages)
        followup_messages.append({
            "role": "assistant",
            "content": "",
            "tool_calls": [{"id": f"call_{i}", "type": "function", "function": {"name": t["tool"], "arguments": json.dumps(t["args"])}} for i, t in enumerate(tool_results)],
        })
        for i, item in enumerate(tool_results):
            followup_messages.append({"role": "tool", "tool_call_id": f"call_{i}", "content": json.dumps(item["result"], default=str)})
        second = await _client.chat.completions.create(model=settings.LLM_MODEL, messages=followup_messages, temperature=0.2)
        content = second.choices[0].message.content or ""
    return {"reply": content, "tool_results": tool_results}
