import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, MessageSquare, ShieldCheck, X } from 'lucide-react'
import { getPending, approveHitl, rejectHitl, getAllHitl } from '../api/hitl.js'
import StatusBadge from '../components/common/StatusBadge.jsx'
import { toast } from 'sonner'

export default function HITLPage() {
  const [pending, setPending] = useState([])
  const [history, setHistory] = useState([])
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(null)

  const load = async () => {
    try {
      const [p, a] = await Promise.all([getPending(), getAllHitl()])
      setPending(p.pending || [])
      setHistory((a.records || []).filter((r) => r.status !== 'pending'))
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [])

  const approve = async (id) => {
    setBusy(id)
    try { await approveHitl(id, notes[id] || ''); toast.success('Approved, workflow resuming'); load() }
    catch { toast.error('Approve failed') }
    finally { setBusy(null) }
  }
  const reject = async (id) => {
    const reason = notes[id]?.trim()
    if (!reason) return toast.error('A reason is required to reject')
    setBusy(id)
    try { await rejectHitl(id, reason); toast.success('Rejected'); load() }
    catch { toast.error('Reject failed') }
    finally { setBusy(null) }
  }

  return (
    <div data-testid="hitl-page" className="p-8 max-w-[1480px]">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-warn/20 bg-warn/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-warn">Human in the loop</div>
        <h2 className="mt-4 text-4xl font-display tracking-tight">Approval Desk</h2>
        <p className="text-muted text-sm mt-2 max-w-2xl">Paused workflows surface here for human approval, rejection, and traceable review notes.</p>
      </div>

      <div className="mb-3 text-[11px] uppercase tracking-widest text-muted">Pending ({pending.length})</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        {pending.length === 0 && (
          <div className="lg:col-span-2 text-center py-14 text-muted border border-dashed border-white/10 rounded-[28px] bg-white/5">
            <ShieldCheck size={32} className="mx-auto mb-3 opacity-60" />
            All clear. No pending approvals.
          </div>
        )}
        {pending.map((p) => (
          <div key={p.hitl_id} data-testid={`hitl-card-${p.hitl_id}`} className="rounded-[28px] border border-warn/25 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.02))] backdrop-blur p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-warn/15 border border-warn/30 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-warn" />
                </div>
                <div>
                  <div className="font-display font-semibold">{p.agent_name}</div>
                  <div className="text-[11px] font-mono text-muted">{p.hitl_id.slice(0, 12)}...</div>
                </div>
              </div>
              <StatusBadge status={p.severity} />
            </div>
            <div className="text-sm text-ink mb-3 leading-relaxed">{p.reason}</div>
            {p.context && Object.keys(p.context).length > 0 && (
              <div className="mb-3 p-3 rounded-2xl border border-white/10 bg-white/5">
                <div className="text-[10px] uppercase font-mono tracking-wide text-muted mb-1.5">Context</div>
                <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap break-all line-clamp-6">{JSON.stringify(p.context, null, 2)}</pre>
              </div>
            )}
            <textarea
              data-testid={`hitl-note-${p.hitl_id}`}
              placeholder="Add a note (required to reject)..."
              value={notes[p.hitl_id] || ''}
              onChange={(e) => setNotes((n) => ({ ...n, [p.hitl_id]: e.target.value }))}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-[12px] font-mono focus:border-warn outline-none resize-none mb-3"
            />
            <div className="flex items-center gap-2">
              <button data-testid={`approve-${p.hitl_id}`} onClick={() => approve(p.hitl_id)} disabled={busy === p.hitl_id} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-ok text-bg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                <Check size={14} /> Approve
              </button>
              <button data-testid={`reject-${p.hitl_id}`} onClick={() => reject(p.hitl_id)} disabled={busy === p.hitl_id} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-bad/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                <X size={14} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 text-[11px] uppercase tracking-widest text-muted">History</div>
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-muted bg-white/5">
              <th className="px-4 py-2 font-medium">Agent</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Outcome</th>
              <th className="px-4 py-2 font-medium">Note</th>
              <th className="px-4 py-2 font-medium">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No resolved approvals yet.</td></tr>}
            {history.map((r) => (
              <tr key={r.hitl_id} className="border-t border-white/10">
                <td className="px-4 py-2.5">{r.agent_name}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.severity} /></td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-muted text-[12px] max-w-xs truncate"><MessageSquare size={11} className="inline mr-1" />{r.human_note || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{(r.resolved_at || '').slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
