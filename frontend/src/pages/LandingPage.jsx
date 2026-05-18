import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Boxes, BrainCircuit, CheckCircle2, FileStack, GitBranch, Globe, RadioTower, ShieldCheck, Sparkles, Workflow } from 'lucide-react'

const STATS = [
  { value: '30+', label: 'Marketplace agents' },
  { value: '4', label: 'Native frameworks' },
  { value: 'Live', label: 'MCP + A2A orchestration' },
  { value: 'DB + FAISS', label: 'Grounded memory layers' },
]

const FEATURES = [
  {
    icon: Workflow,
    title: 'Visual workflow engineering',
    body: 'Compose real LangGraph, CrewAI, LangChain, and Agno agents on a drag-and-drop canvas with per-node input control.',
    accent: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-300',
  },
  {
    icon: FileStack,
    title: 'Workflow inputs and KB split cleanly',
    body: 'Keep reusable KB context indexed for search while run-scoped uploads and repo snapshots stay isolated to the workflow.',
    accent: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300',
  },
  {
    icon: Globe,
    title: 'Official docs and live research',
    body: 'Bring Oracle Java, Python, Spring, .NET, web results, and fetched documentation into the same governed execution path.',
    accent: 'from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-300',
  },
  {
    icon: RadioTower,
    title: 'Network A2A federation',
    body: 'Route nodes locally or delegate to remote agent cards over HTTP with persisted message audit across runs.',
    accent: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-300',
  },
]

const SCENARIOS = [
  'Java monolith to Spring Boot service decomposition',
  'Java to Python runtime and API migration planning',
  'Streamlit to Next.js product UX modernization',
  'React to Next.js rendering and routing upgrades',
  '.NET to Python API cutover strategy',
  'Governed review workflows with HITL pause and resume',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#060913] text-ink relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,213,255,0.18),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(98,74,255,0.16),transparent_20%),radial-gradient(circle_at_50%_74%,rgba(25,245,178,0.12),transparent_26%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />

      <div className="relative z-10">
        <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#060913]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="inline-flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl border border-accent/30 bg-accent/10 flex items-center justify-center">
                <Bot size={16} className="text-accent" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-wide">AIger&apos;s Universe</div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted">Enterprise agent engineering</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm hover:border-accent/40">Log in</Link>
              <Link to="/login" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">Enter workspace</Link>
            </div>
          </div>
        </nav>

        <section className="px-6 pt-20 pb-16 lg:px-10">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-accent mb-7">
                <Sparkles size={13} /> Visual agent systems with real runtime frameworks
              </div>
              <h1 className="font-display text-[clamp(3.6rem,8vw,7rem)] leading-[0.92] tracking-[-0.055em]">
                Build the website.<br />
                Build the workflow.<br />
                <span className="text-transparent bg-clip-text bg-[linear-gradient(90deg,#00d5ff,#7f78ff,#19f5b2)]">Build the agent network.</span>
              </h1>
              <p className="text-muted text-[17px] leading-8 mt-7 max-w-3xl">
                AIger&apos;s Universe is the control plane for production-ready agentic workflows. Install native agents, attach workflow inputs and knowledge bases separately, search official documentation, route nodes to remote agent cards, pause for human approval, and export the exact code shape your teams will run.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_20px_45px_rgba(0,213,255,0.22)] hover:opacity-90">
                  Start building <ArrowRight size={15} />
                </Link>
                <a href="#platform" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm hover:border-accent/40">
                  Explore platform sections
                </a>
              </div>
            </div>

            <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6 shadow-[0_35px_140px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="grid gap-4">
                <div className="rounded-[28px] border border-white/10 bg-[#0b1020]/80 p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-accent mb-3">Run profile</div>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2">Workflow inputs</div>
                      <div className="text-muted leading-6">Text input, run-scoped uploads, and GitHub repo snapshots stay attached to the run without polluting the reusable KB.</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2">Knowledge base</div>
                      <div className="text-muted leading-6">Indexed retrieval stays reusable through `knowledge_base_search` for repo context, policies, and architecture memory.</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2">A2A routing</div>
                      <div className="text-muted leading-6">Keep nodes local for same-backend execution or route them to remote agent cards when specialized external agents should take over.</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2">Official docs</div>
                      <div className="text-muted leading-6">Bring Java, Python, Spring, and .NET references into the workflow alongside KB evidence and live web tools.</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-[#0b1020]/60 p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted mb-3">Built for high-signal use cases</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {SCENARIOS.map((item) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-muted inline-flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-black/20">
          <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="font-display text-3xl md:text-4xl text-accent mb-1">{value}</div>
                <div className="text-sm text-muted">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="platform" className="px-6 py-20 lg:px-10">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted mb-4">
                <Boxes size={12} /> Platform pillars
              </div>
              <h2 className="font-display text-4xl tracking-tight">Everything the workflow needs in one system.</h2>
              <p className="text-muted text-lg max-w-3xl mx-auto mt-4">The landing page now explains the product the way a real software website should: clear product pillars, clear motion through the system, and clear reasons to trust the architecture.</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              {FEATURES.map(({ icon: Icon, title, body, accent }) => (
                <div key={title} className={`rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${accent}`}>
                  <div className="w-11 h-11 rounded-2xl border border-current/20 bg-black/20 flex items-center justify-center mb-4">
                    <Icon size={18} className="text-current" />
                  </div>
                  <div className="font-display text-lg tracking-tight text-ink mb-2">{title}</div>
                  <div className="text-sm text-muted leading-7">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-24 lg:px-10">
          <div className="max-w-6xl mx-auto rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.28)]">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-8 items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent mb-4">
                  <BrainCircuit size={12} /> Why teams use local vs remote
                </div>
                <div className="font-display text-3xl tracking-tight mb-4">Local and remote A2A are different on purpose.</div>
                <div className="text-muted leading-7">
                  <p><strong className="text-ink">Local</strong> means the node runs inside this backend with the installed agent config, local tools, local KB access, and normal run traces.</p>
                  <p className="mt-3"><strong className="text-ink">Remote</strong> means the node delegates to another backend or external agent card over HTTP. Use it when the agent lives elsewhere, needs a separate runtime, or should be shared across systems.</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted mb-3">Use local when</div>
                  <ul className="space-y-3 text-sm text-muted">
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />The agent should use this backend's MCP tools and KB directly.</li>
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />You want simpler debugging and lower network complexity.</li>
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />The agent is part of one shared project workspace.</li>
                  </ul>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted mb-3">Use remote when</div>
                  <ul className="space-y-3 text-sm text-muted">
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />Another backend already exposes the specialized agent.</li>
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />You want one shared expert agent across multiple deployments.</li>
                    <li className="inline-flex gap-2"><CheckCircle2 size={14} className="text-accent shrink-0 mt-0.5" />The remote runtime has different secrets, quotas, or heavy dependencies.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24 lg:px-10 text-center">
          <div className="max-w-3xl mx-auto rounded-[34px] border border-accent/20 bg-[linear-gradient(135deg,rgba(0,213,255,0.12),rgba(127,120,255,0.1),rgba(25,245,178,0.08))] p-10 shadow-[0_28px_90px_rgba(0,0,0,0.3)]">
            <div className="font-display text-4xl tracking-tight mb-4">Ready to turn this into your team's agent website?</div>
            <p className="text-muted text-lg leading-8 mb-8">Sign in, install migration agents, copy a local agent card URL, switch a node to remote routing, and watch the full workflow run with A2A logs and official-doc grounding.</p>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-sm font-medium text-white hover:opacity-90">
              Enter workspace <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
