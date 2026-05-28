import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, Cpu, Eye, FlaskConical, ShieldCheck, Trash2, Workflow, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { getMetrics } from '../api/observability.js'
import { deleteRun, listWorkflows, listAllRuns } from '../api/workflows.js'
import { listAgents } from '../api/platform.js'
import { getPending } from '../api/hitl.js'
import { listDocuments } from '../api/documents.js'
import DocumentViewerModal from '../components/common/DocumentViewerModal.jsx'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur p-5 card-hover shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="text-3xl font-display font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState(null)
  const [agents, setAgents] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [runs, setRuns] = useState([])
  const [pending, setPending] = useState([])
  const [documents, setDocuments] = useState([])
  const [activeDocumentId, setActiveDocumentId] = useState('')
  const [deleteRunTarget, setDeleteRunTarget] = useState(null)

  const load = async () => {
    try {
      const [m, a, w, r, p] = await Promise.all([getMetrics(), listAgents(), listWorkflows(), listAllRuns(), getPending()])
      const d = await listDocuments()
      setMetrics(m)
      setAgents(a.agents || [])
      setWorkflows(w.workflows || [])
      setRuns(r.runs || [])
      setPending(p.pending || [])
      setDocuments(d.documents || [])
    } catch {}
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [])

  const handleDeleteRun = async () => {
    if (!deleteRunTarget) return
    try {
      await deleteRun(deleteRunTarget.run_id)
      setRuns((prev) => prev.filter((item) => item.run_id !== deleteRunTarget.run_id))
      setDeleteRunTarget(null)
      toast.success('Run deleted')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete run')
    }
  }

  return (
    <div data-testid="dashboard-page" className="p-8 max-w-[1440px]">
      <div className="mb-8 fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-[11px] font-mono text-accent uppercase tracking-widest mb-4">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Enterprise agent orchestration
        </div>
        <h2 className="text-5xl font-display font-semibold tracking-tighter leading-[1.02] mb-3 max-w-4xl">
          Give every workflow a <span className="text-accent">persistent operating surface.</span>
        </h2>
        <p className="text-muted max-w-3xl text-[15px] leading-relaxed">
          Register framework-native agents, wire them on the builder canvas, attach documents and policies, and keep every run resumable through Mongo-backed state.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <Link to="/marketplace" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:opacity-90">
            Browse Marketplace <ArrowUpRight size={14} />
          </Link>
          <Link to="/builder" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-white/10 bg-white/5 text-sm font-medium hover:border-accent/40">
            <Zap size={14} /> Build a workflow
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Active agents" value={agents.length} icon={Cpu} accent="bg-accent/15 text-accent" />
        <Stat label="Saved workflows" value={workflows.length} icon={Workflow} accent="bg-accent2/15 text-accent2" />
        <Stat label="Pending HITL" value={pending.length} icon={ShieldCheck} accent="bg-warn/15 text-warn" />
        <Stat label="Total tokens" value={metrics?.total_tokens?.toLocaleString() || '0'} icon={Activity} accent="bg-ok/15 text-ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted">Recent workflow runs</div>
              <div className="font-display text-lg mt-0.5">Execution feed</div>
            </div>
            <Link to="/observability" className="text-[12px] text-accent hover:underline">View all -&gt;</Link>
          </div>
          <div className="space-y-2">
            {runs.length === 0 && (
              <div className="text-center py-12 text-muted text-sm">
                <FlaskConical size={28} className="mx-auto mb-3 opacity-50" />
                No runs yet. Build a workflow and execute it.
              </div>
            )}
            {runs.slice(0, 8).map((r) => (
              <div key={r.run_id} className="flex items-center justify-between gap-3 px-3 py-3 rounded-2xl border border-white/10 bg-white/5 hover:border-accent/30">
                <div className="min-w-0 flex-1">
                  <Link to={`/runs/${r.run_id}`} data-testid={`run-row-${r.run_id}`} className="block">
                    <div className="text-sm font-medium truncate">{r.workflow_name || r.workflow_id}</div>
                    <div className="text-[11px] font-mono text-muted truncate">{r.run_id}</div>
                  </Link>
                </div>
                <div className="text-[11px] text-muted hidden md:block">{(r.started_at || '').slice(0, 16).replace('T', ' ')}</div>
                <StatusBadge status={r.status} />
                {(user?.role === 'admin' || user?.user_id === r.owner_user_id) && (
                  <button
                    onClick={() => setDeleteRunTarget(r)}
                    className="inline-flex items-center justify-center rounded-full border border-[#ef476f]/30 bg-[#ef476f]/10 p-2 text-[#ef476f] hover:bg-[#ef476f]/15"
                    title="Delete run"
                    aria-label="Delete run"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted">Approvals queue</div>
              <div className="font-display text-lg mt-0.5">Pending HITL</div>
            </div>
            <Link to="/hitl" className="text-[12px] text-accent hover:underline">Open -&gt;</Link>
          </div>
          <div className="space-y-2">
            {pending.length === 0 && <div className="text-center py-10 text-muted text-sm">All clear. No pending approvals.</div>}
            {pending.map((p) => (
              <Link key={p.hitl_id} to="/hitl" className="block px-3 py-3 rounded-2xl border border-white/10 bg-white/5 hover:border-warn/40">
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

      <div className="mt-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted">Your recent uploads</div>
            <div className="font-display text-lg mt-0.5">Documents in your workspace</div>
          </div>
          <div className="text-[12px] text-muted">{documents.length} files</div>
        </div>
        <div className="space-y-2">
          {documents.slice(0, 6).map((doc) => (
            <div key={doc.document_id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{doc.filename}</div>
                <div className="text-[11px] text-muted">{doc.chunk_count} chunks · {(doc.uploaded_at || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
              <button onClick={() => setActiveDocumentId(doc.document_id)} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-muted hover:text-ink hover:border-accent/40">
                <Eye size={14} />
              </button>
            </div>
          ))}
          {documents.length === 0 && <div className="text-sm text-muted py-4">No uploaded documents yet.</div>}
        </div>
      </div>

      <DocumentViewerModal documentId={activeDocumentId} open={!!activeDocumentId} onClose={() => setActiveDocumentId('')} />
      <ConfirmDialog
        open={!!deleteRunTarget}
        onClose={() => setDeleteRunTarget(null)}
        onConfirm={handleDeleteRun}
        title="Delete workflow run?"
        description={`This removes ${deleteRunTarget?.workflow_name || deleteRunTarget?.run_id || 'this run'} from run history, including related traces and messages.`}
        confirmLabel="Delete run"
        tone="danger"
      />
    </div>
  )
}
