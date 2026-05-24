# AIger's Universe — PRD (living doc)

## Original problem statement
Build the Enterprise AI Engineering & Agentic Orchestration Platform per
`/app/Emergent_ProductionGrade_Final.md` — a generic, domain-agnostic platform
where users register any AI agent (LangGraph/CrewAI/LangChain), build workflows
on a ReactFlow canvas, connect agents via MCP tools, communicate via A2A messages,
gate flow with HITL approvals, and observe tokens/latency/cost in real time.

## Tech stack (locked)
- Backend: FastAPI + Motor + MongoDB + LangGraph (InMemorySaver) + fastmcp + python-a2a + openai (Tiger Analytics gateway, gpt-4o)
- Vector store: MongoDB vector chunks with Atlas vector search fallback
- Logging: structlog across every module
- Frontend: Vite + React 18 + ReactFlow + Recharts + Tailwind (dark enterprise theme)
- Storage: local MongoDB

## User personas
1. **AI Engineer** — registers agents, designs workflows, monitors cost
2. **Compliance Reviewer** — approves/rejects HITL gates
3. **Platform Admin** — manages templates and rules

## What's implemented (as of 2026-05-17)
- Full backend: 6 routers under `/api/*` · 5 MCP tools (semantic_search, document_store, rules_engine_check, risk_scorer, trigger_hitl) · LangGraph workflow engine with InMemorySaver and HITL interrupt/resume · A2A message bus to MongoDB · Mongo vector store · PDF/DOCX/TXT/image ingestion · structlog request_id middleware · FastApiMCP `/mcp` SSE endpoint
- Full frontend: 7 pages (Dashboard, Marketplace, Agents, Builder, Run, HITL, Observability) · ReactFlow drag-drop canvas with right-side config panel · SSE-driven Workflow Run page with polling fallback · Recharts (token bar, latency bar, runs timeline) · sonner toasts · Tailwind dark enterprise theme (Geist + JetBrains Mono)
- **Polish pass 1**: idempotent marketplace install · SSE `/api/workflows/runs/:id/stream` · dynamic workflow-name topbar via TitleContext · React Router v7 future flags
- **Polish pass 2 (sidebar+logo+docs)**: collapsible sidebar with localStorage persistence (w-64 ↔ w-[68px]) · transparent stacked-hexagon logo (lucide-react, no solid background) · expanded USER_GUIDE.md (TOC, walkthrough, best practices, glossary, full API ref) · README.md rewritten as a local-dev VS Code quickstart with launch.json, tasks.json, smoke curls, pytest instructions, and production build steps
- Tests: 100% backend / 100% frontend via testing_agent_v3 (12/12 pytest cases); LLM gateway verified end-to-end on a real 2-agent run (699 tokens, 1.4s latency, 2 A2A msgs, 2 traces)
- Docs: `/app/USER_GUIDE.md` · `/app/README.md` · `/app/memory/PRD.md`

## Backlog (P1)
- Shareable read-only run links `/share/{run_id}` with signed token
- Branching/conditional edges in workflows (currently linear left-to-right)
- USER_GUIDE PDF export
- Auth + multi-tenancy

## Backlog (P2)
- AsyncPostgresSaver swap for multi-replica HITL state
- Bulk-upload documents
- Agent versioning / rollback
- Chunk strategy override per upload
