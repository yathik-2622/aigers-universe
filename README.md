# AIger's Universe

> Enterprise AI Engineering & Agentic Orchestration Platform.
> Bring any agent. Orchestrate every workflow. Watch every token.

A generic, domain-agnostic platform for registering AI agents (LangGraph / CrewAI / LangChain), composing them into multi-agent workflows on a visual ReactFlow canvas, connecting them via **MCP** + **A2A**, gating them via **HITL**, and observing everything in real time.

## What's New

- JWT-backed sign-in with user and admin roles.
- Projects workspace for grouping related workflows.
- Project member sharing and shared workflow visibility by project.
- Agent code export for LangGraph, LangChain, CrewAI, Agno, and Langflow-style JSON.
- Tool Playground for chat-style interaction with MCP tools, inspired by Langflow's Playground/Projects concepts.
- Policy-aware workflow builder with custom policy creation and policy document upload.
- Per-user marketplace installed state.
- Admin-side project deletion from the control tower.
- Agent model selection from the gateway model catalog.
- Mongo-backed workflow resume after interruption or backend restart.

> **Yes — this _is_ a drag-and-drop application.** Open the **Workflow Builder** page and drag agent cards from the left rail onto the ReactFlow canvas to compose pipelines. The drag-and-drop is _specifically_ for orchestrating AI agents (not a general Bubble-style page builder).

For the full end-user walkthrough — concepts, prompts, **screenshots of every page**, best practices, page-by-page reference, API reference, and troubleshooting — read **[USER_GUIDE.md](./USER_GUIDE.md)**.

---

## Visual tour

| | |
|---|---|
| ![Dashboard](./docs/screenshots/01-dashboard.jpeg) | ![Marketplace](./docs/screenshots/02-marketplace.jpeg) |
| **Mission Control** — live KPIs + run feed | **Marketplace** — 5 idempotent agent templates |
| ![Builder](./docs/screenshots/04-builder-empty.jpeg) | ![Run](./docs/screenshots/05-workflow-run.jpeg) |
| **Workflow Builder** — drag-drop ReactFlow canvas | **Workflow Run** — SSE-driven live pipeline + A2A log |
| ![HITL](./docs/screenshots/06-hitl.jpeg) | ![Observability](./docs/screenshots/07-observability.jpeg) |
| **HITL Approvals** — paused workflows + Approve/Reject | **Observability** — Recharts + traces |

---

## Tech stack

**Backend**: FastAPI · Motor (async MongoDB) · `fastmcp` (MCP) · `fastapi-mcp` (mount `/mcp`) · `python-a2a` · `langgraph` + `InMemorySaver` · `openai` (Tiger Analytics gateway, gpt-4o + text-embedding-3-small) · `faiss-cpu` · `PyMuPDF` + `python-docx` · `structlog`.

**Frontend**: Vite · React 18 · React Router 6 (v7 future flags on) · `reactflow` · `recharts` · `tailwindcss` (dark enterprise theme) · `lucide-react` · `sonner`.

**Storage**: MongoDB (`agents`, `workflow_definitions`, `workflow_runs`, `agent_traces`, `hitl_records`, `a2a_messages`, `documents`, `governance_rules`, `marketplace_templates`) + FAISS (`IndexFlatL2`, disk-persisted).

---

## Architecture

```
Vite/React (port 3000)
  ├── /dashboard /marketplace /agents
  ├── /builder (ReactFlow drag-drop)
  ├── /runs/:id (SSE-driven, A2A log)
  ├── /hitl /observability
  └── EventSource → /api/workflows/runs/:id/stream

FastAPI (port 8001, prefix /api)
  ├── /api/platform  (agent CRUD + invoke)
  ├── /api/workflows (defs · runs · SSE stream · report)
  ├── /api/hitl      (pending · approve · reject)
  ├── /api/observability (metrics · traces)
  ├── /api/marketplace (idempotent install)
  ├── /api/documents (PDF/DOCX/TXT upload → FAISS)
  └── /mcp           (FastApiMCP SSE endpoint)

Engine:
  workflow_engine (LangGraph StateGraph + InMemorySaver)
   └── agent_registry → LLM tool-call loop → MCP tools
   └── tracer → MongoDB agent_traces
   └── a2a → MongoDB a2a_messages
   └── hitl_manager → MongoDB hitl_records + resume_signals
```

---

## Quick start — run it locally from VS Code

> **Prerequisites**
> - Python 3.11+ (3.12 OK)
> - Node.js 18+ (20 recommended)
> - MongoDB running locally on `mongodb://localhost:27017` (or a remote Atlas URI)
> - Tiger Analytics AI Gateway API key (OpenAI-compatible)
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
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # then edit values (see table below)
```

Required `.env` values:

| Key | Example | Notes |
|---|---|---|
| `LLM_BASE_URL` | `https://api.ai-gateway.tigeranalytics.com` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `sk-...` | Your Tiger Analytics gateway key |
| `LLM_MODEL` | `gpt-4o` | Override if your gateway uses different ids |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim |
| `MONGO_URL` | `mongodb://localhost:27017` | Local Mongo |
| `DB_NAME` | `aigers_universe` |  |
| `APP_HOST` | `0.0.0.0` |  |
| `APP_PORT` | `8001` | Locally any free port works |
| `CORS_ORIGINS` | `*` | Or comma-separated list of origins |
| `LOG_JSON_FORMAT` | `false` | `true` for production JSON logs |
| `FAISS_INDEX_PATH` | `./vectorstore/data/faiss_index` | Created on first upload |
| `HITL_TIMEOUT_SECONDS` | `300` | Auto-reject if no human action within timeout |

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
curl -s -X POST http://localhost:8001/api/marketplace/templates/tpl_data_extractor/install \
  -H 'Content-Type: application/json' -d '{}'

# Invoke the installed agent (verifies LLM gateway end-to-end)
AGENT_ID=$(curl -s http://localhost:8001/api/platform/agents | jq -r '.agents[0].agent_id')
curl -s -X POST http://localhost:8001/api/platform/agents/$AGENT_ID/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input_data":{"text":"Contract dated 2024-03-15 between Acme Inc and Beta Corp for $50,000 services."}}' | jq
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
LLM_API_KEY=replace-with-your-tiger-analytics-gateway-key
LLM_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small
MONGO_URL=mongodb://localhost:27017
DB_NAME=aigers_universe
APP_HOST=0.0.0.0
APP_PORT=8001
CORS_ORIGINS=*
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false
FAISS_INDEX_PATH=./vectorstore/data/faiss_index
HITL_TIMEOUT_SECONDS=300
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
│   ├── api/             # 6 routers under /api/*
│   ├── core/            # llm_router · agent_registry · workflow_engine
│   ├── mcp_tools/       # FastMCP tool server (5 tools)
│   ├── a2a/             # python-a2a + Mongo audit
│   ├── hitl/            # interrupt/resume manager
│   ├── observability/   # tracer + aggregations
│   ├── vectorstore/     # FAISS (disk-persisted)
│   ├── middleware/      # request_id + structured log
│   ├── db/              # Motor client · seed · repositories
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/        # Dashboard · Marketplace · Agents · Builder · Run · HITL · Observability
│   │   ├── components/   # layout · flow (ReactFlow) · common
│   │   ├── context/      # TitleContext
│   │   ├── api/          # axios + EventSource clients
│   │   ├── App.jsx · main.jsx · index.css
│   ├── vite.config.js
│   └── tailwind.config.js
├── docs/screenshots/    # PNG/JPEG previews used in USER_GUIDE.md
├── USER_GUIDE.md
└── README.md
```

---

## Notes
- **Auth**: not implemented — open access by design for the MVP. Wrap with your IDP / SSO before production.
- **Scaling HITL**: the engine uses `InMemorySaver`. Swap to `AsyncPostgresSaver` from `langgraph-checkpoint-postgres` if you need multi-replica HITL resume.
- **GitHub push**: use Emergent's **Save to GitHub** button in the chat input, or download the code and push manually (see USER_GUIDE for instructions).

---

## New APIs
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/admin/overview`
- `POST /api/tool-chat/message`
- `POST /api/policies/upload`
- `GET /api/platform/models`

## License
MIT.
