# Hackathon Submission README

## Team Name
GenMinds Crew

## Theme Selected
Update this before final packaging: `Theme 1` or `Theme 2`

## Problem Statement
Enterprises struggle to move from isolated AI agents and prompt demos to governed, observable, production-style multi-agent systems. Teams need one platform where they can install agents, compose workflows visually, connect tools and knowledge sources, add human approvals, observe execution, and support real modernization or review use cases end to end.

## Solution Overview
AIger's Universe is an enterprise agent orchestration platform that lets users:

- install framework-native agents from a marketplace
- create custom agents using LangGraph, CrewAI, LangChain, or Agno
- build workflows visually on a drag-and-drop canvas
- connect agents to MCP tools and A2A communication
- use workflow-scoped inputs, reusable KB context, and GitHub imports
- pause sensitive decisions with HITL approval gates
- monitor live execution, traces, reports, and A2A logs
- use AIger Copilot to understand the platform, choose agents/tools, and plan workflows from a use case prompt

## Tech Stack Used

### Backend
- Python
- FastAPI
- Motor / MongoDB
- LangGraph
- LangChain
- CrewAI
- Agno
- FastMCP
- FastAPI-MCP
- OpenAI-compatible gateway
- FAISS
- PyMuPDF
- python-docx
- structlog

### Frontend
- React
- Vite
- Tailwind CSS
- React Router
- React Flow
- Recharts
- lucide-react
- sonner

## Architecture Summary
The frontend provides a premium multi-page control surface for agents, marketplace installs, workflow building, workflow runs, HITL, observability, and AIger Copilot. The backend exposes API routes for agent CRUD, workflow execution, MCP-backed tools, KB ingestion, workflow inputs, A2A routing, HITL pause/resume, and reporting. MongoDB stores agents, workflows, runs, traces, HITL records, documents, chat sessions, and A2A messages. FAISS supports reusable KB semantic search. The workflow engine coordinates multi-agent execution, tool calling, upstream context passing, and report generation.

## Setup Instructions

### Backend
1. Open the `backend` folder.
2. Create a virtual environment.
3. Install dependencies using `requirements.txt`.
4. Copy `.env.example` to `.env`.
5. Set required values:
   - `LLM_BASE_URL`
   - `LLM_API_KEY`
   - `LLM_MODEL`
   - `EMBEDDING_MODEL`
   - `MONGO_URL`
   - `DB_NAME`
   - `JWT_SECRET`

### Frontend
1. Open the `frontend` folder.
2. Install dependencies from `package.json`.
3. Set `VITE_REACT_APP_BACKEND_URL` in frontend `.env`.

## Run Instructions

### Backend
```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
yarn start
```

## Exact Submission Folder Layout

Create a top-level folder exactly like this:

```text
GenMindsCrew_Theme1_TPL2026/
```

or

```text
GenMindsCrew_Theme2_TPL2026/
```

Inside that folder, keep this structure:

```text
GenMindsCrew_Theme1_TPL2026/
├── README.md
├── code/
│   ├── backend/
│   └── frontend/
├── demo/
│   └── demo_video.mp4
├── pitch/
│   └── pitch_deck.pdf
└── impact/
    └── ROI/
        └── cost_value_summary.html
```

Practical mapping from this repo:

- `README.md`
  - use this file as the submission README or rename it during packaging
- `code/`
  - include `backend/`
  - include `frontend/`
- `demo/`
  - add `demo_video.mp4`
- `pitch/`
  - add `pitch_deck.pdf`
- `impact/ROI/`
  - add `cost_value_summary.html`

## Demo Checklist

- show marketplace install of a real agent
- show workflow auto-build or manual builder flow
- show workflow inputs or KB usage
- show real workflow execution
- show A2A message log or HITL gate
- show final report and outputs
- show AIger Copilot recommending agents/tools/workflow for a use case
