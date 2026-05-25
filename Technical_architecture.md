# AIger's Universe Technical Architecture

## 1. Platform intent

AIger's Universe is a multi-agent engineering platform for teams that need more than a single chat box. It combines:

- framework-native agent registration and runtime execution
- visual workflow composition in ReactFlow
- prompt-driven workflow auto-planning through an orchestrator
- reusable knowledge-base ingestion and retrieval
- run-scoped workflow inputs that do not leak into long-lived memory
- A2A interoperability and MCP tool access
- HITL approvals
- trace, token, latency, and cost observability
- grounded AIger Copilot chat modes with openable citations

The product is designed as an operations-grade workbench. The core architectural theme is explicitness: explicit state, explicit ownership, explicit evidence, and explicit runtime boundaries.

---

## 2. System topology

### 2.1 Frontend

The frontend is a Vite + React 18 SPA with route-driven product surfaces:

- `/dashboard`
- `/projects`
- `/marketplace`
- `/agents`
- `/builder`
- `/runs/:runId`
- `/tools-chat`
- `/knowledge-base`
- `/knowledge-graph`
- `/hitl`
- `/observability`
- `/platform-docs`
- `/settings`
- `/admin`

Key frontend technologies:

- React 18
- React Router 6
- Tailwind CSS
- ReactFlow
- Recharts
- Three.js for the legacy graph canvas
- Sonner for toasts

### 2.2 Backend

The backend is a FastAPI application that owns:

- auth and request scope
- workflow planning
- workflow execution
- framework-native agent invocation
- document parsing and vector storage
- observability traces
- project scoping
- admin policies
- A2A endpoints
- MCP exposure

Key backend technologies:

- FastAPI
- Motor / MongoDB
- FastMCP
- FastAPI-MCP
- LangGraph
- LangChain
- CrewAI
- Agno
- OpenAI-compatible chat and embedding gateway access

---

## 3. Startup and runtime lifecycle

Entrypoint: [backend/main.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/main.py:1>)

### 3.1 Lifespan sequence

On application startup, the backend:

1. connects to MongoDB
2. seeds marketplace templates and governance records
3. cleans expired workflow inputs
4. registers MCP tools

### 3.2 Middleware and mounted routers

Core middleware includes:

- CORS
- request logging

Mounted routers include:

- `/api/auth`
- `/api/platform`
- `/api/workflows`
- `/api/hitl`
- `/api/observability`
- `/api/marketplace`
- `/api/documents`
- `/api/projects`
- `/api/admin`
- `/api/tool-chat`
- `/api/a2a`

### 3.3 Runtime interaction model

The dominant product flow is:

1. user authenticates
2. user installs or creates agents
3. user plans a workflow manually or with the orchestrator
4. user attaches workflow inputs and optionally KB context
5. backend executes the workflow step by step
6. agents call tools or remote agents when needed
7. traces, A2A messages, HITL state, and outputs persist continuously
8. run view streams progress and final report availability

---

## 4. Security, identity, and request scope

### 4.1 Token model

Source: [backend/core/security.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/security.py:1>)

Auth uses an HMAC-signed token model. Token decode validates:

- structure
- signature
- expiry

Expired tokens now fail gracefully in optional request-context reads so stale browser state does not crash unrelated routes.

### 4.2 Request-scope helpers

Source: [backend/core/request_context.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/request_context.py:1>)

The request-context layer exposes:

- `get_optional_user_id()`
- `get_optional_role()`
- `require_user_id()`
- `require_admin()`

This is how workflows, documents, private KB retrieval, project membership, and admin actions stay scoped correctly.

---

## 5. Data model and persistence

### 5.1 MongoDB collections

Core collections include:

- `agents`
- `workflow_definitions`
- `workflow_runs`
- `agent_traces`
- `hitl_records`
- `a2a_messages`
- `documents`
- `vector_chunks`
- `projects`
- `users`
- `marketplace_templates`
- `governance_rules`

### 5.2 Persistence principle

This platform persists operational state aggressively. Important workflow facts should survive:

- logout
- refresh
- backend restart
- delayed human approval

That principle explains why runs, traces, A2A messages, reports, and HITL records are persisted rather than being treated as UI-only session state.

---

## 6. Agent architecture

### 6.1 Agent records

Source: [backend/api/platform_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/platform_router.py:1>)

Agent definitions persist:

- name
- framework
- description
- system prompt
- model name
- allowed tools
- HITL enablement
- tags
- A2A settings

### 6.2 Framework-native runners

Source: [backend/core/framework_runners.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/framework_runners.py:1>)

Runtime dispatch is not a fake single loop with cosmetic framework labels. The platform keeps distinct branches for:

- LangGraph
- LangChain
- CrewAI
- Agno

This matters because:

- exported code needs to match real runtime behavior
- tool wiring differs by framework
- teams want truthful framework alignment, not branding-only support

### 6.3 Agent export

Source: [backend/core/agent_code_export.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/agent_code_export.py:1>)

Exports are available for:

- LangGraph Python
- LangChain Python
- CrewAI Python
- Agno Python
- Langflow-style JSON

---

## 7. Workflow builder and orchestrator architecture

### 7.1 Frontend composition model

Source: [frontend/src/pages/WorkflowBuilderPage.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/pages/WorkflowBuilderPage.jsx:1>)

The Builder page combines:

- an agent library rail
- workflow input controls
- KB controls
- a ReactFlow canvas
- a planner review modal
- a live orchestrator log

This page supports two authoring styles:

- visual drag-drop composition
- intent-driven automatic planning

### 7.2 Orchestrator planner behavior

Source: [backend/api/workflow_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/workflow_router.py:1>)

The planner:

1. interprets the user goal
2. checks installed agent inventory
3. checks marketplace template coverage
4. optionally installs missing templates
5. proposes custom agent drafts when installed and marketplace coverage are still insufficient
6. performs best-effort market research using available research tools
7. returns an executable workflow plan, citations, architecture summary, reusable orchestrator prompt, and HITL checkpoints

### 7.3 Orchestrator activity stream

The Builder now exposes a right-side floating activity stream that:

- types entries progressively
- shows the exact current phase while the plan is running
- stays sharp instead of blurred
- collapses after acceptance
- can be reopened via the `Orchestrator log` button

The stream is a UX layer over real planner and build phases, not a fake animation-only placeholder.

### 7.4 Workflow execution model

Source: [backend/core/workflow_engine.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/workflow_engine.py:1>)

Execution responsibilities include:

- hydrating workflow inputs
- ordering nodes
- passing upstream context
- invoking framework-native agent runners
- persisting traces
- writing A2A messages
- handling pause, resume, and stop
- materializing reports

Workflow runs are resume-safe because state is persisted rather than kept only in process memory.

---

## 8. Knowledge architecture

### 8.1 Two memory planes

One of the most important product decisions is the split between:

- reusable KB context
- run-scoped workflow inputs

Reusable KB context:

- is indexed into vector chunks
- is searchable later
- supports public/private visibility rules

Run-scoped workflow inputs:

- live only for the workflow input lifecycle
- are stored in MongoDB but not indexed into long-lived reusable search by default
- are intended for per-run prompts, files, and repo snapshots

This prevents accidental contamination of the long-lived knowledge base.

### 8.2 Ingest pipeline

Source: [backend/api/document_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/document_router.py:1>)

Knowledge Ingest supports:

- file uploads
- GitHub repo import
- shared metadata controls for files and repos
- duplicate detection
- visibility management
- async embedding

Duplicate behavior is content-hash based, not filename based.

Examples of enforced rules:

- public duplicates are blocked across users
- private duplicates are evaluated relative to the same owner
- if a user tries to re-upload a private document publicly, the UI guides them toward changing the existing visibility instead

### 8.3 Parser and chunking strategy

Document processing uses parser specialization by file type, then chunking strategy by content shape.

Chunking strategies include:

- `section-aware-large`
- `page-based-large`
- `sliding-window`
- `code-aware`
- `table-first`
- `markdown`
- `semantic-topic`

The current implementation also uses recursive section-aware splitting patterns for many documentation-heavy sources.

### 8.4 Vector persistence

Source: [backend/vectorstore/mongo_vector_store.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/vectorstore/mongo_vector_store.py:1>)

Chunk vectors are:

1. embedded through the configured embedding model
2. stored in MongoDB `vector_chunks`
3. tagged with document and chunk metadata

Mongo Atlas vector search is preferred when configured. The backend falls back to in-app cosine scoring when Atlas search is unavailable.

---

## 9. AIger Copilot grounding architecture

### 9.1 Modes

Source: [backend/core/chat_grounding.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/core/chat_grounding.py:1>)

AIger Copilot has three governed modes:

- `AIger Copilot`
- `Knowledgebase RAG`
- `General Reasoning`

Mode boundaries are strict:

- platform mode can answer only from live repo markdown and HTML platform content
- KB mode can use platform content plus public KB plus the current user's private KB
- general mode can use public KB and broader tools but not any private KB

### 9.2 Retriever stack

The KB pipeline applies:

1. query rewriting / MultiQuery recall expansion
2. similarity scoring
3. MMR reranking
4. contextual compression
5. grounded answer synthesis with citations

This aims to balance recall and concision. It broadens retrieval without dumping all retrieved text into the final answer.

### 9.3 Citation model

Citations are now openable, not label-only.

The UI can open:

- repo markdown and HTML source content
- KB document content
- attached file content

Citation viewers also include copy actions for excerpts and opened content. The same grounded source-viewing pattern is used in workflow reports.

### 9.4 Refusal behavior

The product prefers evidence-backed refusal over hallucinated completion. If the system cannot ground an answer confidently inside the active mode's allowed sources, it should politely refuse.

---

## 10. Knowledge graph architecture

### 10.1 Rendering model

Sources:

- [frontend/src/pages/KnowledgeGraphPage.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/pages/KnowledgeGraphPage.jsx:1>)
- [frontend/src/components/graph/AigersDotCanvas.jsx](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/frontend/src/components/graph/AigersDotCanvas.jsx:1>)

The graph intentionally uses the restored legacy multidimensional galaxy canvas rather than the replaced force-graph page.

### 10.2 Edge model

The graph distinguishes:

- structural edges
- semantic edges

Important current behavior:

- semantic edges can connect chunks across categories when embeddings are similar
- edge visibility is toggleable from the side panel
- selected nodes can highlight semantically related nodes and their connected edges
- node focus reframes the clicked item without over-zooming

Decorative planets were removed to keep the graph cleaner and more intentional.

---

## 11. HITL architecture

HITL is a first-class runtime primitive.

Source: [backend/api/hitl_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/hitl_router.py:1>)

The system supports:

- pending approval queues
- approval with notes
- rejection with notes
- workflow resume signaling
- history review

This architecture exists because risky or regulated workflows often require a human checkpoint that survives refreshes and delayed review.

---

## 12. Observability architecture

### 12.1 Trace persistence

Sources:

- [backend/observability/tracer.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/observability/tracer.py:1>)
- [backend/api/observability_router.py](</c:/Users/yathi/OneDrive/Desktop/DeskTop/MY_WORKS/TPL/aigers-universe/backend/api/observability_router.py:1>)

Each trace can capture:

- agent identity
- workflow and run identity
- provider
- resolved model
- prompt/completion/total tokens
- latency
- outputs

### 12.2 Pricing model

Observability uses:

- runtime provider/model pricing when the runtime exposes it
- official fallback mappings for supported models when runtime pricing is unavailable

If exact pricing cannot be resolved truthfully, the system keeps the trace visible and excludes invented cost values.

### 12.3 Workflow history actions

The observability UI now supports deleting workflow history rows for cleanup and testing-heavy environments.

---

## 13. Settings, admin, and configuration architecture

Settings gives users control over:

- provider selection
- API keys
- base URLs
- default models
- theme

This is stored per user so runtime model resolution is personalized and does not require shared `.env` edits for every experiment.

Admin surfaces own:

- user oversight
- project deletion
- workspace governance operations

---

## 14. Documentation architecture

### 14.1 Why a dedicated docs surface exists

The platform now includes a dedicated `/platform-docs` page because the product became too feature-rich for a README-only explanation.

That page is designed as:

- a route-aware product atlas
- a frontend/backend implementation guide
- a handoff surface for engineers and reviewers
- a companion to `README.md`, `USER_GUIDE.md`, and this architecture document

### 14.2 Documentation synchronization principle

The goal is to keep four documentation layers aligned:

- `README.md`
- `USER_GUIDE.md`
- `Technical_architecture.md`
- `docs/platform-documentation.html`

The in-app docs page should reflect the actual codebase, and the static docs should mirror the same current behavior closely enough for handoff and review.

---

## 15. Architectural through-lines

Across the product, several consistent design choices show up repeatedly:

- truth over fake completeness
- persistence over transient convenience
- governed access over implied access
- evidence-backed grounding over fluent hallucination
- reusable KB memory separated from run-scoped context
- framework-native runtime ownership instead of framework-themed wrappers

Those choices explain many implementation details that might otherwise look overly strict or verbose. They are intentional because the platform is built for real operator trust, not only for demo flow.
