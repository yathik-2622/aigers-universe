"""
Agent registry / runtime facade.

The raw hand-rolled OpenAI tool loop has been replaced with framework-native runners:
  - LangGraph via `create_react_agent`
  - LangChain via `create_agent`
  - CrewAI via `Crew` / `Task` / `Agent`
  - Agno via `Agent` / `OpenAIChat` when installed

This module keeps the shared tool schemas for UI/tool-chat usage and forwards
workflow execution into the framework runner layer.
"""

import structlog

from core.framework_runners import run_framework_agent

logger = structlog.get_logger(__name__)


TOOL_SCHEMAS: dict[str, dict] = {
    "semantic_search": {
        "type": "function",
        "function": {
            "name": "semantic_search",
            "description": "Search indexed documents using semantic similarity (Mongo vector store).",
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
    "knowledge_base_search": {
        "type": "function",
        "function": {
            "name": "knowledge_base_search",
            "description": "Search uploaded workspace documents as a reusable knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
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
    "wikipedia_search": {
        "type": "function",
        "function": {
            "name": "wikipedia_search",
            "description": "Search Wikipedia for background context and reference links.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "webpage_fetch": {
        "type": "function",
        "function": {
            "name": "webpage_fetch",
            "description": "Fetch a web page and return cleaned text content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "max_chars": {"type": "integer", "default": 5000},
                },
                "required": ["url"],
            },
        },
    },
    "weather_current": {
        "type": "function",
        "function": {
            "name": "weather_current",
            "description": "Fetch current weather from Open-Meteo using latitude and longitude.",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {"type": "number"},
                    "longitude": {"type": "number"},
                    "timezone": {"type": "string", "default": "auto"},
                },
                "required": ["latitude", "longitude"],
            },
        },
    },
    "openweather_current": {
        "type": "function",
        "function": {
            "name": "openweather_current",
            "description": "Fetch current weather from OpenWeather using configured API key.",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {"type": "number"},
                    "longitude": {"type": "number"},
                    "units": {"type": "string", "default": "metric"},
                },
                "required": ["latitude", "longitude"],
            },
        },
    },
    "serpapi_search": {
        "type": "function",
        "function": {
            "name": "serpapi_search",
            "description": "Fetch live search engine results through SerpAPI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "num": {"type": "integer", "default": 5},
                    "location": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    "official_docs_search": {
        "type": "function",
        "function": {
            "name": "official_docs_search",
            "description": "Search official docs across supported languages, frameworks, clouds, and databases. Use provider='all' for broad official-docs discovery.",
            "parameters": {
                "type": "object",
                "properties": {
                    "provider": {"type": "string", "enum": ["all", "auto", "java", "python", "spring", "dotnet", "react", "nextjs", "streamlit", "fastapi", "postgresql", "mysql", "mongodb", "docker", "kubernetes", "aws", "azure", "gcp"]},
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "java_docs_search": {
        "type": "function",
        "function": {
            "name": "java_docs_search",
            "description": "Search official Oracle Java documentation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "python_docs_search": {
        "type": "function",
        "function": {
            "name": "python_docs_search",
            "description": "Search official Python documentation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "spring_docs_search": {
        "type": "function",
        "function": {
            "name": "spring_docs_search",
            "description": "Search official Spring documentation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "dotnet_docs_search": {
        "type": "function",
        "function": {
            "name": "dotnet_docs_search",
            "description": "Search official .NET documentation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    "remote_agent_discover": {
        "type": "function",
        "function": {
            "name": "remote_agent_discover",
            "description": "Fetch a remote A2A agent card over HTTP.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_card_url": {"type": "string"},
                },
                "required": ["agent_card_url"],
            },
        },
    },
    "remote_agent_dispatch": {
        "type": "function",
        "function": {
            "name": "remote_agent_dispatch",
            "description": "Dispatch work to a remote A2A agent over HTTP.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_card_url": {"type": "string"},
                    "input_data": {"type": "object"},
                    "workflow_run_id": {"type": "string"},
                    "from_agent": {"type": "string"},
                    "message_type": {"type": "string", "enum": ["delegation", "context", "alert", "result"]},
                },
                "required": ["agent_card_url", "input_data", "workflow_run_id", "from_agent"],
            },
        },
    },
    "policy_library_search": {
        "type": "function",
        "function": {
            "name": "policy_library_search",
            "description": "Search uploaded and stored policy documents for relevant policy guidance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "policy_ids": {"type": "array", "items": {"type": "string"}},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
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


async def invoke_agent_by_id(
    agent_config: dict,
    input_data: dict,
    workflow_run_id: str,
    step_number: int,
    upstream_messages: list[dict] | None = None,
    max_tool_iterations: int = 5,
) -> dict:
    return await run_framework_agent(
        agent_config=agent_config,
        input_data=input_data,
        workflow_run_id=workflow_run_id,
        step_number=step_number,
        upstream_messages=upstream_messages,
    )
