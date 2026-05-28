# AIger's Universe E2E Testing

Use this checklist against the current codebase. Final validation should use real installed agents, real inputs, and real workflow runs.

## Services

```bash
cd backend
python server.py
```

```bash
cd frontend
npm run dev
```

## Builder

1. Open `/builder`.
2. Describe a real use case.
3. Click `Auto-build workflow`.
4. Confirm the orchestrator button shows the active step title.
5. Confirm questions and marketplace approvals render as collapsible steps inside the log console.
6. Confirm logs auto-scroll while planning.
7. Confirm final slide panel appears only after gates are complete.
8. Confirm `Open planner summary` toggles the slide panel open and closed.

## Run

1. Click `Run workflow`.
2. Confirm the run-start transition appears before navigation.
3. Confirm `/runs/:runId` opens.
4. Confirm edges animate during execution and remain animated after completion.
5. Confirm execution estimates are compact text rows.
6. Confirm A2A messages have the main right-rail space.

## Report

1. Open final report.
2. Confirm report sections are outcome-oriented, not raw prompt-oriented.
3. Confirm priority actions render as a table.
4. Confirm high-risk rows have subtle red tint, review rows amber, and positive/approved rows green.
5. Confirm report sources open direct source content.
6. Confirm source content renders readable Markdown/HTML and highlights matched evidence.

## AIger Copilot

1. Open `/tools-chat`.
2. Ask a question that uses tools.
3. Confirm processing logs stream while the answer is running.
4. Confirm Tool Activity is collapsed by default.
5. Open Tool Activity and confirm it scrolls inside its own panel.
