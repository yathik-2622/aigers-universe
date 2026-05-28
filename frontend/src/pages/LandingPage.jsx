import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Hexagon,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-react'

const QUICK_START = [
  '$ describe "contract risk review with HITL"',
  '> asks clarifying questions inside the orchestrator log',
  '> validates market signal and writes the technical design',
  '> installs exact seed agents or drafts custom agents',
  '> opens the workflow canvas and run console',
]

const OPERATING_MODEL = [
  {
    icon: Sparkles,
    label: 'Understand',
    title: 'Architect-level prompt intake',
    body: 'The orchestrator reads the use case like a senior solution architect, asks only the missing questions, and keeps the user inside one live console.',
  },
  {
    icon: Radar,
    label: 'Validate',
    title: 'Market and differentiation view',
    body: 'Use cases are checked against market evidence when research tools are available, with citations placed where the market discussion belongs.',
  },
  {
    icon: Workflow,
    label: 'Compose',
    title: 'Marketplace-aware workflow build',
    body: 'Installed agents are reused first, exact marketplace seed matches request inline approval, and missing capabilities become generated agent drafts.',
  },
  {
    icon: ShieldCheck,
    label: 'Govern',
    title: 'HITL, A2A, traces, and reports',
    body: 'Runs preserve approval gates, A2A handoffs, animated execution state, compact timings, and readable evidence-rich reports.',
  },
]

const CAPABILITIES = [
  'Prompt-to-architecture workflow planner',
  'Clarification and install gates inside the log console',
  'ReactFlow canvas with framework-native agents',
  'Run-scoped files separated from reusable KB',
  'AIger Copilot with citations and collapsed tool activity',
  'Outcome-first reports with source viewers',
]

const USE_CASES = [
  'Contract risk review',
  'Java modernization',
  'Repo analysis',
  'Compliance checks',
  'Migration planning',
  'Executive reporting',
]

function CommandPanel() {
  return (
    <div className="border border-white/10 bg-black/35 p-4 shadow-[0_28px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <Terminal size={15} className="text-cyan-200" />
          AIger orchestrator
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-300" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
        </div>
      </div>
      <div className="mt-4 space-y-3 font-mono text-[12px] leading-6">
        {QUICK_START.map((line, index) => (
          <div key={line} className={`scroll-reveal ${index === 0 ? 'text-cyan-100' : 'text-slate-300'}`} style={{ animationDelay: `${index * 90}ms` }}>
            {line}
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {['Plan', 'Build', 'Run'].map((item) => (
          <div key={item} className="border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-cyan-100/75">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, body }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="mb-3 inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">
        <CircleDot size={12} />
        {eyebrow}
      </div>
      <h2 className="font-display text-4xl leading-tight tracking-normal text-white md:text-5xl">{title}</h2>
      <p className="mt-4 text-[15px] leading-8 text-slate-300">{body}</p>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div
      className="neon-rainbow-bg relative min-h-screen overflow-x-hidden text-ink"
      style={{
        '--color-bg': '5 7 15',
        '--color-panel': '9 17 32',
        '--color-elev': '10 20 40',
        '--color-line': '39 51 76',
        '--color-ink': '233 233 247',
        '--color-muted': '148 163 184',
        '--color-accent': '0 213 255',
        '--color-accent2': '99 102 241',
      }}
    >
      <div className="neon-hero-glow" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:42px_42px] opacity-45" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,7,15,0.24)_52%,rgba(5,7,15,0.82)_100%)]" />

      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#05070f]/72 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center border border-cyan-300/30 bg-cyan-300/10">
              <Hexagon size={24} className="absolute text-cyan-200" />
              <Hexagon size={15} className="absolute rotate-90 text-fuchsia-200" />
            </div>
            <div>
              <div className="font-display text-sm uppercase tracking-[0.14em] text-white">Aigers Universe</div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Enterprise agent workflows</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/30 sm:inline-flex">
              Log in
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200">
              Enter workspace
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
          <div className="scroll-reveal-left max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-cyan-100">
              <Sparkles size={13} />
              Prompt to governed execution
            </div>
            <h1 className="neon-gradient-title font-display text-5xl leading-[1.02] tracking-normal md:text-7xl">
              AIger's Universe
            </h1>
            <p className="mt-5 max-w-2xl text-xl leading-9 text-slate-200">
              The enterprise AI platform that turns a prompt into architecture, agents, workflows, approvals, execution traces, and final reports people can trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex items-center gap-2 bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
                Start building
                <Play size={15} />
              </Link>
              <a href="#quick-start" className="inline-flex items-center gap-2 border border-white/12 bg-white/[0.04] px-6 py-3 text-sm text-white transition hover:border-cyan-300/35">
                See the flow
                <ArrowRight size={15} />
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              {['PLAN', 'BUILD', 'RUN', 'PROVE'].map((item) => (
                <span key={item} className="neon-key px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.2em] text-white">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div id="quick-start" className="scroll-reveal-right">
            <CommandPanel />
          </div>
        </section>

        <section className="border-y border-white/10 bg-black/20 px-6 py-8 backdrop-blur">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
            {[
              ['Planner', 'Prompt to architecture and canvas'],
              ['4 runtimes', 'LangGraph, LangChain, CrewAI, Agno'],
              ['HITL', 'Clarify, install, approve, resume'],
              ['Evidence', 'Reports, citations, traces, A2A'],
            ].map(([value, label]) => (
              <div key={value} className="scroll-reveal border-l border-cyan-300/25 px-4 py-2">
                <div className="font-display text-3xl text-white">{value}</div>
                <div className="mt-1 text-sm text-slate-300">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-20">
          <SectionHeader
            eyebrow="Operating model"
            title="From rough prompt to executable workflow"
            body="Each section below is a real platform responsibility: not a marketing step, but the actual path AIger follows in the builder and run console."
          />
          <div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-4">
            {OPERATING_MODEL.map(({ icon: Icon, label, title, body }, index) => (
              <div key={title} className={`${index % 2 === 0 ? 'scroll-reveal-left' : 'scroll-reveal-right'} border border-white/10 bg-black/24 p-5 backdrop-blur-md`}>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                    <Icon size={18} />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</span>
                </div>
                <div className="font-display text-xl tracking-normal text-white">{title}</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="scroll-reveal-left">
              <SectionHeader
                eyebrow="What ships"
                title="One platform surface for planning, tools, runtime, and proof"
                body="The app stays useful after the first prompt because every workflow can be inspected, edited, executed, resumed, and reported."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.map((item, index) => (
                <div key={item} className="scroll-reveal border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-200 backdrop-blur" style={{ animationDelay: `${index * 70}ms` }}>
                  <CheckCircle2 size={15} className="mb-3 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Use cases"
              title="Built for workflows that need governance"
              body="Legal, migration, compliance, platform, and engineering operations all need the same foundation: clear inputs, agent roles, approval gates, and final evidence."
            />
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {USE_CASES.map((item, index) => (
                <div key={item} className="scroll-reveal flex items-center gap-3 border border-white/10 bg-black/20 px-4 py-4 text-slate-200" style={{ animationDelay: `${index * 60}ms` }}>
                  <GitBranch size={16} className="text-fuchsia-200" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="scroll-reveal mx-auto max-w-5xl border border-cyan-300/25 bg-cyan-300/10 px-8 py-10 text-center backdrop-blur-xl">
            <div className="mb-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-100">
              <Bot size={13} />
              Ready for build mode
            </div>
            <div className="font-display text-4xl leading-tight tracking-normal text-white md:text-5xl">
              Build the workflow. Run the agents. Keep the evidence.
            </div>
            <p className="mx-auto mt-5 max-w-3xl text-[15px] leading-8 text-slate-200">
              Enter the workspace to install agents, auto-build a workflow, attach files or repos, run with live traces, and finish with an evidence-rich report.
            </p>
            <div className="mt-8 flex justify-center">
              <Link to="/login" className="inline-flex items-center gap-2 bg-white px-7 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100">
                Enter workspace
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
