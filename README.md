# AIger's Universe

AIger's Universe is an enterprise multi-agent workflow platform for designing, running, governing, and reporting real AI workflows. It combines prompt-to-architecture orchestration, marketplace agent installation, visual workflow composition, MCP tools, A2A handoffs, HITL approvals, source-grounded reporting, and observability in one workspace.

The platform is built for teams that need more than a chat screen. A prompt can become a clarified use case, a source-backed market view, a technical design document, a workflow canvas, a set of framework-native agents, governed approval gates, live execution traces, and a final report with direct evidence.

## Table of contents

- [Platform position](#platform-position)
- [Current capability map](#current-capability-map)
- [Prompt-to-workflow lifecycle](#prompt-to-workflow-lifecycle)
- [Core product surfaces](#core-product-surfaces)
- [Architecture in one page](#architecture-in-one-page)
- [Orchestrator contract](#orchestrator-contract)
- [Runtime and reporting model](#runtime-and-reporting-model)
- [Knowledge and input model](#knowledge-and-input-model)
- [Technology stack](#technology-stack)
- [Repository map](#repository-map)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Validation checklist](#validation-checklist)
- [Contributor principles](#contributor-principles)

## Platform position

AIger's Universe is positioned as a governed agent-workflow operating surface:

| Layer | What it does | Why it matters |
|---|---|---|
| Product interface | Landing page, dashboard, builder, run page, Copilot, docs atlas, marketplace, KB, observability | Users can move from idea to execution without switching tools. |
| Planning plane | Prompt understanding, clarifying questions, market validation, architecture design, agent planning | The workflow starts with enterprise architecture thinking, not only code generation. |
| Agent plane | Installed agents, marketplace seed agents, generated custom agents, local and remote A2A agents | Teams can reuse known building blocks and still cover new use cases. |
| Execution plane | Workflow engine, framework runners, MCP tools, HITL manager, SSE updates | Runs are persisted, resumable, observable, and governable. |
| Evidence plane | Reports, citations, source viewers, trace records, A2A messages, tool activity | Final outputs can be reviewed, audited, and improved. |

## Current capability map

| Capability | Current behavior |
|---|---|
| Prompt-first workflow creation | The builder accepts a user prompt and streams orchestrator status while it interprets, clarifies, researches, plans, and assembles a workflow. |
| Clarification flow | Missing context is requested inside the orchestrator console. After answers are submitted, the same plan continues instead of repeatedly asking. |
| Market-aware planning | Market research is attempted through configured tools. Final design docs place citations in the market section when sources are available. |
| Marketplace matching | Installed agents are preferred first. Exact marketplace seed matches pause for inline install approval. Missing custom capabilities create suggested agents. |
| Canvas generation | Accepted plans materialize into ReactFlow nodes and edges with agent framework metadata, prompts, tools, and HITL hints. |
| Workflow execution | Runs stream through SSE, fall back to polling, animate active/completed edges, show A2A messages, and persist outputs. |
| HITL | Planning HITL stays in the builder console. Runtime HITL pauses workflow execution and resumes after approval. |
| Reporting | Final reports are outcome-first, use tables where useful, preserve structured results, and show direct source citations. |
| Copilot | AIger Copilot supports platform, KB, and general modes with logs, citations, files, tools, and collapsed tool activity. |
| Documentation | The platform documentation route behaves like an engineering atlas with route-level implementation detail and file references. |

## Prompt-to-workflow lifecycle

1. **Capture intent**: the user describes a business or technical workflow.
2. **Understand scope**: the orchestrator identifies domain, required artifacts, likely inputs, and risk posture.
3. **Clarify only when needed**: missing decisions are asked inside the live orchestrator console.
4. **Validate the market**: configured research tools collect citations and demand signals.
5. **Differentiate**: the plan identifies what the requested use case does differently from market alternatives.
6. **Design technically**: the orchestrator produces a Markdown technical design document in preview mode.
7. **Plan agents**: agent roles, prompts, frameworks, tools, inputs, outputs, and HITL checkpoints are proposed.
8. **Resolve inventory**: installed agents and exact marketplace seed agents are matched before creating new agents.
9. **Gate decisions**: marketplace installs and clarifying questions remain inside the console.
10. **Review final plan**: the final slide panel opens only after gates are complete.
11. **Accept and compose**: the plan becomes an editable ReactFlow canvas.
12. **Run and observe**: execution streams state, messages, traces, timings, HITL, and final report output.

## Core product surfaces

| Surface | Route | Owner files | Role |
|---|---|---|---|
| Landing | `/` | `frontend/src/pages/LandingPage.jsx` | Premium first impression for enterprise workflow architecture, execution, and evidence. |
| Login | `/login` | `frontend/src/pages/LoginPage.jsx` | Workspace entry with a return path to the landing page. |
| Dashboard | `/dashboard` | `frontend/src/pages/Dashboard.jsx` | Operational summary, recent runs, approvals, and recent documents. |
| Marketplace | `/marketplace` | `frontend/src/pages/MarketplacePage.jsx`, `backend/api/marketplace_router.py` | Seed agent discovery and installation. |
| Agents | `/agents` | `frontend/src/pages/AgentsPage.jsx`, `backend/api/platform_router.py` | Framework-native agent registry and direct invocation. |
| Builder | `/builder` | `frontend/src/pages/WorkflowBuilderPage.jsx`, `backend/api/workflow_router.py` | Prompt orchestrator, visual canvas, KB selection, run-scoped input setup. |
| Run | `/runs/:runId` | `frontend/src/pages/WorkflowRunPage.jsx`, `backend/core/workflow_engine.py` | Live execution, A2A messages, HITL state, reports, citations. |
| Copilot | `/tools-chat` | `frontend/src/pages/ToolPlaygroundPage.jsx`, `backend/api/tool_chat_router.py` | Grounded assistant with tools, files, citations, and activity logs. |
| Knowledge Base | `/knowledge-base` | `frontend/src/pages/KnowledgeBasePage.jsx`, `backend/api/document_router.py` | Reusable document ingestion, chunking, visibility, and retrieval. |
| Knowledge Graph | `/knowledge-graph` | `frontend/src/pages/KnowledgeGraphPage.jsx` | Spatial exploration of KB chunks and semantic relationships. |
| HITL | `/hitl` | `frontend/src/pages/HITLPage.jsx`, `backend/api/hitl_router.py` | Approval queue for paused runtime decisions. |
| Observability | `/observability` | `frontend/src/pages/ObservabilityPage.jsx`, `backend/api/observability_router.py` | Traces, latency, token, cost, and run history. |
| Platform Docs | `/platform-docs` | `frontend/src/pages/PlatformDocumentationPage.jsx` | Engineering atlas for product surfaces, contracts, and runtime decisions. |

## Architecture in one page

```text
React/Vite frontend
  -> route-level product pages
  -> shared API clients
  -> FastAPI routers
  -> MongoDB collections
  -> LLM router
  -> orchestrator planner
  -> workflow engine
  -> framework runners
  -> MCP tools
  -> A2A messaging
  -> HITL manager
  -> SSE stream back to UI
  -> report builder and citation viewers
```

The frontend owns interaction state, preview rendering, canvas editing, and operator ergonomics. The backend owns authoritative planning, persistence, workflow execution, HITL coordination, report materialization, and source retrieval.

## Orchestrator contract

The workflow builder orchestrator must behave like a senior enterprise solution architect:

| Step | Expected behavior |
|---|---|
| Understand | Extract domain, user goal, implied inputs, risk, and output expectations. |
| Clarify | Ask only the questions required to avoid wrong design assumptions. |
| Research | Use configured research tools and cite market sources where available. |
| Compare | Identify market alternatives and use-case differentiators. |
| Design | Create a technical Markdown design document that renders as preview, not raw text. |
| Plan | Select agent roles, prompts, frameworks, tools, inputs, outputs, and HITL gates. |
| Match | Check installed agents and marketplace seeds before proposing custom agents. |
| Gate | Keep install and question HITL inside the orchestrator console. |
| Reveal | Open the final slide panel only after required gates are complete. |

## Runtime and reporting model

Workflow runs persist state so refreshes and navigation do not erase execution context. The run page shows active and completed edge animation, compact timing estimates, A2A messages, HITL state, and final reports.

Reports follow a use-case-agnostic structure:

| Section | Purpose |
|---|---|
| Outcome Summary | Human-readable conclusion from the final agent and upstream evidence. |
| Decision | Approve, reject, escalate, review, or another domain-specific conclusion. |
| Priority Actions | Table-form actions with priority and rationale. |
| Key Findings | Important observations separated from raw trace detail. |
| Structured Result | JSON or structured output retained for auditability. |
| Agent Evidence Trail | Per-agent outputs formatted as readable tables and lists. |
| Citations | Direct source links and source viewers with highlighted matched text. |

## Knowledge and input model

AIger separates long-lived knowledge from run-specific evidence:

| Context type | Scope | Typical use |
|---|---|---|
| Knowledge Base documents | Reusable across workflows | Policies, playbooks, technical docs, repo snapshots, reusable reference material. |
| Workflow input files | Scoped to one workflow/run | Contracts, migration repos, customer documents, one-off review packages. |
| Copilot attachments | Scoped to a chat session | Temporary files used for an assistant answer. |
| Marketplace templates | Reusable platform inventory | Seed agents that can be installed manually or by planner approval. |
| A2A messages | Scoped to a workflow run | Inter-agent handoff, reasoning, status, payload transfer. |

## Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, React Router, ReactFlow, Tailwind CSS, Recharts, lucide-react, sonner. |
| Backend | FastAPI, Python, MongoDB, SSE, framework runners, report builder, HITL manager. |
| Agent frameworks | LangGraph, LangChain, CrewAI, Agno-style runtime definitions. |
| Tools | MCP-compatible tool registry, document tools, retrieval tools, research tools, workflow tools. |
| Persistence | Agents, templates, workflow definitions, runs, traces, HITL records, A2A messages, documents, chunks, chat sessions, settings. |

## Repository map

```text
backend/
  api/                  FastAPI routers for workflows, tools, documents, projects, admin, observability
  core/                 LLM routing, workflow engine, framework runners, reports, grounding
  db/                   Mongo client, repositories, seed templates and policies
  document_processing/  Parsers, chunking, extraction helpers
  hitl/                 Approval and resume coordination
  mcp_tools/            Tool server and tool implementations
  observability/        Trace persistence and cost/latency helpers
frontend/
  src/api/              API clients
  src/components/       Shared UI, markdown, activity console, flow canvas, graph components
  src/context/          Auth, settings, title state
  src/pages/            Product pages and route-level experiences
docs/                   Static HTML operator guides
memory/                 Product notes and planning material
```

## Local setup

Backend:

```bash
cd backend
python server.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URL` | MongoDB connection string. |
| `LLM_API_KEY` | LLM gateway or provider key. |
| `JWT_SECRET` | Auth token signing secret. |
| `HITL_TIMEOUT_SECONDS` | Approval timeout for workflow gates. |
| `WORKFLOW_INPUT_RETENTION_DAYS` | Retention period for run-scoped inputs. |
| `WORKFLOW_INPUT_MAX_FILES` | Maximum files per workflow input upload. |
| `CHAT_INPUT_MAX_FILES` | Maximum files per AIger Copilot session. |
| `GITHUB_TOKEN` | Optional token for private GitHub imports. |

## Validation checklist

Use this checklist after major changes:

1. Sign in from `/login`, then return to `/` using the landing-page button.
2. Open `/builder` and auto-build a workflow from a vague prompt.
3. Confirm clarifying questions stay inside the orchestrator console.
4. Confirm marketplace installation approval stays inside the same console.
5. Accept the final plan, save it, and run the workflow.
6. Confirm the run transition animation appears before navigation.
7. Confirm completed run edges remain animated.
8. Generate a final report and check tables, colored risk rows, structured JSON, citations, and source viewers.
9. Open AIger Copilot and verify tool activity is collapsed by default and scrollable when opened.
10. Delete a dashboard run and confirm the shared modal appears instead of a browser alert.

## Contributor principles

- Keep planner decisions backend-owned.
- Keep user-facing state explainable and resumable.
- Prefer installed and marketplace agents before generating new ones.
- Keep HITL actions in the flow where the decision is needed.
- Render Markdown and HTML as readable previews when users are expected to inspect content.
- Use direct source links where possible instead of anonymous excerpts.
- Avoid duplicate output sections in final reports.
- Treat documentation as part of the product surface, not as a stale afterthought.

## Documentation references used for this README pass

- GitHub and Google README guidance emphasize that top-level READMEs should orient readers quickly and point to usage, status, and deeper docs.
- ReadMe documentation guidance emphasizes navigable documentation architecture for developer journeys.
- Awesome README examples emphasize clear value, setup, usage, architecture, and contribution sections.
- The BLACKBOX reference page influenced the landing and documentation visual direction: large first-viewport identity, animated/code-like execution surfaces, and agent-focused capability framing.
