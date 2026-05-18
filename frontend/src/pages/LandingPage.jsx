import React from 'react'
import { ArrowRight, Bot, Database, Eye, ShieldCheck, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'

const PANELS = [
  {
    icon: Workflow,
    title: 'Framework-native agent orchestration',
    body: 'Run LangGraph, LangChain, CrewAI, and Agno-style agents inside one governed workflow surface.',
  },
  {
    icon: ShieldCheck,
    title: 'Policy-first review flows',
    body: 'Attach governance rules, upload policy documents, and drive redlines, PII findings, and compliance outcomes from the same workspace.',
  },
  {
    icon: Database,
    title: 'Mongo-backed persistence',
    body: 'Users, runs, documents, approvals, projects, and reports survive logout and backend restarts.',
  },
  {
    icon: Eye,
    title: 'Operational visibility',
    body: 'Inspect uploaded documents, approval history, run traces, citations, and exported agent code without leaving the platform.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#070912] text-ink relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,213,255,0.16),transparent_24%),radial-gradient(circle_at_85%_15%,rgba(138,92,246,0.16),transparent_22%),radial-gradient(circle_at_50%_70%,rgba(21,255,163,0.12),transparent_26%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />

      <div className="relative z-10 px-6 py-8 lg:px-10">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-accent">
              <Bot size={13} />
              AIger&apos;s Universe
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm hover:border-accent/40">Log in</Link>
              <Link to="/login" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">Enter workspace</Link>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 items-start">
            <section className="pt-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted mb-5">
                Cybernetic workflow control for regulated AI operations
              </div>
              <h1 className="font-display text-[clamp(3.3rem,7vw,7rem)] leading-[0.92] tracking-[-0.05em] max-w-5xl">
                Govern every agent.<br />
                Persist every decision.<br />
                <span className="text-transparent bg-clip-text bg-[linear-gradient(90deg,#00d5ff,#8a5cf6,#19f5b2)]">See the whole system move.</span>
              </h1>
              <p className="text-muted text-[16px] leading-8 mt-6 max-w-3xl">
                AIger&apos;s Universe is an end-to-end orchestration platform for enterprise agent workflows: register agents, install review templates, build visual workflows, attach policies, inspect documents, pause for human approval, resume from Mongo-backed state, and export your agent code when it is time to ship.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_16px_40px_rgba(0,213,255,0.18)] hover:opacity-90">
                  Sign in to launch <ArrowRight size={15} />
                </Link>
                <a href="#platform" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm hover:border-accent/40">
                  Explore the platform
                </a>
              </div>
            </section>

            <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="rounded-[28px] border border-white/10 bg-[#0b1020]/80 p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-accent mb-3">Mission profile</div>
                <div className="grid gap-3 text-sm text-muted">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Upload contracts, SLAs, policies, and supporting docs into one governed workspace.</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Run multi-agent review chains with framework-native runners instead of a single raw chat loop.</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Generate readable reports with redlines, risk findings, policy recommendations, and citations.</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Resume paused workflows, inspect traces, and manage teams through projects and admin control surfaces.</div>
                </div>
              </div>
            </section>
          </div>

          <section id="platform" className="mt-20">
            <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {PANELS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
                  <div className="w-11 h-11 rounded-2xl border border-accent/30 bg-accent/10 flex items-center justify-center mb-4">
                    <Icon size={18} className="text-accent" />
                  </div>
                  <div className="font-display text-lg tracking-tight mb-2">{title}</div>
                  <div className="text-sm text-muted leading-7">{body}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
