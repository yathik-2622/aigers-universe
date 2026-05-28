import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  ChevronDown,
  CircuitBoard,
  Compass,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  LayoutDashboard,
  Network,
  Orbit,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Workflow,
} from 'lucide-react'
import CodeSnippet from '../components/common/CodeSnippet.jsx'

const DOC_SECTIONS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    route: '/dashboard',
    icon: LayoutDashboard,
    summary: 'Mission control for operational awareness: totals, recent runs, pending approvals, and quick health signals.',
    why: 'The dashboard is intentionally compact because operators need orientation before they need explanation. It leans on shared APIs instead of a custom dashboard-only aggregation layer so the numbers stay consistent with the rest of the product.',
    frontend: [
      'Built with React 18, Tailwind CSS, shared API clients, lightweight metric cards, and recent activity lists.',
      'Parallel data fetch keeps the first paint useful even when traces, approvals, and runs have different response times.',
      'The layout favors high-signal counts and recent items instead of burying users in charts immediately.',
    ],
    backend: [
      'Reuses observability, workflow, platform, and HITL endpoints rather than inventing a separate service.',
      'Project-aware data stays project-aware here because the same repo and run filters power the source endpoints.',
      'The result is a thinner frontend layer and fewer chances for metrics drift.',
    ],
    files: ['frontend/src/pages/Dashboard.jsx', 'backend/api/observability_router.py', 'backend/api/workflow_router.py'],
    snippets: [
      {
        label: 'Concurrent dashboard hydration',
        language: 'jsx',
        code: `const [metrics, agents, workflows, runs, approvals] = await Promise.all([
  getMetrics(),
  listAgents(),
  listWorkflows(),
  listAllRuns(),
  getPending(),
])`,
      },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    route: '/projects',
    icon: GitBranch,
    summary: 'Workspace boundary for visibility, collaboration, and ownership across workflows and runs.',
    why: 'Projects keep the platform multi-tenant without forcing every workflow into a global pool. Sharing is explicit, which keeps private work private while still supporting team delivery.',
    frontend: [
      'Uses route-level data loading, modal forms, and clear ownership/member labels.',
      'Supports project creation, member assignment, selection persistence, and shared-visibility affordances.',
      'The current project is stored locally so Builder, Copilot, and dashboard routes stay in sync.',
    ],
    backend: [
      'Project CRUD lives in dedicated routers and repositories so workflows can resolve project scope centrally.',
      'Membership checks are enforced server-side before shared records are returned.',
      'Admin deletion remains separate from normal member actions to keep destructive actions governed.',
    ],
    files: ['frontend/src/pages/ProjectsPage.jsx', 'backend/api/projects_router.py', 'backend/db/repositories/project_repo.py'],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    route: '/marketplace',
    icon: Store,
    summary: 'Installable agent templates that the orchestrator can also use when it detects missing coverage.',
    why: 'Templates create a bridge between prompt-first users and framework-native agent runtime definitions. They make the orchestrator actionable because a missing capability can be installed instead of only described.',
    frontend: [
      'The catalog exposes framework, prompt intent, tools, and code previews before install.',
      'Install buttons are stateful per template so one long-running install does not freeze the full catalog.',
      'Preview UX emphasizes trust: users can inspect what will be installed instead of accepting a black box.',
    ],
    backend: [
      'Templates are seeded backend records, not frontend constants, so installs are reproducible and governable.',
      'Default install is idempotent, which avoids clutter when a user clicks twice.',
      'Marketplace data also feeds the orchestrator planner when installed inventory is incomplete.',
    ],
    files: ['frontend/src/pages/MarketplacePage.jsx', 'backend/api/marketplace_router.py', 'backend/db/seed.py'],
  },
  {
    id: 'agents',
    title: 'Agents',
    route: '/agents',
    icon: Cpu,
    summary: 'Agent registry for framework choice, model choice, tools, A2A settings, export, and direct invocation.',
    why: 'Agents are the durable runtime units of the platform, so their configuration must be explicit and traceable. This page stays form-driven rather than abstract because hidden runtime state is expensive during debugging.',
    frontend: [
      'React forms, custom selects, badge-heavy summaries, and modal editing keep runtime choices legible.',
      'The page exposes local agent-card URLs and remote card validation so distributed A2A setup is not hidden.',
      'Export actions are grouped with the record because framework-native code ownership matters for engineering teams.',
    ],
    backend: [
      'Agent records persist framework, system prompt, allowed tools, A2A mode, and model metadata.',
      'Framework runners resolve the configured provider/model at invocation time instead of hardcoding a single gateway path.',
      'Exports are generated server-side so code templates match the current backend runtime contract.',
    ],
    files: ['frontend/src/pages/AgentsPage.jsx', 'backend/api/platform_router.py', 'backend/core/framework_runners.py', 'backend/core/agent_code_export.py'],
    snippets: [
      {
        label: 'Agent registration schema',
        language: 'python',
        code: `class RegisterAgentRequest(BaseModel):
    name: str
    framework: str
    description: str = ""
    system_prompt: str
    model_name: str | None = None
    tools: list[str] = []`,
      },
    ],
  },
  {
    id: 'builder',
    title: 'Workflow Builder',
    route: '/builder',
    icon: Workflow,
    summary: 'Prompt-first orchestrator and ReactFlow canvas for workflow planning, refinement, and execution setup.',
    why: 'Builder has to satisfy two workflows at once: visual composition and intent-driven automation. That is why the page combines left-rail asset management, a central canvas, a planner modal, and a live orchestrator log.',
    frontend: [
      'ReactFlow powers drag-drop orchestration because node/edge layout, connection rules, and viewport control are already battle-tested there.',
      'Workflow inputs are split from reusable KB content so one run-specific upload does not silently become a shared retrieval source.',
      'The orchestrator log now streams the real current phase and accumulated lines inside a right-side floating console, then collapses after plan acceptance.',
      'Planner review supports accept, edit, reject, replan, inline market citations, and suggested custom-agent draft creation.',
    ],
    backend: [
      'Workflow planning lives in the backend because installed agents, templates, research tools, and policy constraints must be authoritative.',
      'Execution state, pause/resume controls, tracing, A2A messages, and final reports are persisted in MongoDB.',
      'Planner output can install marketplace agents, propose new custom agents, and generate reusable orchestrator prompts from one request.',
      'Live market research is best-effort and citation-backed when research tools are configured; it does not fabricate evidence when tools are missing.',
    ],
    files: ['frontend/src/pages/WorkflowBuilderPage.jsx', 'frontend/src/components/flow/WorkflowCanvas.jsx', 'backend/api/workflow_router.py', 'backend/core/workflow_engine.py'],
    snippets: [
      {
        label: 'Auto-build planner call',
        language: 'jsx',
        code: `const plan = await autoBuildWorkflow({
  prompt: promptText,
  project_id: projectId || null,
  auto_install_missing: autoInstallMissing,
})`,
      },
      {
        label: 'Orchestrator market signal assembly',
        language: 'python',
        code: `market_signal = await _run_market_research(prompt)
citations = _build_plan_citations(
    selected_agents,
    missing_templates,
    creation_suggestions,
    market_citations=market_signal.get("citations") or [],
)`,
      },
    ],
  },
  {
    id: 'runs',
    title: 'Workflow Run',
    route: '/runs/:runId',
    icon: Radar,
    summary: 'Execution theater for live status, node focus, streamed A2A messages, reports, and pause/resume controls.',
    why: 'Run monitoring deserves its own surface because execution has different operator needs than design. The run page privileges state changes, resumability, and evidence over editing affordances.',
    frontend: [
      'The run view expands the canvas, reduces shell distraction, and centers active-step focus.',
      'A2A messages are streamed and expandable because inter-agent handoff is often the fastest debugging signal.',
      'Report generation keeps formatting strong for code blocks, tables, and citation-style evidence sections.',
    ],
    backend: [
      'SSE and polling fallback both reflect the same persisted workflow state.',
      'Pause, resume, stop, and restart map onto backend control points so operator actions survive refreshes.',
      'Reports are materialized from stored outputs and traces rather than only from transient frontend state.',
    ],
    files: ['frontend/src/pages/WorkflowRunPage.jsx', 'backend/api/workflow_router.py', 'backend/core/report_builder.py'],
  },
  {
    id: 'copilot',
    title: 'AIger Copilot',
    route: '/tools-chat',
    icon: Bot,
    summary: 'Grounded chat workspace with strict mode boundaries, openable citations, repo-doc grounding, and KB-aware reasoning.',
    why: 'Copilot is deliberately not a generic chat tab. It is a governed reasoning surface where answer scope changes by mode, citations must open source content, and unsupported claims should be refused politely.',
    frontend: [
      'Chat history preserves distinct mode icons so long-running sessions remain understandable at a glance.',
      'Citation modals format the opened source cleanly, including copy actions for the excerpt and full opened content.',
      'Composer controls keep mode, model, tools, files, and send together rather than scattering grounding controls around the page.',
    ],
    backend: [
      'Platform mode reloads repo markdown and HTML documentation live on every request so updates are reflected immediately.',
      'Knowledgebase RAG uses MultiQuery recall expansion, MMR reranking, and contextual compression before answer synthesis.',
      'Mode rules are strict: platform mode has no KB access, KB mode has public plus owner-private KB access, and general mode only sees public KB plus broader tools.',
      'Responses are grounded with citations or they refuse when evidence is insufficient.',
    ],
    files: ['frontend/src/pages/ToolPlaygroundPage.jsx', 'backend/api/tool_chat_router.py', 'backend/core/chat_grounding.py'],
    snippets: [
      {
        label: 'Retriever pipeline',
        language: 'python',
        code: `query_variants = await generate_multi_queries(
    user_id=user_id,
    model_name=model_name,
    query=query,
    count=3,
)
mmr_selected = _apply_mmr(scored_chunks, top_k=top_k)
compressed = _compress_text_for_query(text, query)`,
      },
    ],
  },
  {
    id: 'ingest',
    title: 'Knowledge Ingest',
    route: '/knowledge-base',
    icon: Database,
    summary: 'Reusable content ingestion for files and GitHub repos with duplicate detection, visibility rules, chunking, and embeddings.',
    why: 'Knowledge ingestion is one of the most failure-prone areas of any RAG platform, so the UX and backend both need explicit duplicate handling, parser specialization, and metadata discipline.',
    frontend: [
      'The file picker and GitHub repo field share the same category, subcategory, visibility, and chunk-strategy controls.',
      'Users can remove selected files before upload, which matters for large multi-file batches.',
      'Duplicate conflicts highlight the existing matching document and guide the user toward visibility edits instead of another upload.',
    ],
    backend: [
      'Duplicate detection uses content hashes rather than filenames, which prevents trivial rename bypasses.',
      'Visibility rules differ by owner and public/private scope so private duplicates remain private while public duplicates are blocked across users.',
      'Uploaded files and imported repo content converge into the same document-processing, chunking, and embedding pipeline.',
      'Parsers are chosen by file type, and chunking strategies include recursive section-aware, code-aware, table-first, markdown, semantic-topic, sliding-window, and page-based variants.',
    ],
    files: ['frontend/src/pages/KnowledgeBasePage.jsx', 'backend/api/document_router.py', 'backend/document_processing', 'backend/vectorstore/mongo_vector_store.py'],
    snippets: [
      {
        label: 'Recursive chunking configuration',
        language: 'python',
        code: `splitter = RecursiveCharacterTextSplitter(
    chunk_size=int(params["chunk_tokens"]),
    chunk_overlap=int(params["overlap_tokens"]),
    separators=["\\n## ", "\\n### ", "\\n\\n", "\\n", " ", ""],
)`,
      },
      {
        label: 'Vector persistence loop',
        language: 'python',
        code: `for index, chunk in enumerate(chunks):
    await add_document(
        text=chunk,
        metadata={
            "document_id": document_id,
            "chunk_index": index,
            "chunk_strategy": normalized_strategy,
        },
    )`,
      },
    ],
  },
  {
    id: 'graph',
    title: 'Knowledge Graph',
    route: '/knowledge-graph',
    icon: Orbit,
    summary: 'Legacy multidimensional galaxy canvas enhanced with semantic edges, structural edges, and safer camera framing.',
    why: 'The graph is exploratory and spatial, so the older multidimensional layout does a better job than a flat force view. The product value here is mental mapping: hierarchy, similarity, and neighborhood inspection in one place.',
    frontend: [
      'Three.js-based rendering and bloom-style glow keep the graph readable without abandoning the older galaxy metaphor.',
      'Structural and semantic edges are toggleable independently so hierarchy does not visually drown semantic relationships.',
      'Node selection now refocuses the viewport without over-zooming, keeping the selected item usable.',
    ],
    backend: [
      'The graph API returns categories, subcategories, chunks, and similarity-derived links in one payload so the canvas remains render-focused.',
      'Semantic similarity can connect chunks across categories, which helps surface cross-domain relationships.',
      'Saved layouts preserve manual arrangements for repeat inspection.',
    ],
    files: ['frontend/src/pages/KnowledgeGraphPage.jsx', 'frontend/src/components/graph/AigersDotCanvas.jsx', 'backend/api/knowledge_graph_router.py'],
  },
  {
    id: 'hitl',
    title: 'HITL Approvals',
    route: '/hitl',
    icon: ShieldCheck,
    summary: 'Operator review queue for paused workflow decisions and audit-safe approve/reject flows.',
    why: 'Human approval is a runtime primitive, not a decorative feature. Giving it a dedicated page keeps escalations visible and keeps approvals resumable after refresh or reassignment.',
    frontend: [
      'Pending and historical approvals are split so operators can clear the queue quickly.',
      'Review notes are part of the decision flow because rejection without context is rarely actionable.',
      'Deep-link return-to-run behavior keeps the operator oriented when resolving a paused execution.',
    ],
    backend: [
      'Approval state is persisted and paired with resume signals, so workflow continuation is backend-owned and safe.',
      'Timeout behavior and final status updates keep abandoned approvals from lingering forever.',
    ],
    files: ['frontend/src/pages/HITLPage.jsx', 'backend/api/hitl_router.py', 'backend/core/workflow_engine.py'],
  },
  {
    id: 'observability',
    title: 'Observability',
    route: '/observability',
    icon: Activity,
    summary: 'Cost, latency, token, and trace visibility for completed and in-flight execution history.',
    why: 'Observability has to serve both operations and engineering. That means charts for trend scanning, tables for exact runs, and truth-first pricing instead of invented cost math.',
    frontend: [
      'Charts and raw traces sit together so users can move from trend to evidence without changing pages.',
      'Workflow history now supports deletion from the UI for cleanup and testing workflows.',
      'Provider/model fields are surfaced so cost and latency can be understood in context.',
    ],
    backend: [
      'Trace persistence captures tokens, latency, provider, and resolved model per execution step.',
      'Pricing uses runtime provider catalogs when available and official fallback mappings for supported models.',
      'If the exact model cannot be priced truthfully, traces remain visible without fake cost values.',
    ],
    files: ['frontend/src/pages/ObservabilityPage.jsx', 'backend/api/observability_router.py', 'backend/observability/tracer.py'],
  },
  {
    id: 'settings',
    title: 'Settings, Auth, Admin, Landing',
    route: '/settings',
    icon: Settings2,
    summary: 'Cross-cutting platform controls for identity, provider config, admin governance, and the public landing experience.',
    why: 'These areas are smaller individually, but together they define how the platform is entered, governed, themed, and connected to provider infrastructure.',
    frontend: [
      'Settings manages provider credentials, default model choice, base URLs, and theme without forcing code edits.',
      'Login and landing are intentionally lighter-weight surfaces so onboarding does not inherit the density of the inner app.',
      'Admin views focus on user, project, and governance oversight rather than general end-user exploration.',
    ],
    backend: [
      'JWT validation, optional request-context helpers, and role enforcement centralize auth decisions.',
      'Per-user provider settings are persisted in MongoDB so runtime model resolution is user-aware.',
      'Admin-only endpoints protect workspace-level actions such as cross-project oversight and deletion.',
    ],
    files: ['frontend/src/pages/SettingsPage.jsx', 'frontend/src/pages/LoginPage.jsx', 'frontend/src/pages/LandingPage.jsx', 'frontend/src/pages/AdminPage.jsx', 'backend/core/security.py', 'backend/core/request_context.py'],
  },
]

const ARCHITECTURE_LAYERS = [
  {
    title: 'Experience layer',
    body: 'Landing, login, dashboard, builder, run page, Copilot, marketplace, KB, observability, and docs route. Each page owns a clear operator job and keeps dense state readable.',
  },
  {
    title: 'Planning layer',
    body: 'The workflow router coordinates prompt interpretation, clarification, market research, technical design output, marketplace matching, and final canvas-ready plan generation.',
  },
  {
    title: 'Execution layer',
    body: 'The workflow engine executes framework-native agents, binds inputs, records A2A messages, pauses for HITL, and persists run outputs and status snapshots.',
  },
  {
    title: 'Evidence layer',
    body: 'Report builder, Markdown renderer, citation source APIs, and document viewers turn traces and sources into readable final artifacts with highlighted context.',
  },
]

function StatCard({ label, value, detail }) {
  return (
    <div className="scroll-reveal border border-white/10 bg-white/[0.05] px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/65">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-300">{detail}</div>
    </div>
  )
}

function DepthPanel({ title, items, accent = 'cyan' }) {
  const border = accent === 'amber' ? 'border-amber-300/20' : 'border-cyan-300/20'
  const glow = accent === 'amber' ? 'from-amber-300/12' : 'from-cyan-300/12'

  return (
    <div className={`scroll-reveal border ${border} bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]`}>
      <div className={`mb-3 rounded-full border border-white/10 bg-gradient-to-r ${glow} to-transparent px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70`}>
        {title}
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item} className="border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-slate-200">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function PageSection({ section }) {
  const Icon = section.icon
  return (
    <section
      id={section.id}
      className="scroll-reveal group relative overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(7,15,28,0.96),rgba(4,10,20,0.94))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)] transition duration-500 hover:border-cyan-300/25"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.10),transparent_22%)] opacity-90" />
      <div className="pointer-events-none absolute right-[-48px] top-[-48px] h-36 w-36 rounded-full border border-cyan-300/10 bg-cyan-300/8 blur-2xl" />
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
              <Icon size={20} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/55">{section.route}</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">{section.title}</h2>
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
            Product surface
          </div>
        </div>

        <p className="mt-5 max-w-4xl text-[15px] leading-7 text-slate-200">{section.summary}</p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="border border-white/10 bg-white/[0.04] p-5 transition duration-300 hover:border-cyan-300/20 hover:bg-white/[0.055]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/60">Why this page exists</div>
            <p className="mt-3 text-sm leading-7 text-slate-200">{section.why}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {section.files.map((file) => (
                <span key={file} className="border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300">
                  {file}
                </span>
              ))}
            </div>
          </div>

          <div className="border border-cyan-300/14 bg-[linear-gradient(180deg,rgba(14,26,40,0.92),rgba(8,15,25,0.86))] p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/60">Implementation lens</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Frontend</div>
                <div className="mt-3 space-y-3">
                  {section.frontend.map((item) => (
                    <div key={item} className="text-sm leading-6 text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Backend</div>
                <div className="mt-3 space-y-3">
                  {section.backend.map((item) => (
                    <div key={item} className="text-sm leading-6 text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {section.snippets?.length ? (
          <div className="mt-6 space-y-3">
            {section.snippets.map((snippet) => (
              <details key={snippet.label} className="border border-white/10 bg-white/[0.04] p-4 transition duration-300 open:border-cyan-300/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-white">
                  <span>{snippet.label}</span>
                  <ChevronDown size={16} className="text-cyan-100/70" />
                </summary>
                <div className="mt-4">
                  <CodeSnippet code={snippet.code} language={snippet.language} />
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default function PlatformDocumentationPage() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('all')
  const [surfaceMenuOpen, setSurfaceMenuOpen] = useState(false)
  const surfaceMenuRef = useRef(null)

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!surfaceMenuRef.current?.contains(event.target)) {
        setSurfaceMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll('.platform-docs .scroll-reveal, .platform-docs .scroll-reveal-left, .platform-docs .scroll-reveal-right, .platform-docs .scroll-pop'))
    if (!revealNodes.length) return undefined
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' })
    revealNodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [filteredSections.length])

  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return DOC_SECTIONS.filter((section) => {
      if (selected !== 'all' && section.id !== selected) return false
      if (!normalized) return true
      return [
        section.title,
        section.summary,
        section.why,
        section.route,
        ...(section.frontend || []),
        ...(section.backend || []),
        ...(section.files || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
  }, [query, selected])

  return (
    <div className="platform-docs neon-rainbow-bg relative min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,8,20,0.28)_52%,rgba(2,8,20,0.84)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 0.8px, transparent 0.8px)', backgroundSize: '24px 24px' }} />
      <div className="pointer-events-none absolute left-[-120px] top-24 h-72 w-72 rounded-full border border-cyan-300/10 bg-cyan-300/8 blur-3xl animate-float-soft" />
      <div className="pointer-events-none absolute right-[-80px] top-56 h-64 w-64 rounded-full border border-blue-300/10 bg-blue-300/8 blur-3xl animate-float-slower" />
      <div className="pointer-events-none absolute left-0 right-0 top-24 h-px bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" />
      <div className="pointer-events-none absolute left-0 right-0 top-28 h-px bg-gradient-to-r from-transparent via-fuchsia-300/35 to-transparent" />

      <div className="relative z-10 mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:px-10">
        <section className="scroll-reveal overflow-hidden border border-cyan-300/12 bg-[linear-gradient(145deg,rgba(9,18,33,0.94),rgba(5,10,20,0.92))] px-6 py-7 shadow-[0_28px_120px_rgba(0,0,0,0.32)] transition duration-500 hover:border-cyan-300/20 sm:px-8">
          <div className="pointer-events-none absolute right-6 top-6 h-12 w-12 border-r border-t border-cyan-300/30" />
          <div className="pointer-events-none absolute bottom-6 left-6 h-12 w-12 border-b border-l border-fuchsia-300/24" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 border border-cyan-300/20 bg-cyan-300/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.24em] text-cyan-100/80">
              <Compass size={12} />
              <span className="doc-type-line">AIger engineering atlas</span>
            </span>
            <span className="inline-flex items-center gap-2 border border-fuchsia-300/18 bg-fuchsia-300/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-fuchsia-100/75">
              Cyberpunk 3D documentation surface
            </span>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-[clamp(2.4rem,5vw,4.7rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-white">
                Platform documentation that explains what each page does, how it is built, and why the implementation looks the way it does.
              </h1>
              <p className="mt-5 max-w-3xl text-[15px] leading-8 text-slate-200">
                This page is designed as a spatial engineering atlas rather than a flat help screen. It maps each major product surface to its frontend logic, backend contracts, runtime decisions, retrieval patterns, and operational tradeoffs so a new engineer can understand the product without guessing.
              </p>
            </div>

            <div className="grid gap-4 [perspective:1800px]">
              <div className="scroll-reveal-right border border-cyan-300/16 bg-[linear-gradient(180deg,rgba(34,211,238,0.10),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
                <div className="flex items-center gap-3 text-cyan-100">
                  <CircuitBoard size={20} />
                  <div className="text-sm font-medium">System view</div>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  <div>Frontend routes stay close to backend ownership: builder to workflows, copilot to grounding, ingest to parsing and vectors, observability to traces.</div>
                  <div>Platform docs stay in sync with the current code so the page is a practical handoff artifact, not a stale marketing summary.</div>
                </div>
              </div>
              <div className="scroll-reveal-right border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
                <div className="flex items-center gap-3 text-emerald-100">
                  <Network size={20} />
                  <div className="text-sm font-medium">Runtime view</div>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  <div>Framework-native runners, MCP tools, A2A messaging, Mongo persistence, SSE updates, and provider-aware tracing all remain visible throughout the documentation.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <StatCard label="Product surfaces" value={String(DOC_SECTIONS.length)} detail="Documented from Dashboard through Settings, plus cross-cutting auth and admin." />
            <StatCard label="Frameworks" value="4" detail="LangGraph, LangChain, CrewAI, and Agno are all represented in runtime and export paths." />
            <StatCard label="Grounding lanes" value="3" detail="Platform-only, KB RAG, and General Reasoning each enforce distinct retrieval boundaries." />
            <StatCard label="State planes" value="2" detail="Reusable KB context is separated from run-scoped workflow inputs to avoid hidden persistence." />
          </div>
        </section>

        <section className="scroll-reveal border border-cyan-300/14 bg-[linear-gradient(180deg,rgba(5,14,26,0.96),rgba(4,9,18,0.96))] px-6 py-6 shadow-[0_26px_90px_rgba(0,0,0,0.24)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/60">System layers</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">How the platform turns intent into governed evidence</h2>
            </div>
            <div className="max-w-xl text-sm leading-7 text-slate-300">
              The documentation page mirrors the product runtime: users start from a goal, the planner builds a controlled architecture, execution records every important transition, and the report layer makes the result inspectable.
            </div>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            {ARCHITECTURE_LAYERS.map((layer, index) => (
              <div key={layer.title} className="border border-white/10 bg-white/[0.035] p-4 transition duration-300 hover:border-cyan-300/25 hover:bg-white/[0.055]">
                <div className="font-mono text-[11px] text-cyan-100/55">{String(index + 1).padStart(2, '0')}</div>
                <div className="mt-3 text-lg font-medium text-white">{layer.title}</div>
                <div className="mt-3 text-sm leading-7 text-slate-300">{layer.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <DepthPanel
            title="Platform through-lines"
            items={[
              'Workflow Builder combines prompt planning and visual orchestration because different users enter workflow design from different directions.',
              'Knowledge Ingest and AIger Copilot both treat grounding as a product concern, not a post-processing trick, which is why chunking, citations, and visibility scope are explicit.',
              'Observability prefers truth over cosmetic completeness: traces are kept even when exact provider pricing cannot be resolved.',
              'The documentation surface itself now behaves like a navigable engineering atlas with depth, layered glow, collapsible snippets, and route-level structure.',
            ]}
          />
          <div className="scroll-reveal-right border border-cyan-300/14 bg-[linear-gradient(180deg,rgba(7,18,32,0.94),rgba(8,12,24,0.92))] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.2)]">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[280px] flex-1">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cyan-100/55" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search routes, runtimes, retrieval logic, providers, chunking, or files"
                  className="w-full rounded-2xl border border-white/10 bg-[#071220]/90 px-11 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>
              <div ref={surfaceMenuRef} className="relative min-w-[220px] flex-1">
                <button
                  type="button"
                  onClick={() => setSurfaceMenuOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(14,24,42,0.94),rgba(8,13,24,0.94))] px-4 py-3 text-left shadow-[0_0_32px_rgba(34,211,238,0.08)] transition hover:border-cyan-300/35"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/55">Neural route filter</div>
                    <div className="mt-1 text-sm text-white">{selected === 'all' ? 'All surfaces' : DOC_SECTIONS.find((section) => section.id === selected)?.title}</div>
                  </div>
                  <ChevronDown size={16} className={`text-cyan-100/70 transition ${surfaceMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {surfaceMenuOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-30 overflow-hidden rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(6,12,24,0.98),rgba(8,16,30,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
                    <div className="border-b border-white/8 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-cyan-100/50">
                      Select a product surface
                    </div>
                    <div className="max-h-[320px] overflow-auto p-2">
                      {[{ id: 'all', title: 'All surfaces' }, ...DOC_SECTIONS].map((section) => {
                        const active = selected === section.id
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => {
                              setSelected(section.id)
                              setSurfaceMenuOpen(false)
                            }}
                            className={`mb-2 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition last:mb-0 ${
                              active
                                ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.12)]'
                                : 'border-white/8 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/6'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-medium">{section.title}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">{section.id === 'all' ? 'Full atlas' : `/${section.route.replace(/^\//, '')}`}</div>
                            </div>
                            {active ? <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.95)]" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {DOC_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setSelected(section.id)
                    document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
                >
                  {section.title}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredSections.map((section) => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setSelected(section.id)
                      window.requestAnimationFrame(() => {
                        document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      })
                    }}
                    className="rounded-[24px] border border-white/10 bg-black/15 p-4 text-left transition hover:border-cyan-300/25"
                  >
                    <div className="flex items-center gap-3 text-cyan-100">
                      <Icon size={16} />
                      <div className="text-sm font-medium text-white">{section.title}</div>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-300">{section.summary}</div>
                    <div className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">
                      Jump <ArrowRight size={12} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <DepthPanel
            title="Retrieval and memory"
            items={[
              'AIger Copilot platform mode reads current repo markdown and HTML content live so product docs remain up to date without a separate sync job.',
              'Knowledgebase RAG adds query expansion, MMR, and contextual compression before synthesis to widen recall while still trimming noisy chunks.',
              'Workflow inputs remain a separate memory plane, which avoids accidental contamination of the long-lived KB.',
            ]}
          />
          <DepthPanel
            title="Execution and observability"
            items={[
              'Workflow runs persist traces, outputs, A2A messages, HITL records, and reports so operators can refresh or re-enter safely.',
              'Observability surfaces latency, token, provider, and model details because runtime cost only makes sense in context.',
              'Delete actions are exposed in history because test-heavy teams generate many disposable runs.',
            ]}
            accent="amber"
          />
          <DepthPanel
            title="Product integrity"
            items={[
              'Duplicate-safe ingest, strict mode boundaries, and citation-first answer policies are product rules, not optional UI hints.',
              'The builder planner can suggest new custom agents, but it still requires human acceptance before the canvas is committed.',
              'Documentation, user guide, architecture notes, and HTML handoff content are updated together so operators and developers read the same truth.',
            ]}
          />
        </section>

        <div className="mt-8 space-y-7">
          {filteredSections.map((section) => (
            <PageSection key={section.id} section={section} />
          ))}
        </div>

        <section className="scroll-pop mt-8 border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(5,11,20,0.96),rgba(10,16,32,0.94),rgba(4,9,18,0.96))] px-6 py-7 shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 border border-cyan-300/20 bg-cyan-300/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                <FileCode2 size={13} />
                Reference map
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Open the right handoff file fast</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-300">
              These are the source-of-truth docs for product behavior, operator usage, runtime architecture, and browser-friendly handoff material.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['README.md', 'Product overview', 'Setup, capabilities, validation checklist, and contributor rules.'],
              ['USER_GUIDE.md', 'Operator guide', 'End-user journeys, builder flow, Copilot behavior, reports, and smoke tests.'],
              ['Technical_architecture.md', 'Architecture brief', 'Runtime topology, planner contract, HITL, citations, state, and failure behavior.'],
              ['docs/platform-documentation.html', 'Static handoff', 'Browser-friendly reference page for external review and demos.'],
            ].map(([name, label, text], index) => (
              <div key={name} className="scroll-pop group border border-white/10 bg-white/[0.045] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.07]" style={{ animationDelay: `${index * 80}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-100/60">{label}</div>
                    <div className="mt-2 text-base font-semibold text-white">{name}</div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 transition group-hover:bg-cyan-300/20">
                    <FileCode2 size={16} />
                  </div>
                </div>
                <div className="mt-4 text-sm leading-7 text-slate-300">{text}</div>
                <div className="mt-5 h-px bg-gradient-to-r from-cyan-300/50 via-fuchsia-300/35 to-transparent" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
