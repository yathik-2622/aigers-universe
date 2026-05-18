import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Workflow, ShieldCheck, Activity, ArrowUpRight, FlaskConical, Zap } from 'lucide-react'
import { getMetrics } from '../api/observability.js'
import { listWorkflows, listAllRuns } from '../api/workflows.js'
import { listAgents } from '../api/platform.js'
import { getPending } from '../api/hitl.js'
import { listDocuments } from '../api/documents.js'
import StatusBadge from '../components/common/StatusBadge.jsx'

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 backdrop-blur p-5 card-hover">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${accent}`}>
          <Icon size={14} />
        </div>
      </div>
      <div className="text-3xl font-display font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [agents, setAgents] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [runs, setRuns] = useState([])
  const [pending, setPending] = useState([])
  const [documents, setDocuments] = useState([])

  const load = async () => {
    try {
      const [m, a, w, r, p] = await Promise.all([
        getMetrics(), listAgents(), listWorkflows(), listAllRuns(), getPending(),
      ])
      const d = await listDocuments()
      setMetrics(m); setAgents(a.agents || []); setWorkflows(w.workflows || []); setRuns(r.runs || []); setPending(p.pending || []); setDocuments(d.documents || [])
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [])

  return (
    <div data-testid="dashboard-page" className="p-8 max-w-[1400px]">
      {/* Hero */}
      <div className="mb-8 fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-[11px] font-mono text-accent uppercase tracking-widest mb-4">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Enterprise · Agentic Orchestration
        </div>
        <h2 className="text-5xl font-display font-semibold tracking-tighter leading-[1.05] mb-3 max-w-3xl">
          Bring any agent.<br />
          <span className="text-accent">Orchestrate every workflow.</span>
        </h2>
        <p className="text-muted max-w-2xl text-[15px] leading-relaxed">
          Register LangGraph, CrewAI, or LangChain agents. Wire them on a visual canvas. Connect tools via MCP,
          messages via A2A, gates via HITL. Watch tokens, latency, and cost stream live.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <Link data-testid="cta-marketplace" to="/marketplace" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90">
            Browse Marketplace <ArrowUpRight size={14} />
          </Link>
          <Link data-testid="cta-builder" to="/builder" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-line bg-elev/50 text-sm font-medium hover:border-accent/40">
            <Zap size={14} /> Build a workflow
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Active agents"    value={agents.length}                       icon={Cpu}        accent="bg-accent/15 text-accent" />
        <Stat label="Saved workflows"  value={workflows.length}                    icon={Workflow}   accent="bg-accent2/15 text-accent2" />
        <Stat label="Pending HITL"     value={pending.length}                      icon={ShieldCheck} accent="bg-warn/15 text-warn" />
        <Stat label="Total tokens"     value={metrics?.total_tokens?.toLocaleString() || '0'} icon={Activity} accent="bg-ok/15 text-ok" />
      </div>

      {/* Recent runs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-line bg-panel/60 backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted">Recent workflow runs</div>
              <div className="font-display text-lg mt-0.5">Execution feed</div>
            </div>
            <Link to="/observability" className="text-[12px] text-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-1.5">
            {runs.length === 0 && (
              <div className="text-center py-12 text-muted text-sm">
                <FlaskConical size={28} className="mx-auto mb-3 opacity-50" />
                No runs yet — build a workflow and execute it.
              </div>
            )}
            {runs.slice(0, 8).map(r => (
              <Link
                key={r.run_id}
                to={`/runs/${r.run_id}`}
                data-testid={`run-row-${r.run_id}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-line bg-elev/40 hover:border-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.workflow_name || r.workflow_id}</div>
                  <div className="text-[11px] font-mono text-muted truncate">{r.run_id}</div>
                </div>
                <div className="text-[11px] text-muted hidden md:block">{(r.started_at || '').slice(0,16).replace('T', ' ')}</div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel/60 backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted">Approvals queue</div>
              <div className="font-display text-lg mt-0.5">Pending HITL</div>
            </div>
            <Link to="/hitl" className="text-[12px] text-accent hover:underline">Open →</Link>
          </div>
          <div className="space-y-1.5">
            {pending.length === 0 && (
              <div className="text-center py-10 text-muted text-sm">All clear. No pending approvals.</div>
            )}
            {pending.map(p => (
              <Link key={p.hitl_id} to="/hitl" className="block px-3 py-2.5 rounded-lg border border-line bg-elev/40 hover:border-warn/40">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium truncate">{p.agent_name}</div>
                  <StatusBadge status={p.severity} />
                </div>
                <div className="text-[11px] text-muted line-clamp-2">{p.reason}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-panel/60 backdrop-blur p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted">Your recent uploads</div>
            <div className="font-display text-lg mt-0.5">Documents in your workspace</div>
          </div>
          <div className="text-[12px] text-muted">{documents.length} files</div>
        </div>
        <div className="space-y-2">
          {documents.slice(0, 6).map(doc => (
            <div key={doc.document_id} className="rounded-lg border border-line bg-elev/40 px-3 py-2">
              <div className="text-sm font-medium truncate">{doc.filename}</div>
              <div className="text-[11px] text-muted">{doc.chunk_count} chunks · {(doc.uploaded_at || '').slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
          {documents.length === 0 && <div className="text-sm text-muted py-4">No uploaded documents yet.</div>}
        </div>
      </div>
    </div>
  )
}
