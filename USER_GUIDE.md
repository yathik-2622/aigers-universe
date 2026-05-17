# AIger's Universe — Complete User Guide

> Enterprise AI Engineering & Agentic Orchestration Platform.
> Bring any agent. Orchestrate every workflow. Watch every token.

This guide takes you from cold start to a finished, observable multi-agent run. Follow the steps in order on your first run — after that, jump to whichever section you need.

---

## Table of contents
1. [What is AIger's Universe?](#what-is-aigers-universe)
2. [Live URLs in this environment](#live-urls-in-this-environment)
3. [Core concepts in 60 seconds](#core-concepts-in-60-seconds)
4. [The platform's MCP tools](#the-platforms-mcp-tools)
5. [First-run walkthrough (10 minutes)](#first-run-walkthrough-10-minutes)
6. [Page-by-page reference](#page-by-page-reference)
7. [Best practices for great agent orchestration](#best-practices-for-great-agent-orchestration)
8. [Authoring your own agents from scratch](#authoring-your-own-agents-from-scratch)
9. [Document inputs, FAISS, and `semantic_search`](#document-inputs-faiss-and-semantic_search)
10. [HITL gates — when, how, and what to put in the prompt](#hitl-gates--when-how-and-what-to-put-in-the-prompt)
11. [Observability: reading the dashboard](#observability-reading-the-dashboard)
12. [API reference](#api-reference)
13. [Troubleshooting](#troubleshooting)
14. [Glossary](#glossary)

---

## What is AIger's Universe?
A generic, domain-agnostic platform that lets you:
- **Register** any AI agent (LangGraph / CrewAI / LangChain) with a name, framework, system prompt, and tool allow-list.
- **Compose** multi-agent workflows visually on a ReactFlow drag-and-drop canvas.
- **Connect** agents to platform tools via **MCP** (Model Context Protocol, `fastmcp`).
- **Communicate** between agents via **A2A** (Agent-to-Agent, `python-a2a`) — every message is persisted as an audit trail.
- **Gate** flow execution with **HITL** approvals — LangGraph `interrupt()` + `InMemorySaver` checkpoint.
- **Observe** every run live: token usage, latency, cost, traces, A2A timeline.

The platform itself is the runtime. *You* bring the agents and decide the workflow.

---

## Live URLs in this environment
| Surface | URL |
|---|---|
| Frontend | https://e349b436-dd11-41fa-876a-74ae285ee970.preview.emergentagent.com |
| API root | `${FRONTEND_URL}/api` |
| Health | `${FRONTEND_URL}/api/health` |
| Swagger | `${FRONTEND_URL}/docs` |
| MCP SSE endpoint | `${FRONTEND_URL}/mcp` |

---

## Core concepts in 60 seconds
- **Agent** — an LLM persona with a system prompt, framework, and a list of tools it's allowed to call.
- **Tool** — a callable function exposed through MCP. Tools live on the platform side, not inside agents.
- **Workflow** — an ordered chain of agents on the canvas. Execution flows left → right by node X position.
- **Run** — one execution of a workflow. Has a unique `run_id`. Status: `running → completed | failed | paused`.
- **A2A message** — a structured payload one agent sends to the next (`result`, `context`, `delegation`, `alert`).
- **HITL gate** — a checkpoint where a human must approve before the workflow continues.
- **Trace** — one row per agent execution: tokens, latency, tools called, output.

---

## The platform's MCP tools
Five generic tools ship out of the box. Agents enable them in their tool allow-list and the LLM decides when to call them.

| Tool | What it does | Typical use |
|---|---|---|
| `semantic_search` | FAISS similarity over uploaded documents | "Find clauses about indemnity in the uploaded contract" |
| `document_store` | CRUD on agent-owned MongoDB collections (`agent_data_*`) | Persist intermediate findings across agents |
| `rules_engine_check` | Runs text against seeded governance rules via LLM | PII / compliance / export-control sweeps |
| `risk_scorer` | LLM scores 0–10 + RED/AMBER/GREEN with concerns | Risk triage on contract clauses, transactions |
| `trigger_hitl` | Pauses workflow and creates an approval card | Compliance violations, dollar thresholds |

> Tools are LLM-driven. The model decides if and when to invoke them based on the agent's system prompt. Mention the tool by name in the prompt to nudge the model.

---

## First-run walkthrough (10 minutes)

### 1 · Install agent templates (1 min)
1. Open the frontend URL.
2. Click **Marketplace** in the sidebar.
3. Click **Install** on at least these three:
   - **Document Classifier**
   - **Data Extractor**
   - **Risk Analyzer** *(optional but useful)*
4. Re-clicking Install is now idempotent — the same agent will be returned, not duplicated. If you want a variant, hit the API directly with `custom_name`.

### 2 · Upload a document (1 min)
1. Click **Workflow Builder** in the sidebar.
2. In the left rail, click **Upload PDF / DOCX / TXT** (max 20 MB).
3. Wait for `chunks indexed` confirmation — FAISS now has embeddings for every 1000-char chunk with 200-char overlap.
4. The new document appears in the file list below. Click to select it as the input.

### 3 · Compose a workflow on the canvas (2 min)
1. From the left library, **drag** `Document Classifier` onto the canvas, then drag `Data Extractor` to its right.
2. Connect them: hover the right edge of the first node until you see a dot, then drag to the left edge of the second.
3. Click a node to open the **Config Panel** on the right:
   - Edit the **System Prompt** for this workflow context.
   - Toggle which **MCP tools** the agent can use.
   - Toggle **HITL enabled** if you want to pause after this step.
4. Give your workflow a name in the top input (e.g. `classify-then-extract`).
5. Click **Save**.

> Order matters — agents run left → right by `position.x`. Keep them roughly horizontal.

### 4 · Run the workflow (1 min)
1. Click **Run workflow** at the top of the canvas.
2. You're redirected to `/runs/{run_id}` — the live run page.
3. The header now shows the workflow name and the run id.

### 5 · Watch live execution (3 min)
- The **agent pipeline** shows live status colours:
  - **Gray** → pending
  - **Indigo + pulse** → running
  - **Green** → completed
  - **Amber** → paused (HITL)
  - **Red** → failed
- The **A2A Message Log** on the right shows every inter-agent payload in real time.
- The page uses **Server-Sent Events** under the hood — updates are instant (with a 3-second polling fallback if SSE drops). A `LIVE` badge appears in the topbar while streaming.

### 6 · Read the report (1 min)
When the run reaches `completed`, the **View report** button appears in the top bar.
The modal shows:
- The final output (the last agent's structured response).
- `outputs_by_agent` — what every agent returned, named by agent.

### 7 · Open Observability (1 min)
1. Click **Observability** in the sidebar.
2. **Metric cards**: total runs, total tokens, avg latency, estimated cost (gpt-4o blended pricing).
3. **Token Usage by Agent** (Recharts bar) — your cost distribution.
4. **Avg Latency by Agent** (Recharts bar) — your performance distribution.
5. **Workflow Runs Over Time** (Recharts line).
6. **Recent traces** table — one row per agent execution.

---

## Page-by-page reference

### Sidebar
- Collapsible (click the **Collapse** button at the bottom of the nav). Preference is saved in `localStorage`.
- Logo is a transparent stacked hexagon (no solid background).
- Pages: Dashboard · Marketplace · Agents · Workflow Builder · HITL Approvals · Observability.

### Dashboard
- Hero with quick CTAs (Marketplace, Builder).
- Four KPI cards: active agents, saved workflows, pending HITL, total tokens.
- Recent runs feed (last 8) with status badges.
- Approvals queue (pending HITL only).

### Marketplace
- 5 generic templates (Document Classifier, Data Extractor, Risk Analyzer, Compliance Checker, Recommendation Advisor).
- Search bar filters by name/description.
- One-click idempotent install.

### Agents
- Lists all active agents (deactivated ones hidden).
- **New agent** modal lets you register a fully custom agent: name · framework · description · system_prompt · tool allow-list · HITL toggle.
- Each card has a trash icon for soft-delete.

### Workflow Builder
- ReactFlow canvas with custom `AgentNode` (shows framework badge, HITL badge, tool count).
- Right-side **Config Panel** opens when you click a node — edits go live on save.
- Left rail: agent library + document upload + recent document picker.
- Top bar: workflow name input · **Save** · **Run workflow**.

### Workflow Run
- Live ReactFlow pipeline of the executing chain.
- Status colour-coded per node.
- HITL banner appears when paused, with a one-click jump to the HITL panel.
- A2A message log streams in real time (right-side panel).
- Topbar shows workflow name, run id, status, and a **LIVE** indicator while SSE is connected.
- **View report** button surfaces on completion.

### HITL Approvals
- **Pending** cards (amber) with reason · severity · context · note-taking textarea · Approve / Reject buttons.
- **History** table with outcome, reviewer note, and resolved timestamp.

### Observability
- 4 KPI cards (runs, tokens, avg latency, cost).
- 3 Recharts: token bar, latency bar, timeline line.
- Recent traces table with one row per agent execution (workflow id link, agent, framework, step, tokens, latency, tools called, status, timestamp).

---

## Best practices for great agent orchestration

### Prompt shape
A solid agent system prompt has 4 parts:
1. **Role** — "You are a senior compliance officer."
2. **Task** — "Given a contract excerpt, identify regulatory violations."
3. **Tool guidance** — "When in doubt, call `rules_engine_check` with `rule_category='compliance'`. Call `trigger_hitl` with `severity='HIGH'` if you detect unredacted PII."
4. **Output schema** — "Respond ONLY in JSON: `{\"violations\": [...], \"status\": \"PASS\"|\"FAIL\"|\"REVIEW\"}`."

The platform auto-parses your JSON output when it can — if it can't, it stores the raw text in `output.text`.

### Pipeline shape
- **Top of funnel**: classifier or extractor (cheap, deterministic).
- **Middle**: analysers / scorers (use `risk_scorer`, `rules_engine_check`).
- **Bottom**: synthesiser / advisor (combines all upstream outputs into a final recommendation).

### A2A discipline
- The platform automatically sends a `result` message from each agent to the next. You don't need to call `send_a2a_message` yourself in your prompts.
- If you want richer signalling, ask your agent to emit a structured `alert` payload — the next agent will see it in its `UPSTREAM AGENT MESSAGES` block.

### Cost control
- Use a small classifier early to short-circuit cheap.
- Reserve the highest-temperature/largest model only for the final synthesiser.
- Watch the **Token Usage by Agent** chart — outliers are your tuning targets.

---

## Authoring your own agents from scratch

### From the UI
**Agents page → New agent**. Fill the form, pick framework + tools, save. The agent immediately appears in the Builder library.

### From the API
```bash
curl -X POST "$BASE/api/platform/agents" -H "Content-Type: application/json" -d '{
  "name": "Contract Indemnity Analyzer",
  "framework": "langgraph",
  "description": "Identifies and scores indemnity clauses.",
  "system_prompt": "You are an M&A lawyer specialising in indemnity. ...",
  "tools": ["semantic_search", "risk_scorer"],
  "hitl_enabled": false
}'
```

Update the prompt later:
```bash
curl -X PUT "$BASE/api/platform/agents/$AGENT_ID" -H "Content-Type: application/json" -d '{
  "system_prompt": "...new prompt...",
  "tools": ["semantic_search", "risk_scorer", "rules_engine_check"]
}'
```

Test the agent in isolation:
```bash
curl -X POST "$BASE/api/platform/agents/$AGENT_ID/invoke" -H "Content-Type: application/json" -d '{
  "input_data": {"text": "Acme shall indemnify Beta for all third-party claims..."}
}'
```

---

## Document inputs, FAISS, and `semantic_search`
1. Upload via **Builder → Upload** or `POST /api/documents/upload`.
2. Each upload is text-extracted (PyMuPDF for PDF, python-docx for DOCX, raw for TXT).
3. Text is chunked at 1000 chars with 200-char overlap.
4. Each chunk is embedded via `text-embedding-3-small` and added to FAISS `IndexFlatL2`.
5. The FAISS index is persisted to `/app/backend/vectorstore/data/faiss_index.*`.
6. When an agent calls `semantic_search(query, top_k=5)`, the tool embeds the query and returns the top-k chunks with similarity scores + metadata (document_id, filename, chunk_index).

Tip: Mention "use `semantic_search` to ground your answer" in the system prompt to ensure the model retrieves before reasoning.

---

## HITL gates — when, how, and what to put in the prompt
To make an agent pause for human review on certain conditions:

1. Add `trigger_hitl` to the agent's tool allow-list.
2. (Optional) Set `hitl_enabled = true` on the agent for clarity in the UI.
3. In the system prompt, tell the model exactly when to call `trigger_hitl`:
   ```
   If `rules_engine_check` returns any rule with severity='HIGH' that is_violated,
   call trigger_hitl with severity='HIGH' and a one-sentence reason that includes
   the rule_name.
   ```
4. When the model calls the tool, the platform:
   - Inserts a `hitl_records` row with `status: pending`.
   - Sets the workflow run to `status: paused`.
   - The run page shows an amber banner and the paused agent node turns amber.
5. The reviewer opens **HITL Approvals**, reads the reason + context, types a note, and clicks **Approve** or **Reject**.
6. The workflow resumes from where it paused (LangGraph state restored from `InMemorySaver`).

Timeout: if no decision lands within `HITL_TIMEOUT_SECONDS` (default 300s), the workflow is auto-rejected for safety.

---

## Observability: reading the dashboard

### Metric cards
- **Total runs** — count of `workflow_runs` documents.
- **Total tokens** — sum of `tokens_used` across all `agent_traces`.
- **Avg latency (ms)** — mean of `latency_ms` per trace.
- **Estimated cost ($)** — blended at $6.25 / 1M tokens (rough mid-point of gpt-4o input/output prices). Override this in `backend/observability/tracer.py` if your gateway charges differently.

### Token Usage by Agent
Bar chart, descending. Tells you which agent dominates your cost.

### Avg Latency by Agent
Bar chart. Slow agents are usually verbose-prompt agents — trim the system prompt or split into two stages.

### Workflow Runs Over Time
Line chart by date. Useful for spotting traffic spikes.

### Recent traces table
Click the run id to jump back into the live run page.

---

## API reference (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET    | /health                                | Health |
| POST   | /platform/agents                       | Register an agent |
| GET    | /platform/agents                       | List active agents |
| GET    | /platform/agents/{id}                  | Get agent |
| PUT    | /platform/agents/{id}                  | Update agent |
| DELETE | /platform/agents/{id}                  | Deactivate (soft delete) |
| POST   | /platform/agents/{id}/invoke           | Invoke agent directly |
| GET    | /platform/tools                        | List MCP tool names |
| POST   | /workflows                             | Create workflow definition |
| GET    | /workflows                             | List workflows |
| GET    | /workflows/{id}                        | Get definition + canvas |
| POST   | /workflows/{id}/run                    | Start a run (async) |
| GET    | /workflows/runs/all                    | List recent runs |
| GET    | /workflows/runs/{run_id}               | Live snapshot + A2A messages |
| GET    | /workflows/runs/{run_id}/stream        | **SSE** stream of run state |
| GET    | /workflows/runs/{run_id}/report        | Final report (after completion) |
| GET    | /hitl/pending                          | Pending approvals |
| GET    | /hitl/all                              | All HITL records |
| POST   | /hitl/{id}/approve                     | Approve + resume |
| POST   | /hitl/{id}/reject                      | Reject + fail |
| GET    | /observability/metrics                 | Aggregate metrics |
| GET    | /observability/traces                  | Recent traces |
| GET    | /observability/traces/{run_id}/full    | Full per-run traces |
| POST   | /documents/upload                      | Upload PDF/DOCX/TXT |
| GET    | /documents                             | List documents |
| GET    | /marketplace/templates                 | List templates |
| POST   | /marketplace/templates/{id}/install    | **Idempotent** install |
| —      | /mcp                                   | MCP SSE endpoint (FastApiMCP) |

---

## Troubleshooting
| Symptom | Cause / Fix |
|---|---|
| Backend won't start | `tail -n 100 /var/log/supervisor/backend.err.log` — usually missing env or DB unreachable |
| `401` from LLM | `LLM_API_KEY` invalid — replace in `backend/.env`, then `sudo supervisorctl restart backend` |
| `Agent invocation failed: insufficient quota` | Gateway out of credits — top up Tiger Analytics |
| FAISS returns empty | Upload at least one document |
| HITL not pausing | Agent must (a) have `trigger_hitl` in `tools` AND (b) prompt must instruct it to call the tool |
| Workflow stuck `running` | Check run status — if an agent threw, status flips to `failed` with `failure_reason` |
| ReactFlow canvas blank | Hard refresh (CSS not loaded) |
| SSE drops randomly | Frontend auto-falls back to 3s polling — no action needed |
| Duplicate agents | Old data — `POST /api/marketplace/templates/{id}/install` is now idempotent for default installs |

---

## Glossary
- **MCP** — Model Context Protocol. Open spec for exposing tools to LLM agents. We use `fastmcp` + `fastapi-mcp`.
- **A2A** — Agent-to-Agent. Google's open spec for inter-agent messaging. We use `python-a2a` for descriptors + Mongo for the message bus.
- **LangGraph** — Stateful graph orchestration over LangChain. We use it for the workflow chain + `interrupt()`/`Command` HITL resume.
- **InMemorySaver** — LangGraph checkpointer that keeps state in memory. Fine for single replica; switch to `AsyncPostgresSaver` when scaling.
- **FAISS** — Facebook AI similarity search. `IndexFlatL2` is exact, good up to ~100k vectors.
- **SSE** — Server-Sent Events. One-way HTTP stream we use for live run updates.
