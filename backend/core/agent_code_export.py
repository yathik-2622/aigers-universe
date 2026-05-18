import json
import textwrap


def _py_list(items: list[str]) -> str:
    return "[" + ", ".join(json.dumps(item) for item in items) + "]"


def export_agent_code(agent: dict, framework: str | None = None) -> tuple[str, str]:
    target = (framework or agent.get("framework") or "langgraph").lower()
    if target == "langflow":
        payload = {
            "data": {
                "name": agent.get("name"),
                "description": agent.get("description", ""),
                "model": agent.get("model_name", "gpt-4o"),
                "instructions": agent.get("system_prompt", ""),
                "tools": agent.get("tools", []),
                "framework": "langflow",
            }
        }
        return json.dumps(payload, indent=2), "json"

    code = _python_template(agent, target)
    return code, "py"


def _python_template(agent: dict, framework: str) -> str:
    name = agent.get("name", "Agent")
    model = agent.get("model_name", "gpt-4o")
    tools = agent.get("tools", [])
    prompt = agent.get("system_prompt", "")
    description = agent.get("description", "")

    if framework == "crewai":
        return textwrap.dedent(f"""
        from crewai import Agent

        {name.replace(" ", "_").lower()} = Agent(
            role={json.dumps(name)},
            goal={json.dumps(description or "Execute the assigned enterprise workflow reliably.")},
            backstory={json.dumps(prompt)},
            llm={json.dumps(model)},
            tools=[],  # Wire MCP tool adapters here
            allow_delegation=True,
            verbose=True,
        )
        """).strip()

    if framework == "langchain":
        return textwrap.dedent(f"""
        from langchain_openai import ChatOpenAI
        from langchain_core.prompts import ChatPromptTemplate

        llm = ChatOpenAI(model={json.dumps(model)})
        prompt = ChatPromptTemplate.from_messages([
            ("system", {json.dumps(prompt)}),
            ("human", "{{input}}"),
        ])
        chain = prompt | llm
        # Tools configured for this agent: {_py_list(tools)}
        """).strip()

    if framework == "agno":
        return textwrap.dedent(f"""
        from agno.agent import Agent
        from agno.models.openai import OpenAIChat

        agent = Agent(
            name={json.dumps(name)},
            model=OpenAIChat(id={json.dumps(model)}),
            instructions={json.dumps(prompt)},
            tools=[],  # Add MCP-compatible tool wrappers here
            markdown=True,
            add_datetime_to_instructions=True,
        )
        """).strip()

    return textwrap.dedent(f"""
    from typing import TypedDict
    from langgraph.graph import StateGraph, END
    from langchain_openai import ChatOpenAI

    class AgentState(TypedDict, total=False):
        input_text: str
        output_text: str

    llm = ChatOpenAI(model={json.dumps(model)})

    def run_agent(state: AgentState) -> AgentState:
        system_prompt = {json.dumps(prompt)}
        response = llm.invoke([
            {{"role": "system", "content": system_prompt}},
            {{"role": "user", "content": state.get("input_text", "")}},
        ])
        return {{"output_text": response.content}}

    graph = StateGraph(AgentState)
    graph.add_node("run_agent", run_agent)
    graph.set_entry_point("run_agent")
    graph.add_edge("run_agent", END)
    compiled = graph.compile()

    # Tools configured for this agent: {_py_list(tools)}
    # Agent description: {json.dumps(description)}
    """).strip()
