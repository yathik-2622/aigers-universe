# AIger's Universe

> Enterprise AI Engineering & Agentic Orchestration Platform.
> Bring any agent. Orchestrate every workflow. Watch every token.

A generic, domain-agnostic platform for registering AI agents (LangGraph / CrewAI / LangChain / Agno), composing them into multi-agent workflows on a visual ReactFlow canvas, connecting them via **MCP** + **A2A**, gating them via **HITL**, and observing everything in real time.

**Version:** 1.0.0

---

## Visual tour

| | |
|---|---|
| ![Dashboard](./docs/screenshots/01-dashboard.jpeg) | ![Marketplace](./docs/screenshots/02-marketplace.jpeg) |
| **Mission Control** — live KPIs + run feed | **Marketplace** — 35 idempotent agent templates |
| ![Builder](./docs/screenshots/04-builder-empty.jpeg) | ![Run](./docs/screenshots/05-workflow-run.jpeg) |
| **Workflow Builder** — drag-drop ReactFlow canvas | **Workflow Run** — SSE-driven live pipeline + A2A log |
| ![HITL](./docs/screenshots/06-hitl.jpeg) | ![Observability](./docs/screenshots/07-observability.jpeg) |
| **HITL Approvals** — paused workflows + Approve/Reject | **Observability** — Recharts + traces |

---

## Documentation & guides

| Document | Path | Description |
|----------|------|-------------|
| **User Guide** | [`USER_GUIDE.md`](./USER_GUIDE.md) | Full end-user walkthrough with screenshots, best practices, API reference, troubleshooting |
| **Product Requirements** | [`memory/PRD.md`](memory/PRD.md) | Full PRD with feature specs, user stories, and architecture decisions |
| **Platform Documentation** | [`docs/platform-documentation.html`](docs/platform-documentation.html) | Static HTML operator guide for platform features |
| **E2E Testing Guide** | [`docs/e2e-testing.html`](docs/e2e-testing.html) | End-to-end testing procedures and validation checklist |
| **Screenshots** | [`docs/screenshots/`](docs/screenshots/) | 7 UI screenshots covering all major surfaces |

---

## Tech stack

**Backend**: FastAPI · Motor (async MongoDB) + PyMongo fallback · `fastmcp` (MCP) · `fastapi-mcp` (mount `/mcp`) · `python-a2a` · `langgraph` + `InMemorySaver` · `openai` (Tiger Analytics gateway, gpt-4o + text-embedding-3-small) · MongoDB Atlas Search vector indexing (with in-app cosine fallback) · `PyMuPDF` + `python-docx` · `structlog`.

**Frontend**: Vite · React 18 · React Router 6 (v7 future flags on) · `reactflow` · `recharts` · `tailwindcss` (dark enterprise theme) · `lucide-react` · `sonner`.

**Storage**: MongoDB (`agents`, `workflow_definitions`, `workflow_runs`, `agent_traces`, `hitl_records`, `a2a_messages`, `documents`, `governance_rules`, `marketplace_templates`, `user_settings`, `projects`, `policies`) + FAISS (`IndexFlatL2`, disk-persisted).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Vite/React (port 3000)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Landing  │ │  Login   │ │  Signup  │ │ Dashboard│ │Marketplace│          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Agents  │ │ Builder  │ │   Run    │ │  Copilot │ │Knowledge │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Knowledge │ │   HITL   │ │Observabil│ │ Projects │ │ Settings │          │
│  │  Graph   │ │          │ │   ity    │ │          │ │          │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐                                                               │
│  │  Admin   │                                                               │
│  └──────────┘                                                               │
│                                                                             │
│  EventSource → /api/workflows/runs/:id/stream                               │
│  Axios → /api/* (14 routers)                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FastAPI (port 8001, prefix /api)                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           API Layer (/api/*)                         │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  /api/auth        │ JWT login/signup/me + role-based access          │   │
│  │  /api/platform    │ Agent CRUD + invoke + model catalog               │   │
│  │  /api/workflows   │ Definitions · runs · SSE stream · auto-build    │   │
│  │  /api/hitl        │ Pending approvals · approve · reject · resume     │   │
│  │  /api/observabil  │ Metrics · traces · cost · timeline                │   │
│  │  /api/marketplace │ 35 idempotent templates · install · uninstall     │   │
│  │  /api/documents   │ PDF/DOCX/TXT upload → chunk → vector index      │   │
│  │  /api/tool-chat   │ Copilot playground with MCP tool calling          │   │
│  │  /api/projects    │ Project CRUD + member sharing                     │   │
│  │  /api/settings    │ Per-user LLM provider + model + API keys          │   │
│  │  /api/admin       │ Admin overview · project deletion · analytics     │   │
│  │  /api/knowledge   │ Knowledge graph + semantic search                 │   │
│  │  /api/policies    │ Policy creation + document upload + enforcement   │   │
│  │  /api/health      │ Health check + version info                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Core Engine Layer                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  workflow_engine.py   │ Async StateGraph + MongoDB checkpoint           │   │
│  │  framework_runners  │ LangGraph · LangChain · CrewAI · Agno           │   │
│  │  llm_router.py      │ Multi-provider routing (Gateway/OpenRouter/     │   │
│  │                       │ Groq/NVIDIA/Custom) + model discovery           │   │
│  │  agent_registry.py    │ Agent CRUD + metadata + tool binding            │   │
│  │  report_builder.py  │ Structured markdown reports + PII detection     │   │
│  │  grounding.py         │ Source citations + evidence trail               │   │
│  │  pii_detector.py      │ 4-pattern regex (email/phone/SSN/credit)        │   │
│  │  prompt_templates.py  │ Orchestrator system prompts + clarifying Qs     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Tool & Integration Layer                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  mcp_tools/           │ FastMCP server (20 tools, 6 categories)        │   │
│  │  a2a/                 │ HTTP agent dispatch + AgentCard + message broker│   │
│  │  hitl/                │ Pause/resume signals + timeout governance      │   │
│  │  observability/       │ Token cost · latency · per-agent breakdown      │   │
│  │  vectorstore/         │ Atlas Search $vectorSearch + cosine fallback    │   │
│  │  document_processing/ │ PDF/DOCX/TXT parsers + chunking               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Data Layer                                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  MongoDB              │ Motor async + PyMongo fallback                  │   │
│  │  db/seed.py           │ 35 templates + 5 governance rules auto-seed       │   │
│  │  db/collection_names  │ 20+ collections (agents, runs, traces, etc.)    │   │
│  │  FAISS                │ IndexFlatL2 disk-persisted (legacy vectorstore) │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Infrastructure                                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  middleware/          │ Request logging + CORS + request_id tracing     │   │
│  │  storage/             │ File upload handling + temp storage             │   │
│  │  config.py            │ 29+ env vars with defaults + validation       │   │
│  │  logging_config.py    │ structlog with JSON/plain toggle                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  /mcp  ──► FastApiMCP SSE endpoint (MCP tool server)                        │
│  /docs ──► Swagger UI (auto-generated)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core product surfaces (18 routes)

| Surface | Route | Key files | Description |
|---------|-------|-----------|-------------|
| Landing | `/` | `LandingPage.jsx` | Product landing page |
| Login | `/login` | `LoginPage.jsx`, `auth_router.py` | JWT authentication |
| Signup | `/signup` | `SignupPage.jsx`, `auth_router.py` | New user registration |
| Dashboard | `/dashboard` | `Dashboard.jsx` | Mission control with KPIs + run feed |
| Marketplace | `/marketplace` | `MarketplacePage.jsx`, `marketplace_router.py` | 35 agent templates, install/uninstall |
| Agents | `/agents` | `AgentsPage.jsx`, `platform_router.py` | Agent registry + invoke + model catalog |
| Builder | `/builder` | `WorkflowBuilderPage.jsx`, `workflow_router.py` | ReactFlow drag-drop canvas + auto-build |
| Run | `/runs/:runId` | `WorkflowRunPage.jsx`, `workflow_engine.py` | SSE-driven live pipeline + A2A log |
| Copilot | `/tools-chat` | `ToolPlaygroundPage.jsx`, `tool_chat_router.py` | Chat-style MCP tool playground |
| Knowledge Base | `/knowledge-base` | `KnowledgeBasePage.jsx`, `document_router.py` | Document upload + chunk + vector index |
| Knowledge Graph | `/knowledge-graph` | `KnowledgeGraphPage.jsx`, `knowledge_graph_router.py` | Semantic graph visualization |
| HITL | `/hitl` | `HITLPage.jsx`, `hitl_router.py` | Pending approvals + Approve/Reject |
| Observability | `/observability` | `ObservabilityPage.jsx`, `observability_router.py` | Recharts traces + cost + timeline |
| Platform Docs | `/platform-docs` | `PlatformDocumentationPage.jsx` | In-app documentation viewer |
| Projects | `/projects` | `ProjectsPage.jsx`, `project_router.py` | Project CRUD + member sharing |
| Settings | `/settings` | `SettingsPage.jsx`, `settings_router.py` | Per-user LLM provider + model + keys |
| Admin | `/admin` | `AdminPage.jsx`, `admin_router.py` | Admin overview + project deletion |

---

## Orchestrator contract (auto-build)

The prompt-to-workflow orchestrator follows this sequence:

| Step | What happens |
|------|-------------|
| 1. Understand | Infer true intent from the user's prompt |
| 2. Clarify | Ask 2-4 targeted questions if the prompt is too broad |
| 3. Research | Validate use case against live market research (Wikipedia, official docs, SerpAPI, webpage fetch) |
| 4. Compare | Score installed agents and marketplace templates against the prompt for exact fit |
| 5. Design | Generate 8-section enterprise design document (use case, market validation, differentiation, architecture, agent plan, tools, protocols, implementation) |
| 6. Plan | Recommend agent count, roles, prompts, tools, frameworks, input bindings, and HITL gates |
| 7. Match | Identify exact-fit marketplace templates; return `missing_templates` for frontend approval (or auto-install with `auto_install_missing=true`) |
| 8. Gate | Create HITL checkpoints for installation, agent creation, and execution approval |
| 9. Reveal | Generate ReactFlow canvas with positioned nodes, animated edges, and input bindings |

---

## Runtime and reporting model

### Workflow execution
- Runs persist state in MongoDB (`workflow_runs` collection)
- Resume from last successful step after logout, refresh, or backend restart
- Pause/resume/stop via control flags + asyncio task cancellation
- HITL timeout: 1 hour (configurable via `HITL_TIMEOUT_SECONDS`)
- Agent step timeout: 5 minutes (configurable via `AGENT_STEP_TIMEOUT_SECONDS`)
- Input governance: max 10 files, 50MB total, 500K text chars per workflow

### SSE streaming
- `GET /api/workflows/runs/{run_id}/stream` — pushes run state, A2A messages, timing estimates
- `POST /api/workflows/auto-build/stream` — streams orchestrator planning events
- Implementation: polling-based push (500ms MongoDB polls) over async execution, not true event streaming

### Report structure
1. **Outcome Summary** — Final agent output summary
2. **Decision** — Overall recommendation (APPROVE/REJECT/ESCALATE)
3. **Priority Actions** — Table with priority, action, rationale
4. **Key Findings** — Bullet list of critical findings
5. **Structured Result** — Full JSON output
6. **Agent Evidence Trail** — Per-agent outputs with formatted tables
7. **Citations** — Source links to knowledge base docs and workflow inputs
8. **PII Findings** — Detected but stored separately (email, phone, SSN, credit card patterns)

---

## Security & governance

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT with configurable expiry (`JWT_EXPIRES_HOURS`) |
| Authorization | Role-based (`admin`/`user`) + project-based access control |
| Admin whitelist | `ADMIN_EMAILS` environment variable |
| Input limits | File count, size, text chars enforced at workflow start |
| PII detection | 4 regex patterns (email, phone, SSN, credit card) |
| Governance rules | 5 seeded rules: PII disclosure, data retention (90 days), financial threshold ($100K), export controls, third-party data consent |
| Policy engine | `rules_engine_check` tool uses LLM reasoning against stored rules |
| Data retention | Workflow inputs auto-expire after 30 days (`WORKFLOW_INPUT_RETENTION_DAYS`) |
| API key masking | Settings display `sk-****...****last4` format |

---

## Observability

| Metric | Implementation |
|--------|---------------|
| Token tracking | Per-step prompt/completion/total tokens |
| Cost estimation | Official pricing for 15+ models (GPT-4o, GPT-5, o3, o4-mini, etc.) + live provider catalog fallback |
| Per-agent breakdown | Cost and latency by agent name |
| Per-provider breakdown | Cost by provider (gateway, openrouter, groq, nvidia) |
| Timeline | Runs per day for last 30 days |
| Unknown costs | `unknown_cost_trace_count` for missing pricing data |

---

## A2A communication

- **HTTP-based agent dispatch** with AgentCard fetching
- **MongoDB message broker** (`a2a_messages` collection) for audit trails
- **Shared-secret authentication** via `X-AIGERS-A2A-SECRET` header
- **4 message types**: `result`, `context`, `delegation`, `alert`
- **Limitations**: No central discovery registry, no retry logic, no routing intelligence — simple HTTP POST with logging

---

## Vector search

- **Primary**: MongoDB Atlas Search `$vectorSearch` with `numCandidates` tuning
- **Fallback**: In-app cosine similarity over up to 4000 documents
- **Embedding model**: `text-embedding-3-small` (configurable)
- **Chunk storage**: `aigers_chunks` collection with metadata + embeddings

---

## Multi-provider LLM runtime

| Provider | Default Base URL | Key Feature |
|----------|-----------------|-------------|
| Gateway (default) | `LLM_BASE_URL` env | Internal/enterprise gateway |
| Custom | `LLM_BASE_URL` env | User-configured endpoint |
| OpenRouter | `https://openrouter.ai/api/v1` | Model aggregation |
| Groq | `https://api.groq.com/openai/v1` | Fast inference |
| NVIDIA | `https://integrate.api.nvidia.com/v1` | GPU inference |

- Per-user settings stored in MongoDB (`user_settings` collection)
- Live model discovery from provider's `/models` endpoint
- Fallback to 8 hardcoded models if discovery fails
- Per-user API keys for external tools (GitHub, SerpAPI, OpenWeather)

---

## Quick start — run it locally from VS Code

> **Prerequisites**
> - Python 3.11+ (3.12 OK)
> - Node.js 18+ (20 recommended)
> - MongoDB running locally on `mongodb://localhost:27017` (or a remote Atlas URI with Vector Search enabled)
> - Tiger Analytics AI Gateway API key (or any OpenAI-compatible provider)
> - VS Code with the Python extension

### 1 · Clone
```bash
git clone https://github.com/yathik-2622/aigers-universe.git
cd aigers-universe
```

### 2 · Backend setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scriptsctivate
pip install -r requirements.txt
cp .env.example .env                # then edit values (see table below)
```

Required `.env` values:

| Key | Example | Notes |
|---|---|---|
| `LLM_BASE_URL` | `https://api.ai-gateway.tigeranalytics.com` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `sk-...` | Your gateway key |
| `LLM_MODEL` | `gpt-4o` | Default model for all agents |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim for vector search |
| `MONGO_URL` | `mongodb://localhost:27017` | Local Mongo or Atlas URI |
| `DB_NAME` | `aigers_universe` | Database name |
| `APP_HOST` | `0.0.0.0` | Bind address |
| `APP_PORT` | `8000` | Backend port |
| `CORS_ORIGINS` | `*` | Or comma-separated origins |
| `LOG_LEVEL` | `INFO` | DEBUG/INFO/WARNING/ERROR |
| `LOG_JSON_FORMAT` | `false` | `true` for production JSON logs |
| `HITL_TIMEOUT_SECONDS` | `3600` | Auto-reject if no human action |
| `JWT_SECRET` | `your-secret-key` | JWT signing secret |
| `ADMIN_EMAILS` | `admin@company.com` | Comma-separated admin emails |

Run the backend:
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```
- Health: <http://localhost:8001/api/health>
- Swagger: <http://localhost:8001/docs>
- MCP: <http://localhost:8001/mcp>

### 3 · Frontend setup
Open a second terminal in VS Code:
```bash
cd frontend
cp .env.example .env                # edit VITE_REACT_APP_BACKEND_URL
yarn install                        # or: npm install
yarn start                          # or: npm run start
```

`.env`:
```env
VITE_REACT_APP_BACKEND_URL=http://localhost:8001
```

Frontend dev server: <http://localhost:3000>

### 4 · VS Code launch config (optional but nice)
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend · uvicorn",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["server:app", "--reload", "--host", "0.0.0.0", "--port", "8001"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/backend/.env",
      "jinja": true
    }
  ]
}
```

And `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Frontend · vite",
      "type": "shell",
      "command": "yarn start",
      "options": { "cwd": "${workspaceFolder}/frontend" },
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
```

Then **F5** runs the backend with breakpoints; **Terminal → Run Task → Frontend · vite** runs the UI.

### 5 · First-time smoke test
```bash
# Health
curl -s http://localhost:8001/api/health

# Seeded marketplace
curl -s http://localhost:8001/api/marketplace/templates | jq '.count'

# Install a template (idempotent)
curl -s -X POST http://localhost:8001/api/marketplace/templates/tpl_data_extractor/install   -H 'Content-Type: application/json' -d '{}'

# Invoke the installed agent (verifies LLM gateway end-to-end)
AGENT_ID=$(curl -s http://localhost:8001/api/platform/agents | jq -r '.agents[0].agent_id')
curl -s -X POST http://localhost:8001/api/platform/agents/$AGENT_ID/invoke   -H 'Content-Type: application/json'   -d '{"input_data":{"text":"Contract dated 2024-03-15 between Acme Inc and Beta Corp for $50,000 services."}}' | jq
```

Expected: a JSON output with `entities`, `dates`, `amounts`, plus `tokens_used` and `latency_ms`.

### 6 · Run the platform tests
```bash
cd backend
pytest tests/test_platform_e2e.py -v
```

> The suite needs a live `LLM_API_KEY` because it executes a real workflow end-to-end. Use a test gateway or a low-quota key.

### 7 · Build the frontend for production
```bash
cd frontend
yarn build      # outputs dist/
yarn preview    # serves dist/ on port 3000 to verify
```

The `dist/` folder can be served by any static host (Nginx, S3+CloudFront, Vercel, Netlify). Point `VITE_REACT_APP_BACKEND_URL` at your production API before building.

---

## Sample `.env` files

### `backend/.env.example`
```env
LLM_BASE_URL=https://api.ai-gateway.tigeranalytics.com
LLM_API_KEY=replace-with-your-gateway-key
LLM_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small
MONGO_URL=mongodb://localhost:27017
DB_NAME=aigers_universe
APP_HOST=0.0.0.0
APP_PORT=8000
CORS_ORIGINS=*
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false
HITL_TIMEOUT_SECONDS=3600
JWT_SECRET=your-jwt-secret-key
ADMIN_EMAILS=admin@company.com
```

### `frontend/.env.example`
```env
VITE_REACT_APP_BACKEND_URL=http://localhost:8001
```

> The real `backend/.env` and `frontend/.env` are git-ignored — secrets never leak into the public repo.

---

## Project layout

```
.
├── backend/
│   ├── main.py · server.py
│   ├── config.py · logging_config.py
│   ├── api/             # 14 routers under /api/*
│   ├── core/            # llm_router · agent_registry · workflow_engine · framework_runners · report_builder · grounding · pii_detector · prompt_templates
│   ├── mcp_tools/       # FastMCP tool server (20 tools, 6 categories)
│   ├── a2a/             # python-a2a + Mongo audit broker
│   ├── hitl/            # interrupt/resume manager + timeout governance
│   ├── observability/   # tracer + cost aggregations + timeline
│   ├── vectorstore/     # MongoDB Atlas Search + cosine fallback
│   ├── document_processing/  # PDF/DOCX/TXT parsers + chunking
│   ├── middleware/      # request_id + structured log + CORS
│   ├── storage/         # File upload handling + temp storage
│   ├── db/              # Motor client · seed (35 templates + 5 rules) · repositories · collection_names
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/        # 18 product pages (Dashboard · Marketplace · Agents · Builder · Run · HITL · Observability · etc.)
│   │   ├── components/   # layout · flow (ReactFlow) · common · graph
│   │   ├── context/      # AuthContext · SettingsContext · TitleContext
│   │   ├── api/          # 14 axios + EventSource clients
│   │   ├── lib/          # modelOptions.js · projectStorage.js
│   │   ├── App.jsx · main.jsx · index.css
│   ├── vite.config.js
│   └── tailwind.config.js
├── docs/
│   ├── screenshots/      # 7 PNG/JPEG previews (01-dashboard through 07-observability)
│   ├── e2e-testing.html
│   └── platform-documentation.html
├── memory/
│   └── PRD.md
├── USER_GUIDE.md
└── README.md
```

---

## Environment variables (complete reference)

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `LLM_API_KEY` | API key for LLM provider | `sk-...` |
| `JWT_SECRET` | Secret for JWT signing | `your-secret-key` |

### LLM Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://llm-gateway.tigeranalytics.com` | **Change this for external use** |
| `LLM_MODEL` | `gpt-4o` | Default model for all agents |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model for vector search |

### App Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `APP_HOST` | `0.0.0.0` | Backend bind address |
| `APP_PORT` | `8000` | Backend port |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins |
| `JWT_EXPIRES_HOURS` | `24` | JWT token lifetime |
| `ADMIN_EMAILS` | `""` | Comma-separated admin emails |

### External API Keys (optional)
| Variable | Required For | Description |
|----------|-------------|-------------|
| `SERPAPI_KEY` | Market research | Live Google search results |
| `OPENWEATHER_API_KEY` | Weather tools | OpenWeather API |
| `GITHUB_TOKEN` | GitHub repo import | Repository analysis |

### A2A Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `A2A_SHARED_SECRET` | `""` | Secret for A2A authentication |
| `A2A_PUBLIC_BASE_URL` | `""` | Public callback URL for A2A |

### Governance & Limits
| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_STEP_TIMEOUT_SECONDS` | `300` | Max seconds per agent step |
| `HITL_TIMEOUT_SECONDS` | `3600` | Max seconds to wait for HITL approval |
| `WORKFLOW_INPUT_MAX_FILES` | `10` | Max files per workflow |
| `WORKFLOW_INPUT_MAX_TOTAL_BYTES` | `52428800` | Max total file size (50MB) |
| `WORKFLOW_INPUT_MAX_TEXT_CHARS` | `500000` | Max text chars per workflow |
| `WORKFLOW_INPUT_RETENTION_DAYS` | `30` | Days to retain workflow inputs |
| `CHAT_INPUT_MAX_FILES` | `5` | Max files per copilot message |
| `CHAT_INPUT_MAX_FILE_BYTES` | `10485760` | Max file size per copilot message (10MB) |
| `CHAT_INPUT_MAX_TEXT_CHARS` | `100000` | Max text chars per copilot message |

### Vector Search
| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_VECTOR_USE_ATLAS_SEARCH` | `True` | Use Atlas Search vs fallback cosine |
| `MONGO_VECTOR_INDEX_NAME` | `vector_index` | Atlas Search index name |

### Observability
| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level |
| `LOG_JSON_FORMAT` | `False` | JSON vs plain text logs |
| `OFFICIAL_DOCS_MAX_RESULTS` | `5` | Max results for docs search |
| `WEBPAGE_FETCH_TIMEOUT_SECONDS` | `20` | Timeout for webpage fetch |

---

## Known limitations

- **Agno framework**: Token usage tracking returns 0 (framework limitation)
- **CrewAI**: Requires isolated runtime environment (creates `.crewai_runtime/`); falls back to LangChain if bootstrap fails
- **A2A**: HTTP-based dispatch without central discovery registry or retry logic
- **SSE**: Polling-based push (500ms MongoDB polls), not true event-driven streaming
- **Market research**: Requires `SERPAPI_KEY` for live search; falls back to Wikipedia + official docs without it
- **Official docs search**: Limited to Java, Python, Spring, .NET
- **PII findings**: Detected but not rendered in markdown reports (stored in structured data only)

---

## New APIs

- `POST /api/auth/login` — JWT authentication
- `GET /api/auth/me` — Current user profile
- `GET /api/projects` — List projects
- `POST /api/projects` — Create project
- `GET /api/admin/overview` — Admin analytics dashboard
- `POST /api/tool-chat/message` — Copilot playground message
- `POST /api/policies/upload` — Upload policy document
- `GET /api/platform/models` — Available model catalog

---

## Notes

- **Auth**: JWT-backed with role-based access control (`admin`/`user`). Wrap with your IDP / SSO before production if needed.
- **Scaling HITL**: The engine uses MongoDB-backed state persistence. For multi-replica deployments, ensure MongoDB is shared across instances.
- **GitHub push**: Use the **Save to GitHub** button in the chat input, or download the code and push manually (see USER_GUIDE for instructions).
- **Auto-seed**: On first startup, the backend seeds 35 marketplace templates and 5 governance rules automatically.

---

## License

MIT
