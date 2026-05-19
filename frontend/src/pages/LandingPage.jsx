import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileStack,
  Globe,
  Hexagon,
  Layers3,
  Network,
  Radar,
  ShieldCheck,
  Sparkles,
  Wrench,
  Workflow,
} from 'lucide-react'

const STATS = [
  { value: '30+', label: 'Marketplace agents' },
  { value: '4', label: 'Native runtimes' },
  { value: 'Live', label: 'MCP + A2A execution' },
  { value: 'Full', label: 'Run observability' },
]

const FEATURE_PANELS = [
  {
    icon: Workflow,
    title: 'Workflow Orchestration',
    body: 'Design real LangGraph, CrewAI, LangChain, and Agno workflows visually, with per-node bindings, remote A2A routing, and orchestration-aware reporting.',
    tint: 'from-cyan-500/18 to-cyan-500/5 border-cyan-400/25 text-cyan-300',
  },
  {
    icon: FileStack,
    title: 'Input + KB Separation',
    body: 'Keep workflow-scoped uploads, GitHub imports, and run text separate from the reusable indexed knowledge base so retrieval quality and execution context stay clean.',
    tint: 'from-emerald-500/18 to-emerald-500/5 border-emerald-400/25 text-emerald-300',
  },
  {
    icon: Globe,
    title: 'Docs, Research, and Tools',
    body: 'Use official Java, Python, Spring, .NET, MCP tools, and research flows in the same governed runtime path instead of bouncing across disconnected utilities.',
    tint: 'from-violet-500/18 to-violet-500/5 border-violet-400/25 text-violet-300',
  },
  {
    icon: ShieldCheck,
    title: 'Governance and HITL',
    body: 'Pause for approvals, resume with continuity, preserve traces and A2A messages, and generate polished reports with evidence, code formatting, and citations.',
    tint: 'from-amber-500/18 to-amber-500/5 border-amber-400/25 text-amber-300',
  },
]

const EXECUTION_STRIPS = [
  {
    title: 'Auto-build from one prompt',
    body: 'Describe the outcome once, let the orchestrator map installed agents, suggest missing ones, and compose a buildable workflow.',
  },
  {
    title: 'Mix local and remote agents',
    body: 'Route tightly coupled nodes locally and specialist nodes to remote A2A cards without losing execution continuity.',
  },
  {
    title: 'Run with real evidence',
    body: 'Capture tool activity, agent responses, HITL checkpoints, citations, and final reports in one traceable execution chain.',
  },
]

const USE_CASES = [
  'Java monolith to Spring Boot modernization',
  'Java to Python migration planning',
  'MySQL to PostgreSQL schema transition analysis',
  'Streamlit to Next.js product rewrite',
  'Contract risk review with human approval',
  'Repo analysis and remediation workflow design',
]

const CAPABILITIES = [
  'Marketplace migration agents with framework-native runtimes',
  'AIger Copilot with chat memory, citations, file grounding, and live logs',
  'Workflow input uploads and GitHub imports that do not pollute the KB',
  'Remote A2A cards, validation, message logs, and per-node routing',
  'Observability for tokens, latency, cost, traces, A2A payloads, and reports',
  'Official documentation search for Java, Python, Spring, and .NET',
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05070f] text-ink">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(0,213,255,0.16),transparent_24%),radial-gradient(circle_at_88%_10%,rgba(140,125,255,0.16),transparent_22%),radial-gradient(circle_at_50%_78%,rgba(20,255,179,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 bg-[linear-gradient(rgba(0,213,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(140,125,255,0.045)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative z-10">
        <nav className="sticky top-0 z-40 border-b border-white/6 bg-[#05070f]/78 backdrop-blur-2xl">
          <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3 sm:flex-nowrap sm:py-0">
            <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_42px_rgba(0,213,255,0.12)]">
                  <Hexagon size={24} strokeWidth={1.5} className="text-accent absolute" />
                  <Hexagon size={15} strokeWidth={1.5} className="text-amber-300 rotate-90 absolute" />
                </div>
                <div>
                  <div className="font-display text-sm uppercase tracking-[0.14em]">Aigers Universe</div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-muted">Enterprise AI platform</div>
                </div>
            </div>
            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <Link to="/login" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm transition hover:border-accent/35 sm:px-5">
                Log in
              </Link>
              <Link to="/login" className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-[0_18px_50px_rgba(0,213,255,0.18)] transition hover:opacity-90 sm:px-5">
                Enter workspace
              </Link>
            </div>
          </div>
        </nav>

        <section className="px-6 pb-16 pt-24 lg:px-10 lg:pt-28">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-accent">
                <Sparkles size={12} />
                Governed multi-agent workflows with real runtimes
              </div>
              <h1 className="font-display text-[clamp(2.8rem,6vw,5.5rem)] leading-[0.94] tracking-[-0.05em]">
                Build futuristic
                <span className="bg-[linear-gradient(90deg,#00d5ff,#8c7dff,#12f0b1)] bg-clip-text text-transparent"> agent systems</span>
                , not scattered demos.
              </h1>
              <p className="mt-6 max-w-2xl text-[16px] leading-8 text-muted">
                AIger unifies native agent frameworks, workflow composition, MCP tooling, A2A routing, workflow inputs, reusable knowledge, approvals, observability, and premium reporting into one production-ready surface.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_22px_60px_rgba(0,213,255,0.22)] transition hover:opacity-90 sm:w-auto">
                  Start building
                  <ArrowRight size={15} />
                </Link>
                <a href="#features" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm transition hover:border-accent/35 sm:w-auto">
                  Explore platform
                </a>
              </div>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="rounded-[26px] border border-white/10 bg-[#091120]/78 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Radar size={15} className="text-accent" />
                  <div className="text-[11px] uppercase tracking-[0.22em] text-accent">Execution fabric</div>
                </div>
                <div className="space-y-3">
                  {EXECUTION_STRIPS.map((item, index) => (
                    <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4">
                      <div className="mb-1 flex items-start gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xs text-accent">
                          0{index + 1}
                        </div>
                        <div className="min-w-0 font-display text-lg tracking-tight">{item.title}</div>
                      </div>
                      <div className="pl-0 pt-2 text-sm leading-7 text-muted sm:pl-11 sm:pt-0">{item.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-accent2">
                    <Network size={12} />
                    Local + remote
                  </div>
                  <div className="text-sm leading-7 text-muted">
                    Run nodes locally when they need direct KB and tool access. Delegate remotely when another backend owns the specialist agent or policy boundary.
                  </div>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-emerald-300">
                    <BrainCircuit size={12} />
                    Copilot guidance
                  </div>
                  <div className="text-sm leading-7 text-muted">
                    Ask one question and AIger Copilot can suggest the right agents, tools, workflow order, and input strategy for the platform.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/6 bg-black/18">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="font-display text-[30px] text-accent md:text-[38px]">{value}</div>
                <div className="mt-1 text-sm text-muted">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="px-6 py-20 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted">
                <Layers3 size={12} />
                Platform pillars
              </div>
              <h2 className="font-display text-[clamp(2rem,4vw,3.4rem)] tracking-[-0.04em]">Everything needed to run serious agent programs.</h2>
              <p className="mx-auto mt-4 max-w-3xl text-[16px] leading-8 text-muted">
                The platform is built for migration programs, governed automation, cross-agent orchestration, and client-facing execution visibility without losing engineering rigor.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {FEATURE_PANELS.map(({ icon: Icon, title, body, tint }) => (
                <div key={title} className={`rounded-[30px] border bg-gradient-to-br p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)] ${tint}`}>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <Icon size={18} />
                  </div>
                  <div className="font-display text-lg tracking-tight text-ink">{title}</div>
                  <div className="mt-2 text-sm leading-7 text-[#d8e1f0]">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.94fr_1.06fr]">
            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_28px_110px_rgba(0,0,0,0.24)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent">
                <Wrench size={12} />
                Capabilities
              </div>
              <h3 className="font-display text-3xl tracking-tight">A complete execution surface, not just a chat wrapper.</h3>
              <div className="mt-6 space-y-3">
                {CAPABILITIES.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-muted">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_28px_110px_rgba(0,0,0,0.24)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent2/20 bg-accent2/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent2">
                <Sparkles size={12} />
                High-signal use cases
              </div>
              <h3 className="font-display text-3xl tracking-tight">Built for modernization, auditability, and multi-step reasoning.</h3>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {USE_CASES.map((item) => (
                  <div key={item} className="flex h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-muted">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent2" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24 lg:px-10">
          <div className="mx-auto max-w-5xl rounded-[36px] border border-accent/20 bg-[linear-gradient(135deg,rgba(0,213,255,0.12),rgba(127,120,255,0.1),rgba(20,255,179,0.08))] p-10 text-center shadow-[0_30px_110px_rgba(0,0,0,0.28)]">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-ink/80">
              <Bot size={12} />
              Ready for build mode
            </div>
            <div className="font-display text-[clamp(2rem,4vw,3.35rem)] tracking-[-0.04em]">
              Install agents, compose workflows, route execution, and ship reports people trust.
            </div>
            <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-[#d6e4f3]">
              Enter the workspace to install migration agents, auto-build a workflow from one prompt, attach files or repos, run with live traces, and finish with polished evidence-rich output.
            </p>
            <div className="mt-8">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-sm font-medium text-white transition hover:opacity-90">
                Enter workspace
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
