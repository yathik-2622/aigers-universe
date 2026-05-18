# AIger's Universe End-to-End Testing Guide

## 1. Purpose

This document explains how to test AIger's Universe:

- manually through the UI
- through platform-assisted automatic flows inside the UI
- through backend smoke checks
- through regression scenarios covering the highest-value product paths

---

## 2. Test Environment Prerequisites

## 2.1 Backend

Set these in `backend/.env`:

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `EMBEDDING_MODEL`
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`

Recommended extras:

- `GITHUB_TOKEN` for private repos or stronger public-repo rate limits
- `A2A_SHARED_SECRET=change-this-local-a2a-secret`
- `A2A_PUBLIC_BASE_URL=http://localhost:8001`

## 2.2 Start services

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

## 3. Fast Smoke Checklist

Before deep testing, confirm:

1. Login page opens.
2. Dashboard opens after login.
3. Marketplace templates are visible.
4. Agents page shows cards.
5. Builder page loads ReactFlow.
6. A2A cards endpoint is reachable indirectly through the UI helper.
7. Run page opens and streams updates.

---

## 4. Manual End-to-End UI Flows

## 4.1 Flow A: Agent installation and validation

1. Open `Marketplace`.
2. Install:
   - `Java to Spring Boot Architect`
   - `Java to Python Service Translator`
   - `Risk Analyzer`
   - `Compliance Checker`
3. Open `Agents`.
4. Verify installed cards show:
   - framework badge
   - model name
   - tags
   - A2A badge if enabled
5. Open `Local agent cards`.
6. Copy one card URL.
7. Click `New agent`.
8. Choose:
   - any framework
   - `A2A enabled = true`
   - `A2A mode = Remote`
9. Paste the copied card URL.
10. Click `Test remote card`.
11. Confirm the validation summary appears.
12. Save the agent.

Expected result:

- remote card validation succeeds
- the new agent saves
- no modal height overlap occurs

---

## 4.2 Flow B: Project-scoped workflow

1. Open `Projects`.
2. Create a project called `Wave 1`.
3. Optionally add member emails.
4. Open `Workflow Builder`.
5. In `Project scope`, choose `Wave 1`.
6. Give the workflow a name like `Wave 1 Modernization`.
7. Save later after building.

Expected result:

- project appears in dropdown
- selected project persists in builder context

---

## 4.3 Flow C: Orchestrator AI decision cycle

1. In `Workflow Builder`, enter:

   `Modernize this Java monolith into Spring Boot services, assess migration risk, and produce a phased remediation backlog.`

2. Click `Auto-build workflow`.
3. In the planner modal, test:
   - `Edit`
   - `Replan`
   - `Reject`
4. Re-open planning.
5. Click `Accept`.

Expected result:

- planner modal supports all decision actions
- `Accept` closes the modal
- workflow slow-build animation starts after modal close
- camera focus follows each node as it is added

---

## 4.4 Flow D: Workflow input and KB behavior

### Run-scoped workflow inputs

1. In `Workflow inputs`, type a detailed prompt.
2. Select one or more files.
3. Click `Upload workflow files`.
4. Enter a public GitHub repo URL.
5. Click `Import GitHub repo for this workflow run`.

Expected result:

- file upload button only shows file-upload loading
- repo import button only shows repo-import loading
- uploaded files appear in the workflow input list
- imported workflow repo appears separately

### Reusable KB

1. In `Knowledge base`, keep `Upload KB files`.
2. Upload a reusable architecture doc.
3. Switch to `Use external GitHub repo context`.
4. Import a separate repo into KB.

Expected result:

- KB uploads are independent from workflow input uploads
- KB items appear in the KB document list
- workflow inputs remain separate

---

## 4.5 Flow E: Manual drag-drop workflow

1. Drag two installed agents to canvas manually.
2. Connect them with an edge.
3. Click each node.
4. Adjust:
   - prompt
   - model
   - tools
   - input bindings
   - A2A mode
5. Save workflow.

Expected result:

- node config persists
- canvas saves correctly
- badges and routing state reflect node edits

---

## 4.6 Flow F: Modernization run

1. Use orchestrator-built workflow or manual workflow.
2. Add:
   - text goal
   - one Java file
   - one public Java repo import
   - optional KB architecture doc
3. Click `Run workflow`.

Expected run-page validations:

1. current running node is camera-focused
2. A2A messages appear on the right
3. A2A messages expand and collapse on click
4. statuses progress correctly
5. if the report is not fully persisted yet, the page shows `Preparing report...`
6. `View report` should work directly from the run page after the terminal step

Expected output:

- architecture findings
- risk findings
- remediation backlog
- report with highlighted sections and syntax-colored code blocks

---

## 4.7 Flow G: Contract risk run

1. In `Orchestrator AI`, enter:

   `Review this vendor contract for key extraction, operational risk, compliance issues, and a final approval recommendation.`

2. Click `Auto-build workflow`.
3. Accept the plan.
4. Upload a contract PDF, DOCX, or TXT.
5. Run the workflow.

Expected result:

- extraction agent executes
- risk agent executes
- compliance may trigger HITL
- final recommendation is generated
- report is viewable from the run page itself

---

## 4.8 Flow H: HITL approval cycle

1. Build or run a workflow with `Compliance Checker`.
2. Use an input likely to trigger a high-severity policy issue.
3. Wait for the run to pause.
4. Open `HITL`.
5. Approve once.
6. Repeat with another run and reject once.

Expected result:

- paused run is visible in HITL
- approval resumes execution
- rejection marks run failed

---

## 4.9 Flow I: Report validation

1. Finish any workflow.
2. Immediately click `View report` from the run page.
3. Confirm it opens even if report persistence is still catching up.
4. Verify:
   - headings are styled
   - callout lines are highlighted
   - code blocks are syntax-colored
   - citations open correctly
   - PII findings render clearly

Expected result:

- no `Report unavailable` experience right after completion
- no need to leave the run page and reopen history

---

## 5. Platform-Assisted Automatic UI Flows

This section covers "automatic via UI" testing, meaning the platform itself performs the orchestration without external scripts.

## 5.1 Automatic flow: planner-driven build

1. Enter a workflow goal.
2. Click `Auto-build workflow`.
3. If missing agents are listed, click `Install required agents and build workflow`.
4. Accept the planner.

Platform performs automatically:

- capability matching
- missing-template discovery
- template installation
- node and edge creation
- animated workflow construction

## 5.2 Automatic flow: run monitoring

Once a workflow is started, the UI automatically:

- streams run status via SSE
- falls back to polling if stream drops
- tracks current running step
- focuses the active node
- updates A2A messages
- tries to fetch the final report

---

## 6. Backend/API Smoke Tests

These are optional but useful.

### 6.1 Health

```bash
curl http://localhost:8001/api/health
```

### 6.2 Marketplace

```bash
curl http://localhost:8001/api/marketplace/templates
```

### 6.3 A2A cards

```bash
curl http://localhost:8001/api/a2a/agents/cards
```

### 6.4 Materialized report endpoint

After a run completes:

```bash
curl http://localhost:8001/api/workflows/runs/<RUN_ID>/report-materialized
```

Expected result:

- endpoint returns markdown even if the report was not persisted yet at first call

---

## 7. Regression Matrix

Use this after major changes.

### Core

- login works
- dashboard loads
- marketplace installs succeed
- agents create/update/delete works
- builder drag-drop works
- orchestrator auto-build works
- planner modal actions work
- project selection persists

### Inputs

- KB upload works
- KB GitHub import works
- workflow file upload works
- workflow repo import works
- limits are enforced

### Runtime

- workflow run starts
- A2A messages persist
- traces persist
- remote A2A routing works
- HITL pause/resume works
- report opens from live run page

### UX

- create-agent modal does not overflow badly
- builder sidebar is not congested
- active node focus works during build
- active node focus works during run
- code snippet colors remain visible
- report is readable and highlighted

---

## 8. Known Current Product Boundaries

### Supported well today

- multi-agent orchestration
- migration planning
- contract review
- KB retrieval
- remote A2A delegation
- human approval checkpoints

### Not yet fully productized

- automatic generation of a full translated target repository and publishing it to GitHub
- automatic conversion of an entire source repo into a committed target repo artifact
- automatic schema migration artifact publishing to a real target database repo

---

## 9. Recommended High-Value Test Use Cases

### Use case 1: Java to Spring Boot modernization

Inputs:

- legacy Java file
- architecture note
- public repo

Expected:

- module boundaries
- risky dependencies
- migration phases
- release plan

### Use case 2: Java to Python translation strategy

Inputs:

- Java service repo
- concurrency-heavy Java file

Expected:

- Python framework mapping
- runtime difference analysis
- translation risks

### Use case 3: Contract risk and compliance

Inputs:

- vendor agreement
- internal policy doc

Expected:

- extracted entities
- risk score
- compliance issues
- HITL when needed

### Use case 4: MySQL to PostgreSQL migration planning

Inputs:

- schema SQL file
- database conventions document

Expected:

- type mapping risks
- compatibility issues
- migration checklist
- manual conversion guidance

---

## 10. Recommended Future Automated Testing

If you want true external automated UI regression later:

- add Playwright for browser E2E
- seed deterministic test data
- mock or stub LLM gateway responses for stable CI
- keep a separate live-key integration suite for final validation

Current product-assisted "automatic" mode already covers:

- auto-build
- auto-install missing agents
- guided run streaming
- live report materialization

