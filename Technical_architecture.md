# AIger's Universe Technical Architecture

## 1. What This Platform Is

AIger's Universe is a multi-agent orchestration platform for enterprise AI workflows. It combines:

- visual workflow composition in ReactFlow
- framework-native agent execution for LangGraph, LangChain, CrewAI, and Agno
- MCP-based tool access
- A2A-based agent interoperability
- KB retrieval over MongoDB documents + Mongo vector chunks
- run-scoped workflow inputs
- HITL approvals
- live run streaming and observability

It is positioned as an enterprise-grade agent engineering workbench rather than a single-purpose chatbot.

---

## 2. System Topology

### 2.1 Runtime surfaces

- `frontend/`
  - React + Vite SPA
  - route-driven application shell
  - builder, marketplace, agents, run monitoring, MCP Studio, projects, admin
- `backend/`
  - FastAPI application
  - MCP server registration
  - MongoDB persistence
  - Mongo vector retrieval
  - LLM gateway access

### 2.2 Primary interaction model

1. User authenticates.
2. User installs or creates agents.
3. User builds a workflow manually or via orchestrator.
4. User attaches KB context and run-scoped workflow inputs.
5. Backend executes agents sequentially.
6. Agents call MCP tools when needed.
7. Each step persists traces, outputs, A2A messages, and HITL state.
8. Run page streams status via SSE.
9. Final report is synthesized and persisted.

---

## 3. Startup Sequence

Entrypoint: [backend/main.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/main.py:1>)

### 3.1 Lifespan flow

`lifespan()` executes:

1. `connect_db()`
2. `run_seed()`
3. `cleanup_expired_workflow_inputs()`
4. `register_all_tools()`

### 3.2 FastAPI middleware

- `CORSMiddleware`
- `RequestLoggingMiddleware`

### 3.3 Mounted routers

- `/api/platform`
- `/api/workflows`
- `/api/hitl`
- `/api/observability`
- `/api/marketplace`
- `/api/documents`
- `/api/auth`
- `/api/policies`
- `/api/projects`
- `/api/admin`
- `/api/tool-chat`
- `/api/a2a`

### 3.4 MCP exposure

- `fastapi-mcp` mounts the app-level MCP endpoint
- `fastmcp` registers tool handlers from `mcp_tools/tool_server.py`

---

## 4. Configuration, Security, and Request Scope

### 4.1 Configuration

Source: [backend/config.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/config.py:1>)

Important settings:

- LLM gateway:
  - `LLM_BASE_URL`
  - `LLM_API_KEY`
  - `LLM_MODEL`
  - `EMBEDDING_MODEL`
- persistence:
  - `MONGO_URL`
  - `DB_NAME`
  - `MONGO_VECTOR_INDEX_NAME`
- auth and access:
  - `JWT_SECRET`
  - `JWT_EXPIRES_HOURS`
  - `ADMIN_EMAILS`
- agentic transport:
  - `A2A_SHARED_SECRET`
  - `A2A_PUBLIC_BASE_URL`
- workflow input limits:
  - `WORKFLOW_INPUT_RETENTION_DAYS`
  - `WORKFLOW_INPUT_MAX_FILES`
  - `WORKFLOW_INPUT_MAX_TOTAL_BYTES`
  - `WORKFLOW_INPUT_MAX_TEXT_CHARS`

### 4.2 Token model

Source: [backend/core/security.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/security.py:1>)

Auth uses a lightweight JWT-like token implementation:

- header + payload are base64url encoded
- signature is HMAC-SHA256 over `header.payload`
- `decode_access_token()` validates:
  - format
  - signature
  - expiry

### 4.3 Request scoping

Source: [backend/core/request_context.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/request_context.py:1>)

Used by routers to derive:

- `get_optional_user_id()`
- `get_optional_role()`
- `require_user_id()`
- `require_admin()`

This is how agents, documents, workflows, and projects are scoped per user.

---

## 5. Data Layer

### 5.1 MongoDB

Client: [backend/db/mongo_client.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/mongo_client.py:1>)

Main collections:

- `agents`
- `workflow_definitions`
- `workflow_runs`
- `agent_traces`
- `hitl_records`
- `a2a_messages`
- `documents`
- `governance_rules`
- `marketplace_templates`
- `projects`
- `users`

### 5.2 Repository classes

- [agent_repo.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/repositories/agent_repo.py:1>)
- [document_repo.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/repositories/document_repo.py:1>)
- [trace_repo.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/repositories/trace_repo.py:1>)
- [workflow_repo.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/repositories/workflow_repo.py:1>)

These abstract common CRUD patterns but some routers still query `get_db()` directly for flexibility.

### 5.3 Seed model

Source: [backend/db/seed.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/db/seed.py:1>)

`run_seed()` upserts:

- marketplace agent templates
- governance rules

It also supports deduplication of installed agents tied to templates.

---

## 6. Knowledge and Retrieval Architecture

### 6.1 Mongo vector store

Source: [mongo_vector_store.py](/C:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/vectorstore/mongo_vector_store.py:1)

Algorithm:

- chunk text
- embed each chunk through `get_embedding()`
- store embeddings in Mongo `vector_chunks`
- persist metadata alongside vector positions

Atlas vector search is preferred when available, with in-app cosine fallback otherwise.

### 6.2 Two context planes

AIger's Universe separates:

- reusable knowledge base context
  - indexed into Mongo vector chunks
  - used by `knowledge_base_search`
- run-scoped workflow inputs
  - stored in MongoDB only
  - not indexed into reusable KB

This is one of the platform's key architecture decisions.

### 6.3 Document handling

Document ingestion lives in [backend/api/document_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/document_router.py:1>)

Capabilities:

- upload files into KB
- import GitHub repo into KB
- upload workflow-scoped files
- import workflow-scoped GitHub repo
- cleanup expired workflow inputs

Workflow inputs are hydrated in [workflow_engine.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/workflow_engine.py:46>) by `_hydrate_workflow_inputs()`.

---

## 7. LLM Architecture

### 7.1 Gateway wrapper

Source: [backend/core/llm_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/llm_router.py:1>)

Core functions:

- `chat_completion()`
- `get_embedding()`

### 7.2 Retry behavior

`chat_completion()` retries on:

- rate limits
- timeouts

It records:

- total tokens
- prompt tokens
- completion tokens
- latency
- resolved model

### 7.3 How LLMs are used

LLM calls are used for:

- agent execution
- report generation
- orchestration planning
- risk scoring
- rules evaluation
- policy-guided synthesis

---

## 8. Agent Runtime Architecture

### 8.1 Agent registration

Platform CRUD router:
[backend/api/platform_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/platform_router.py:1>)

Supports:

- create
- list
- fetch
- update
- deactivate
- direct invoke
- code export

### 8.2 Agent invocation path

The execution chain is:

1. workflow engine or direct invoke loads agent config
2. [core/agent_registry.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/agent_registry.py:1>) validates framework/tools
3. [core/framework_runners.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/framework_runners.py:1>) dispatches to:
   - `_run_langgraph()`
   - `_run_langchain()`
   - `_run_crewai()`
   - `_run_agno()`
4. tool calls go through `TOOL_REGISTRY`
5. result is returned with output, tools called, latency, token usage

### 8.3 Framework-native behavior

This is not a single fake loop with framework labels. The platform keeps framework-specific runner branches and code export paths.

### 8.4 Agent export

Source: [backend/core/agent_code_export.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/agent_code_export.py:1>)

Export targets:

- LangGraph Python
- LangChain Python
- CrewAI Python
- Agno Python
- Langflow-style JSON

---

## 9. Workflow Architecture

### 9.1 Workflow definitions

Router: [backend/api/workflow_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/workflow_router.py:1>)

Definition fields:

- `name`
- `description`
- `project_id`
- `agents`
- `policy_ids`
- `canvas`

### 9.2 Auto-build orchestration

The planner endpoint is `POST /api/workflows/auto-build`.

Important functions:

- `_normalized()`
- `_tokenize()`
- `_score_inventory_match()`
- `_fallback_step_templates()`
- `_llm_auto_plan()`
- `_resolve_auto_plan()`
- `_build_canvas_nodes()`

#### Planning algorithm

1. summarize installed agents
2. summarize marketplace templates
3. ask LLM to return a strict JSON plan
4. validate installed agent IDs and template IDs
5. prefer installed agents
6. if missing and `auto_install_missing=True`, install template-backed agents
7. generate nodes + edges
8. return build-ready plan

#### Fallback heuristic

If LLM planning fails:

- token overlap scoring is used
- domain keywords map to known templates
- result is constrained to 2 to 5 steps

### 9.3 Workflow execution

Execution core: [backend/core/workflow_engine.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/workflow_engine.py:1>)

Important functions:

- `_hydrate_workflow_inputs()`
- `_compose_agent_input()`
- `_resolve_agent_configs()`
- `_wait_for_hitl_resume()`
- `_execute_agent_step()`
- `_finalize_run()`
- `_run_workflow_steps()`
- `_next_step_index()`
- `build_and_run_workflow()`
- `resume_workflow_run()`

#### Execution algorithm

1. load workflow definition
2. load agent configs
3. resolve node-level overrides from canvas
4. validate workflow input limits
5. persist `workflow_runs` row
6. `asyncio.create_task()` launches execution
7. for each step:
   - set current step
   - collect upstream A2A messages
   - compose scoped input payload
   - invoke framework runner
   - record trace
   - persist agent result
   - send A2A `result` message
8. if HITL pauses:
   - wait on resume signal
9. after final step:
   - mark terminal output
   - build report
   - persist markdown, structured report, citations, pii findings

#### Node-level input binding algorithm

`_compose_agent_input()` applies booleans for:

- `include_text_input`
- `include_uploaded_files`
- `include_github_repo`
- `include_knowledge_base`
- `include_upstream_outputs`

This lets the same installed agent behave differently per node.

### 9.4 Why the run-page report race happened

In `_finalize_run()`, the run is marked `completed` before the report persistence is guaranteed to finish. That means the frontend can observe terminal status before `report_markdown` is ready.

Fix implemented:

- new endpoint `GET /api/workflows/runs/{run_id}/report-materialized`
- if `report_markdown` is empty, the backend calls `build_run_report()` on demand, persists it, and returns it

This removes the race between terminal status and report availability.

---

## 10. Report Generation Architecture

Source: [backend/core/report_builder.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/report_builder.py:1>)

Key functions:

- `_line_map()`
- `_find_pii()`
- `_fallback_markdown()`
- `build_run_report()`

### 10.1 Algorithms used

#### PII detection

Regex-based detection for:

- email
- phone number
- SSN
- credit card

#### Fallback report generation

If structured LLM synthesis fails:

- markdown is composed directly from outputs
- each agent output is rendered as JSON block
- policy set and PII redlines are still included

#### LLM synthesis

`build_run_report()` sends:

- workflow metadata
- policy set
- final output
- upstream outputs
- run-scoped workflow inputs
- line-mapped document text
- detected PII

Expected structured output:

- `executive_summary`
- `overall_decision`
- `redlines`
- `pii_findings`
- `policy_recommendations`
- `next_actions`
- `citations`
- `markdown`

---

## 11. MCP Tool Architecture

Source: [backend/mcp_tools/tool_server.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/mcp_tools/tool_server.py:1>)

Tool registration starts with:

- `mcp = FastMCP(...)`
- `register_all_tools()`

### 11.1 Tool catalog

- `semantic_search`
  - Atlas vector search or exact cosine similarity over Mongo chunks
- `knowledge_base_search`
  - KB-oriented semantic retrieval
- `document_store`
  - CRUD over agent-scoped Mongo collections
- `rules_engine_check`
  - LLM-based governance validation
- `policy_library_search`
  - searches governance/policy material
- `risk_scorer`
  - LLM-derived risk level + score
- `wikipedia_search`
  - public background search
- `weather_current`
  - Open-Meteo live weather
- `openweather_current`
  - OpenWeather live weather
- `serpapi_search`
  - search engine integration
- `webpage_fetch`
  - fetches and cleans page content
- `official_docs_search`
  - provider-scoped official docs search
- `java_docs_search`
- `python_docs_search`
- `spring_docs_search`
- `dotnet_docs_search`
- `remote_agent_discover`
  - fetches remote A2A cards
- `remote_agent_dispatch`
  - delegates work to remote A2A agents
- `trigger_hitl`
  - pauses workflow for human decision

### 11.2 Search algorithm note

Official-doc search uses DuckDuckGo result extraction plus webpage fetch/cleanup. It is a pragmatic search-retrieval layer, not a local documentation index.

---

## 12. A2A Architecture

Files:

- [backend/a2a/agent_communication.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/a2a/agent_communication.py:1>)
- [backend/api/a2a_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/a2a_router.py:1>)

### 12.1 Core functions

- `build_agent_card()`
- `send_a2a_message()`
- `get_a2a_messages()`
- `fetch_remote_agent_card()`
- `dispatch_remote_agent()`

### 12.2 Network endpoints

- `GET /api/a2a/agents/cards`
- `GET /api/a2a/agents/{agent_id}/card`
- `POST /api/a2a/agents/{agent_id}/invoke`
- `POST /api/a2a/validate-card`

### 12.3 Message model

Each message stores:

- `message_id`
- `workflow_run_id`
- `from_agent`
- `to_agent`
- `message_type`
- `payload`
- `correlation_id`
- `timestamp`

### 12.4 Current reality

This is real network-capable A2A over HTTP, but not yet a full federated marketplace of external remote workers with dynamic trust, routing policy, and tenancy contracts.

---

## 13. HITL Architecture

Core path:

- tool call: `trigger_hitl`
- persistence: `hitl_records`
- run status becomes paused
- resume path:
  - [backend/api/hitl_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/hitl_router.py:1>)
  - `resume_signals`
  - `_wait_for_hitl_resume()`

Timeout is enforced with `HITL_TIMEOUT_SECONDS`.

---

## 14. Observability Architecture

Core file: [backend/observability/tracer.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/observability/tracer.py:1>)

Main function:

- `record_trace()`

Captured telemetry:

- workflow run id
- owner id
- agent id and name
- framework
- step number
- input summary
- full output
- token usage
- latency
- tools called
- status
- error

UI surface:

- [frontend/src/pages/ObservabilityPage.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/pages/ObservabilityPage.jsx:1>)

---

## 15. Frontend Architecture

### 15.1 Shell

- [src/App.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/App.jsx:1>)
- [src/context/AuthContext.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/context/AuthContext.jsx:1>)
- [src/context/TitleContext.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/context/TitleContext.jsx:1>)
- `Header`
- `Sidebar`

### 15.2 Main pages

- `LandingPage`
- `LoginPage`
- `Dashboard`
- `ProjectsPage`
- `MarketplacePage`
- `AgentsPage`
- `WorkflowBuilderPage`
- `WorkflowRunPage`
- `ToolPlaygroundPage`
- `HITLPage`
- `ObservabilityPage`
- `AdminPage`

### 15.3 Builder UX internals

Key components:

- [WorkflowCanvas.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/components/flow/WorkflowCanvas.jsx:1>)
- `AgentNode`
- `AgentConfigPanel`
- `DocumentViewerModal`
- `ModalShell`

Builder now supports:

- manual drag and drop
- orchestrator auto-build
- planner modal with `Accept / Edit / Replan / Reject`
- slow-build animation
- guided camera focus on current node

### 15.4 Run-page UX internals

`WorkflowRunPage` now supports:

- SSE stream + polling fallback
- report preparation state
- materialized report fetching
- expandable A2A messages
- focus-following current active node

### 15.5 Rendering helpers

- [CodeSnippet.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/components/common/CodeSnippet.jsx:1>)
- [MarkdownReport.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/components/common/MarkdownReport.jsx:1>)

`CodeSnippet` uses a lightweight tokenizer for:

- keywords
- strings
- numbers
- comments

`MarkdownReport` now routes fenced code blocks into `CodeSnippet`.

---

## 16. What The Platform Can Achieve Today

### 16.1 Strong current use cases

- enterprise contract review
- compliance and policy review
- modernization assessment
- migration planning
- repo structure analysis
- architecture summarization
- risk-led remediation planning
- official-doc-assisted transformation research
- human-gated enterprise workflows

### 16.2 What it can produce right now

- structured findings
- architecture maps
- prioritized migration plans
- risk boards
- redline suggestions
- report markdown
- citations
- A2A audit trail
- run telemetry

### 16.3 Honest limitation

Out of the box, the platform does not yet:

- create a brand-new GitHub repository with migrated code
- write a full translated codebase back to GitHub automatically
- transform an entire Java repo into a complete Python repo artifact without additional code-generation and repo-write tooling

It can already analyze the source repo, infer architecture, map modules, generate migration plans, and produce structured equivalent targets. To make it create a real output repo, it needs:

1. code-generation worker agents that emit file-by-file outputs
2. a writable repo tool or GitHub connector
3. a repo assembly pipeline
4. validation/test runners
5. optional PR creation or branch publishing

### 16.4 Java repo to Python repo question

Current answer:

- the platform can plan and reason over the Java repo
- it can identify Python equivalents, module mappings, and migration phases
- it does not yet automatically publish a translated Python repository to GitHub

### 16.5 MySQL schema to PostgreSQL schema question

Current answer:

- yes, this is a strong achievable use case conceptually
- the platform can inspect a schema artifact and produce migration guidance and transformed SQL patterns
- but full schema conversion and delivery as a validated PostgreSQL repo/file set still needs explicit code-generation + artifact-write tooling

---

## 17. Market Landscape and Commercial Scope

### 17.1 Why this category matters

McKinsey estimated generative AI could add the equivalent of USD 2.6 trillion to USD 4.4 trillion in annual value across the global economy, with strong impact in knowledge work and software-related functions [1]. McKinsey also notes AI adoption has more than doubled over the past five years [2].

### 17.2 Relevant market categories

- Enterprise agentic AI:
  Grand View Research says the enterprise agentic AI market was estimated at USD 2.58 billion in 2024 and is projected to reach USD 24.50 billion by 2030 at a 46.2% CAGR [3].
- Application modernization services:
  Grand View Research says this market is projected to reach USD 52.46 billion by 2030, growing at 16.7% CAGR from 2024 to 2030 [4].
- Workflow management systems:
  Grand View Research says the workflow management systems market is expected to reach USD 86.63 billion by 2030, with 33.3% CAGR [5].
- Intelligent process automation:
  Grand View Research estimates USD 14.55 billion in 2024 growing to USD 44.74 billion by 2030 [6].

### 17.3 Competitive reference set

Representative adjacent products:

- Langflow emphasizes visual AI workflow building and MCP connectivity [7]
- Dify positions itself as a production-ready agentic workflow builder [8]
- n8n focuses on workflow automation with growing AI automation support [9]
- CrewAI focuses on enterprise multi-agent systems and agent operations [10]

### 17.4 Where AIger's Universe is differentiated

Compared with many visual builders, this platform already combines:

- multi-framework agents
- workflow planner + drag-and-drop builder
- A2A + MCP in the same product
- KB and run-scoped inputs as separate context planes
- HITL
- observability
- remote card validation
- migration-focused marketplace templates

That combination is commercially strong for:

- enterprise modernization programs
- regulated document review
- internal AI platforms
- consulting accelerators
- platform engineering teams

---

## 18. How To Pitch This To Clients and Judges

### 18.1 One-line pitch

"AIger's Universe is an enterprise agent engineering platform that turns AI workflows from isolated prompts into governed, observable, multi-agent operating systems."

### 18.2 Client pitch

Focus on outcomes:

- reduce time spent on migration discovery and analysis
- keep human approval where risk matters
- centralize tools, KB, and audit trails
- move from prototype AI to operational AI
- support multiple agent frameworks without locking teams into one stack

### 18.3 Judge pitch

Focus on depth, not just UI:

- real framework-native agents
- real MCP tool layer
- real network A2A routes
- real HITL pause/resume
- real persistence and observability
- real planner-backed workflow generation

### 18.4 "Why this deserves first prize"

1. It solves a real enterprise problem, not a demo-only novelty.
2. It integrates architecture, governance, tooling, orchestration, and observability in one system.
3. It supports modernization and compliance, two high-value client-facing domains.
4. It is extensible into code migration, schema migration, remote agent marketplaces, and enterprise connectors.
5. It demonstrates both product thinking and systems engineering depth.

---

## 19. What To Build Next For Maximum Impact

### 19.1 Highest-value engineering additions

- repo-write execution layer for generated artifacts
- GitHub branch and PR publishing
- file-level migration workers
- test generation and verification loop
- schema migration compiler for MySQL to PostgreSQL
- remote agent trust policies and tenancy controls
- cost budgets per workflow
- approval policies per node type

### 19.2 Best commercial add-ons

- industry solution packs
- domain templates for BFSI, healthcare, telecom, public sector
- enterprise SSO and RBAC hardening
- audit export and compliance evidence packs
- reusable organization-level template registry

---

## 20. Source Links

1. McKinsey, "The economic potential of generative AI: The next productivity frontier"
   https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/The-economic-potential-of-generative-AI-The-next-productivity-frontier
2. McKinsey explainer on generative AI adoption context
   https://www.mckinsey.com/featured-insights/mckinsey-explainers/what-is-generative-ai/
3. Grand View Research, Enterprise Agentic AI Market
   https://www.grandviewresearch.com/industry-analysis/enterprise-agentic-ai-market-report
4. Grand View Research, Application Modernization Services Market press summary
   https://www.grandviewresearch.com/press-release/global-application-modernization-services-market
5. Grand View Research, Workflow Management Systems Market press summary
   https://www.grandviewresearch.com/press-release/global-workflow-management-systems-market
6. Grand View Research, Intelligent Process Automation Market
   https://www.grandviewresearch.com/industry-analysis/intelligent-process-automation-market
7. Langflow documentation
   https://docs.langflow.org/
8. Dify official site
   https://dify.ai/
9. n8n official site
   https://n8n.io/
10. CrewAI official site
   https://crewai.com/
