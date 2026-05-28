# AIger's Universe Technical Architecture

AIger's Universe is a governed multi-agent workflow platform. The system is optimized for turning an ambiguous user prompt into a clarified enterprise use case, a market-aware technical design, an executable multi-agent workflow, a resumable run, and an evidence-rich final report.

This document is written as an engineering handoff. It explains what the platform does, how the major runtime paths work, which files own which behavior, and where the important system boundaries live.

## Architectural goals

| Goal | Architectural implication |
|---|---|
| Prompt-to-workflow planning | Planning logic lives in the backend where installed agents, marketplace templates, research tools, and policy rules can be evaluated authoritatively. |
| Governed execution | Workflow state, HITL records, traces, A2A messages, and reports are persisted in MongoDB. |
| Human-readable evidence | Reports are rendered as outcome-first Markdown with tables, direct citations, source viewers, and highlighted matched text. |
| Reusable agent inventory | Installed agents and marketplace seed agents are resolved before creating custom agents. |
| Safe context boundaries | Reusable KB documents, workflow inputs, and Copilot attachments are separate context planes. |
| Operator confidence | Logs, run animations, approval gates, and report viewers make execution state visible without overwhelming the main workflow. |

## Runtime topology

```text
Browser
  -> React/Vite app
  -> route-level pages
  -> shared API clients
  -> FastAPI routers
  -> MongoDB repositories and collections
  -> LLM router
  -> workflow planner
  -> workflow engine
  -> framework runners
  -> MCP tool registry
  -> HITL manager
  -> A2A message store
  -> report builder
  -> SSE stream back to browser
```

## Control plane and data plane

| Plane | Owned by | Responsibilities |
|---|---|---|
| Control plane | Builder, Agents, Marketplace, Projects, Settings, Platform Docs | Agent registration, marketplace installation, workflow planning, project ownership, provider settings, documentation. |
| Data plane | Workflow Run, Knowledge Base, Copilot, Observability | Uploaded content, KB chunks, run inputs, tool calls, traces, A2A messages, HITL records, reports. |

The control plane prepares and governs workflows. The data plane executes, persists, and explains what happened.

## Frontend architecture

| Page or component | File | Responsibility |
|---|---|---|
| Landing page | `frontend/src/pages/LandingPage.jsx` | Premium product entry with agent-workflow positioning and animated execution framing. |
| Login page | `frontend/src/pages/LoginPage.jsx` | Workspace sign-in and navigation back to the landing page. |
| Dashboard | `frontend/src/pages/Dashboard.jsx` | Metrics, recent runs, approval queue, documents, and run deletion through shared modal confirmation. |
| Workflow Builder | `frontend/src/pages/WorkflowBuilderPage.jsx` | Prompt orchestrator, live console, planning HITL, canvas composition, KB and workflow inputs, run start transition. |
| Workflow Canvas | `frontend/src/components/flow/WorkflowCanvas.jsx` | ReactFlow node/edge editing and visual workflow state. |
| Workflow Run | `frontend/src/pages/WorkflowRunPage.jsx` | Live execution graph, edge animation, compact timings, A2A messages, HITL status, reports, citations. |
| AIger Copilot | `frontend/src/pages/ToolPlaygroundPage.jsx` | Chat modes, session files, tool calls, citations, processing logs, collapsed tool activity. |
| Markdown renderer | `frontend/src/components/common/MarkdownReport.jsx` | Markdown, JSON, tables, Mermaid, HTML-to-readable content, links, highlighted chunks, risk coloring. |
| Activity console | `frontend/src/components/common/ActivityConsole.jsx` | Collapsible logs with runtime-only typewriter animation and normal completed display. |
| Platform docs | `frontend/src/pages/PlatformDocumentationPage.jsx` | Engineering atlas for routes, implementation files, runtime decisions, and code snippets. |

## Backend architecture

| Backend module | Responsibility |
|---|---|
| `backend/api/workflow_router.py` | Workflow CRUD, auto-build stream, run controls, SSE snapshots, report materialization, old-report rematerialization. |
| `backend/core/workflow_engine.py` | Ordered execution, input binding, agent invocation, HITL pause/resume, output persistence. |
| `backend/core/report_builder.py` | Outcome-first final reports, priority tables, evidence trails, direct source citation metadata. |
| `backend/core/framework_runners.py` | Framework-specific execution across LangGraph, LangChain, CrewAI, and Agno-style agents. |
| `backend/core/chat_grounding.py` | Copilot grounding boundaries, KB retrieval, query expansion, reranking, compression, citation assembly. |
| `backend/api/tool_chat_router.py` | Chat session lifecycle, tool execution, citation source retrieval, processing logs. |
| `backend/api/document_router.py` | File/repo ingestion, duplicate handling, visibility, parser and chunk strategy selection. |
| `backend/mcp_tools/tool_server.py` | MCP-compatible platform, retrieval, research, document, and workflow tools. |
| `backend/db/seed.py` | Marketplace templates and governance rules seeded idempotently. |

## Planner pipeline

The planner acts like a senior enterprise solution architect:

1. **Prompt understanding**: identify user intent, domain, deliverables, implied inputs, and hidden assumptions.
2. **Clarification**: ask only material questions, inside the orchestrator console.
3. **Market validation**: gather market signals and citations when research tools are configured.
4. **Differentiation**: compare the requested use case against market alternatives and current platform strengths.
5. **Technical design**: generate a Markdown design document with architecture, workflow, tools, protocols, cloud assumptions, and implementation notes.
6. **Workflow planning**: identify agents, prompts, frameworks, tools, inputs, outputs, and HITL gates.
7. **Inventory resolution**: match installed agents first, exact marketplace templates second, generated agents third.
8. **Inline gates**: ask the user to install exact-match marketplace agents inside the log console.
9. **Final review**: open the slide panel only after clarifications and install decisions are complete.
10. **Canvas materialization**: convert the accepted plan into ReactFlow nodes and edges.

## HITL architecture

There are two HITL categories:

| HITL type | Where it appears | Behavior |
|---|---|---|
| Planning HITL | Builder orchestrator console | Clarifying questions and marketplace install approvals. These are collapsible and remain inside the log console. |
| Runtime HITL | Run page and HITL queue | Agents can pause execution through `trigger_hitl`; the run resumes after approval and fails or stops on rejection/timeout. |

HITL design principles:

- Do not open unrelated popups while the planner is still waiting for input.
- Do not show the final slide panel before required gates are complete.
- Do not ask the same clarifying question twice after answers are submitted.
- Do not reinstall the same exact marketplace seed repeatedly.
- Keep resolved HITL steps available for later inspection.

## Context and memory boundaries

| Context source | Persistence | Intended audience | Notes |
|---|---|---|---|
| KB upload | Long-lived | Any permitted workflow or Copilot session | Best for policies, playbooks, reusable docs, and shared repo snapshots. |
| Workflow input upload | Run-scoped | The workflow being planned or executed | Best for contracts, customer files, migration source packages, and one-off evidence. |
| Copilot file attachment | Chat-scoped | One Copilot response/session | Best for temporary inspection and Q&A. |
| Marketplace template | Long-lived platform seed | Planner and users | Best for reusable agents with known prompts and tools. |
| A2A message | Run-scoped | Agents and run viewers | Best for handoff, status, payload, and debugging evidence. |

## Report architecture

Reports are produced by `backend/core/report_builder.py` and rendered through `MarkdownReport.jsx`.

| Report section | Rendering behavior |
|---|---|
| Outcome Summary | Text paragraph based on final agent result and upstream evidence. |
| Decision | Short explicit decision such as approve, reject, escalate, review, complete, or inspect. |
| Priority Actions | Markdown table when recommendations are available. High-risk rows get red treatment in the renderer. |
| Key Findings | Readable bullet list extracted from executive brief or relevant outputs. |
| Structured Result | JSON block retained for traceability and downstream parsing. |
| Agent Evidence Trail | Agent outputs converted to tables and lists where possible. |
| Citations | Direct source records with source viewers and highlighted matched text. |

Older reports are rematerialized when they contain legacy headings such as `Final Agent Objective`, `Final Deliverable`, or `Upstream Agent Outputs`.

## Citation and source-viewer architecture

The platform prefers direct source evidence:

- If a KB chunk is cited, the citation should resolve to the full source document when possible.
- If the source is Markdown, it should render as Markdown preview.
- If the source is HTML, it should be converted into readable content.
- If a matched chunk exists, it should be highlighted in the opened source.
- Excerpts are supporting context, not the primary citation experience.

## Execution state model

Workflow run state includes:

| State area | Examples |
|---|---|
| Identity | run ID, workflow ID, owner, project, workflow name. |
| Progress | status, current step, started/finished timestamps. |
| Inputs | prompt, run-scoped files, selected KB docs, GitHub imports. |
| Outputs | per-agent outputs, final output, structured result. |
| Controls | pause, resume, stop, restart, HITL records. |
| Observability | trace IDs, latency, token estimates, provider, model, cost when available. |
| Messages | A2A handoff messages and payloads. |
| Report | generated Markdown, structured report data, citation records. |

## UI behavior contracts

| Area | Contract |
|---|---|
| Builder log | The main orchestrator button shows the current step title. Clicking it opens the log console directly. |
| Builder HITL | Clarifying questions and marketplace installs live inside collapsible log-console sections. |
| Final planner panel | The panel opens after gates complete; the open button toggles open/close. |
| Run transition | Clicking Run workflow shows a short starting animation while the backend creates the run. |
| Run edges | Active and completed workflow edges remain animated for visual continuity. |
| Copilot tool activity | Tool activity is collapsed by default and scrollable when opened. |
| Browser alerts | Frontend destructive actions use app modal/toast patterns rather than `window.alert` or `window.confirm`. |

## Data collections

| Collection | Purpose |
|---|---|
| `agents` | Registered local, generated, marketplace, or remote-routed agents. |
| `marketplace_templates` | Seed templates used by users and the planner. |
| `workflow_definitions` | Saved workflow metadata, agent order, and ReactFlow canvas. |
| `workflow_runs` | Run status, inputs, outputs, controls, timings, reports. |
| `agent_traces` | Per-agent latency, token, model, provider, tool, and status records. |
| `hitl_records` | Pending or resolved human approvals. |
| `a2a_messages` | Agent-to-agent messages and payloads. |
| `aigers_documents` | Source document metadata and extracted text. |
| `aigers_chunks` | Searchable retrieval chunks with metadata. |
| `tool_chat_sessions` | AIger Copilot messages, attachments, logs, tool results, citations. |

## Failure and recovery behavior

| Scenario | Expected behavior |
|---|---|
| Browser refresh during run | Backend state remains authoritative; the run page reloads state from the run record. |
| SSE disconnect | Polling or refresh can recover because state is persisted. |
| HITL pause | The run remains paused until approval, rejection, or timeout. |
| Duplicate marketplace install | Install path should be idempotent and should not keep asking after success. |
| Clarification answer submitted | Planner continues with the provided answers instead of asking the same questions again. |
| Legacy report opened | Report is rematerialized into the current outcome-first format. |
| Citation source is HTML or Markdown | The frontend renders readable content instead of raw markup. |

## Security and governance notes

- Auth is JWT-based and role-aware.
- Project ownership and membership govern visibility.
- Admin-only operations stay behind admin routes.
- HITL decisions are persisted so approval history is auditable.
- Provider settings are user-aware and resolved at runtime.
- Report citations should expose evidence without silently expanding access to private content.

## Validation map

| Area | Command or manual check |
|---|---|
| Backend syntax | `python -m py_compile backend\api\workflow_router.py backend\core\report_builder.py` |
| Frontend build | `cd frontend && npm run build` |
| Alert scan | `rg -n "alert\\(|confirm\\(|window\\.alert|window\\.confirm" frontend/src` |
| Login navigation | Open `/login`, click `Landing page`, confirm it returns to `/`. |
| Builder flow | Prompt, clarify, install exact matches, final slide panel, accept, save, run. |
| Run page | Verify animated edges, compact timing rows, A2A messages, report, source viewer. |
| Copilot | Verify tool activity is closed by default and scrollable when opened. |

## Architectural tradeoffs

| Decision | Tradeoff |
|---|---|
| Backend-owned planning | More backend complexity, but planner decisions stay consistent with real inventory and policies. |
| ReactFlow builder | Excellent interaction model for visual workflows, but large flows need careful layout and performance attention. |
| Mongo-backed state | Flexible persistence for evolving workflow and report shapes, but schema discipline must be enforced in code. |
| Markdown-first reports | Easy to read and export, but renderer quality matters for tables, links, code, and highlighted evidence. |
| Inline planner HITL | Keeps users oriented, but the log console must manage height, scroll, and collapsible resolved states carefully. |

## Current watch items

- Frontend bundle size can be improved later through route-level code splitting.
- Vite build may require elevated file access on some Windows OneDrive paths because esbuild attempts to resolve the config through restricted parent directories.
- Marketplace matching quality depends on seed template metadata and prompt descriptions staying rich.
- Market research quality depends on configured research tools and should be treated as evidence-backed but still human-reviewable.
