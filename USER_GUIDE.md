# AIger's Universe User Guide

## What AIger is

AIger's Universe helps teams design and run governed multi-agent workflows. Use it when a workflow needs multiple agents, tools, documents, approvals, source citations, and an auditable final report.

## Core workflow

1. Sign in.
2. Install marketplace agents or register your own.
3. Open Workflow Builder.
4. Describe the outcome in the orchestrator prompt.
5. Answer any clarifying questions inside the orchestrator log.
6. Install exact-match marketplace agents inside the orchestrator log if requested.
7. Review the final slide-panel plan after gates complete.
8. Accept the plan to build the canvas.
9. Attach run-scoped files, GitHub imports, or KB documents.
10. Save and run.
11. Monitor live execution, HITL gates, A2A messages, and final report.

## Workflow Builder

The builder contains:

- left rail for agents, workflow inputs, GitHub imports, KB selection, and document viewing
- center ReactFlow canvas
- top bar for workflow name, orchestrator log, save, and run
- orchestrator console for live reasoning, questions, marketplace installs, and status
- final slide panel for the architecture/design response

Clarification questions and install approvals do not open separate popups. They appear as collapsible steps inside the orchestrator log. After a step is completed, the final plan can open in the right slide panel.

## AIger Copilot

AIger Copilot supports:

- AIger Copilot mode for platform-specific guidance
- Knowledgebase RAG mode for grounded KB answers
- General Reasoning mode for broader architecture and engineering reasoning
- model and tool selection
- chat-scoped file uploads
- processing logs
- collapsible tool activity at the end of each response
- citations that open readable sources

## Running workflows

When you click Run workflow, the builder shows a transition while it saves, packages inputs, imports pending workflow files/repos, starts the backend run, and navigates to the run page.

The run page shows:

- live or completed animated edges
- status controls for pause, stop, resume, and report viewing
- compact execution estimates
- A2A message log
- HITL routing when an agent asks for approval
- final report with source citations

## Reports

Reports are use-case agnostic. They are designed around outcomes rather than raw agent internals:

- Outcome Summary
- Decision
- Priority Actions
- Key Findings
- Structured Result
- Agent Evidence Trail
- Report Sources

Priority tables use minimal color cues: high risk/reject/fail rows use red tint, warning/review rows use amber tint, and approve/pass/low-risk rows use green tint.

## Knowledge and workflow inputs

Use reusable KB for documents agents should search repeatedly across workflows. Use workflow inputs for run-specific artifacts such as a contract, migration sample, code snippet, or repo snapshot.

## HITL approvals

Execution HITL is separate from builder planning gates. During a run, an agent can trigger `trigger_hitl`; the workflow pauses until a reviewer approves or rejects. Approvals are persisted and visible in the HITL page.

## Recommended smoke tests

1. Auto-build a contract risk review workflow.
2. Confirm questions/install approvals appear inside the log console.
3. Accept the final plan and verify nodes appear on canvas.
4. Run with a real PDF/DOCX/TXT contract input.
5. Approve HITL if triggered.
6. Confirm animated edges remain visible after completion.
7. Open report sources and verify full source content renders readably.
8. Ask AIger Copilot a tool-using question and open the collapsed Tool Activity section.
