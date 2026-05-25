# AIger's Universe End-to-End Testing Guide

Browser version: [docs/e2e-testing.html](./docs/e2e-testing.html)

## 1. Purpose

This document covers only end-to-end testing of AIger's Universe across the real platform surfaces:

- authentication and workspace entry
- marketplace and agent availability
- workflow builder and orchestrator
- workflow inputs and reusable KB
- remote A2A validation
- workflow execution, HITL, observability, and reports
- AIger Copilot with live reasoning trace

---

## 2. Environment Setup

### 2.1 Backend prerequisites

Set these in `backend/.env`:

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `EMBEDDING_MODEL`
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`

Recommended:

- `GITHUB_TOKEN` for stronger GitHub import limits
- `A2A_SHARED_SECRET=change-this-local-a2a-secret`
- `A2A_PUBLIC_BASE_URL=http://localhost:8001`

### 2.2 Start services

Backend:

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

Frontend:

```bash
cd frontend
yarn start
```

---

## 3. Initial Smoke Entry

Confirm the following before deeper testing:

1. Login page opens.
2. Dashboard loads after login.
3. Marketplace templates are visible.
4. Agents page loads installed cards.
5. Workflow Builder loads ReactFlow.
6. AIger Copilot opens.
7. Run page opens and can stream updates.

---

## 4. End-to-End UI Flows

## 4.1 Marketplace to installed agent flow

1. Open `Marketplace`.
2. Install:
   - `Java to Spring Boot Architect`
   - `Java to Python Service Translator`
   - `Risk Analyzer`
   - `Compliance Checker`
   - `Recommendation Advisor`
3. Open `Agents`.
4. Verify installed cards show:
   - framework badge
   - model badge
   - tags
   - A2A state when enabled

Expected:

- install succeeds without duplicate confusion
- installed cards render correctly

---

## 4.2 Local card to remote A2A flow

1. In `Agents`, open `Local agent cards`.
2. Copy one local card URL.
3. Click `New agent`.
4. Set:
   - `A2A enabled = true`
   - `A2A mode = Remote`
5. Paste the copied URL.
6. Click `Test remote card`.
7. Save the agent.

Expected:

- remote card validation succeeds
- summary appears before save
- saved agent shows remote A2A state

---

## 4.3 Project-scoped workflow flow

1. Open `Projects`.
2. Create a project called `Wave 1`.
3. Open `Workflow Builder`.
4. In `Project scope`, choose `Wave 1`.
5. Name the workflow `Wave 1 Modernization`.

Expected:

- project appears in selector
- selection persists in builder state

---

## 4.4 Orchestrator planning flow

1. In `Workflow Builder`, enter:

   `Modernize this Java monolith into Spring Boot services, assess migration risk, and produce a phased remediation backlog.`

2. Click `Auto-build workflow`.
3. In the planner modal test:
   - `Edit`
   - `Replan`
   - `Reject`
4. Plan again.
5. Click `Accept`.

Expected:

- planner modal supports all actions
- accepted plan closes modal first
- workflow animates onto canvas
- focus follows active node during construction

---

## 4.5 Workflow input versus KB flow

### Run-scoped workflow inputs

1. In `Workflow inputs`, enter a run prompt.
2. Upload one or more files.
3. Import one public GitHub repo into workflow inputs.

Expected:

- file upload and repo import have separate states
- uploaded files appear in workflow input list
- imported repo appears separately
- workflow inputs do not merge into KB
- if files are selected by mistake, individual files can be removed before upload

### Reusable KB

1. In `Knowledge base`, upload one reusable architecture or policy document.
2. Switch KB mode to GitHub and import a separate repo into KB.
3. Upload a duplicate public file and verify the page highlights the existing record instead of showing a browser alert.

Expected:

- KB items remain separate from workflow inputs
- KB list updates correctly
- duplicate guidance is friendly and visibility-aware

---

## 4.6 Manual builder flow

1. Drag two installed agents to canvas.
2. Connect them with an edge.
3. Open each node config.
4. Change:
   - prompt
   - model
   - tools
   - input bindings
   - A2A mode
5. Save workflow.

Expected:

- node configuration persists
- workflow saves successfully
- node state reflects edits

## 4.6.1 Orchestrator market-research and activity stream

1. In `Workflow Builder`, use a broad commercial prompt such as:

   `Design an agentic modernization workflow for a regulated Java platform, assess whether the use case is commercially viable, and prepare reusable prompts plus a staged delivery architecture.`

2. Click `Auto-build workflow`.
3. Watch the transparent orchestrator activity stream on the canvas.
4. Open the planner modal and verify:
   - market readiness signal
   - live market research findings when tools are available
   - planner citations
   - suggested custom agent drafts when inventory coverage is incomplete

---

## 4.7 Modernization run flow

1. Use an orchestrator-built or manual workflow.
2. Add:
   - text goal
   - one Java file
   - one public Java repo import
   - optional KB architecture document
3. Click `Run workflow`.

Expected on run page:

1. active node is visually focused
2. statuses progress correctly
3. A2A messages appear and expand
4. report preparation state appears if needed
5. final report opens directly from the run page

Expected output:

- architecture findings
- risk findings
- remediation backlog
- readable report with citations and code blocks

---

## 4.8 Contract and compliance flow

1. In `Orchestrator AI`, enter:

   `Review this vendor contract for key extraction, operational risk, compliance issues, and a final approval recommendation.`

2. Auto-build the workflow.
3. Accept the plan.
4. Upload a contract file.
5. Run the workflow.

Expected:

- extraction agent runs
- risk agent runs
- compliance can trigger HITL
- recommendation is produced
- report is viewable from the run page

---

## 4.9 HITL pause and return flow

1. Run a workflow likely to trigger `Compliance Checker`.
2. Wait for pause.
3. Open `HITL`.
4. Approve one run.
5. Repeat and reject another run.
6. From the live run page, use the HITL shortcut and approve there as well.

Expected:

- paused runs appear in HITL
- approval resumes execution
- rejection fails the run appropriately
- return-to-run behavior sends the operator back to the same run page

---

## 4.10 AIger Copilot end-to-end flow

1. Open `AIger Copilot`.
2. Confirm:
   - history rail on the left
   - central chat surface
   - mode, model, tool, and file controls in the composer
3. Start a new `AIger Copilot` mode chat.
4. Ask:

   `For a Java modernization use case, which agents should I install, which MCP tools should I enable, and what workflow should I build in this platform?`

5. Verify the answer references:
   - installed agents when available
   - marketplace templates when agents are missing
   - MCP tools by name
   - suggested workflow steps
6. Change model and preferred tool.
7. Attach 2 to 3 files and ask a grounded follow-up.
8. Start another chat in `Knowledgebase RAG` mode and ask:

   `Answer only from grounded sources: what do the latest repo docs and indexed KB say about citations, knowledge base retrieval, and graph visualization?`

9. Confirm the backend trace shows retrieval work such as live doc refresh, retriever execution, or refusal when evidence is missing.
10. Click at least one citation pill and confirm the modal loads the underlying source content, not only the label.
11. Ask an intentionally out-of-scope question in `Knowledgebase RAG` mode.
12. Confirm the assistant politely refuses instead of hallucinating.
13. Start another chat in `General Reasoning` mode.
14. Reopen chats from history.
15. Rename one chat.
16. Delete one chat.

Expected:

- session persistence works
- history actions work without overlap
- platform mode stays grounded in AIger capabilities
- knowledge mode shows grounded citations and source opening
- out-of-scope grounded questions are refused safely
- general mode stays grounded instead of inventing unsupported facts
- tool activity appears inline when tools are called

---

## 4.11 Copilot reasoning trace flow

1. In AIger Copilot, ask a prompt likely to trigger grounding or tool use.
2. While the answer is generating, confirm there is no placeholder text such as `Waiting for response`.
3. Open the reasoning section.
4. Confirm logs are open by default while work is active.
5. Collapse the reasoning section.
6. Reopen it while the same response is still running.
7. Click `Open live trace`.
8. Keep the modal open while the backend continues processing.

Expected:

- reasoning logs update dynamically from the real backend stream
- closing the inline log only collapses the view, not the process
- reopening shows the latest real logs
- live trace modal shows the current active backend activity and the full log trail
- mode, model, and tool tags appear only after the response finishes

---

## 4.12 Report validation flow

1. Complete any workflow run.
2. Immediately open the report from the run page.
3. Verify:
   - headings are styled
   - callouts are readable
   - code blocks are syntax-colored
   - citations open
   - report is available even if materialization was still finishing

Expected:

- no broken report experience right after completion

---

## 5. Backend Verification For E2E Support

Use these only to support the full platform run, not as substitutes for the UI flow.

### 5.1 Health

```bash
curl http://localhost:8001/api/health
```

### 5.2 Marketplace availability

```bash
curl http://localhost:8001/api/marketplace/templates
```

### 5.3 A2A cards

```bash
curl http://localhost:8001/api/a2a/agents/cards
```

### 5.4 Report materialization

```bash
curl http://localhost:8001/api/workflows/runs/<RUN_ID>/report-materialized
```

Expected:

- each endpoint supports the corresponding end-to-end path

---

## 6. Demo Testing Kit

These repos align with the migration-oriented agents already seeded in the platform.

### 6.1 Java and Spring demos

- `https://github.com/mybatis/jpetstore-6`
- `https://github.com/spring-projects/spring-petclinic`

Prompt examples:

- `Modernize this Java codebase into Spring Boot services, identify risky dependencies, propose service boundaries, and produce a phased remediation backlog.`
- `Analyze this Spring Boot application and propose bounded contexts, extraction candidates, target service contracts, and cutover sequencing.`

### 6.2 Streamlit and frontend demos

- `https://github.com/streamlit/streamlit-example`
- `https://github.com/gothinkster/react-redux-realworld-example-app`

Prompt examples:

- `Convert this Streamlit app into a Next.js experience with route map, server/client split, API contracts, and rollout sequence.`
- `Upgrade this React SPA to Next.js and propose routing changes, SSR or ISR opportunities, data-fetching changes, and deployment caveats.`

### 6.3 .NET demo

- `https://github.com/dotnet-architecture/eShopOnWeb`

Prompt example:

- `Migrate this .NET application toward Python APIs and return endpoint mapping, auth changes, serialization differences, runtime replacements, and release risks.`

### 6.4 Python architecture demo

- `https://github.com/fastapi/full-stack-fastapi-template`

Prompt example:

- `Analyze this Python platform structure and propose modernization, service boundaries, operational risks, and delivery priorities.`

### 6.5 Repo plus design document demo

1. Import one GitHub repo into `Workflow inputs`.
2. Upload one design document, architecture note, or migration brief into `Workflow inputs`.
3. Use a prompt like:

   `Use this design document and the imported repository together to identify architecture drift, modernization risks, target boundaries, and rollout phases.`

Expected:

- repo and document remain visible as separate workflow inputs
- outputs combine repository evidence with uploaded-document context

---

## 7. End-to-End Completion Checklist

- login works
- marketplace installs work
- agents page renders correctly
- remote A2A validation works
- project selection persists
- builder drag-drop works
- orchestrator planning works
- workflow inputs and KB stay separate
- workflow execution streams correctly
- HITL pause and resume work
- report opens from run page
- Copilot sessions persist
- Copilot reasoning logs and live trace work dynamically
- final response tags appear only after completion
