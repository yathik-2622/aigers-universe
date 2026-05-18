import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, Briefcase, Shield, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import { getAdminOverview } from '../api/admin.js'
import { deleteProject } from '../api/projects.js'
import { useAuth } from '../context/AuthContext.jsx'

function MetricCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">{label.replaceAll('_', ' ')}</div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}><Icon size={15} /></div>
      </div>
      <div className="text-3xl font-display font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = () => getAdminOverview().then(setData).catch(() => {})
  useEffect(() => { load() }, [])
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const counts = data?.counts || {}

  const removeProject = async () => {
    if (!deleteTarget) return
    try {
      await deleteProject(deleteTarget.project_id)
      toast.success('Project deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete project')
    }
  }

  return (
    <div className="p-8 max-w-[1520px]">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent">Admin workspace</div>
        <h2 className="mt-4 text-4xl font-display tracking-tight">Control Tower</h2>
        <p className="text-muted text-sm mt-2 max-w-3xl">Monitor users, projects, workflow volume, documents, and approvals from one operator surface.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="users" value={counts.users ?? 0} icon={Users} accent="bg-accent/15 text-accent" />
        <MetricCard label="projects" value={counts.projects ?? 0} icon={Briefcase} accent="bg-accent2/15 text-accent2" />
        <MetricCard label="runs" value={counts.runs ?? 0} icon={Activity} accent="bg-ok/15 text-ok" />
        <MetricCard label="pending_hitl" value={counts.pending_hitl ?? 0} icon={Shield} accent="bg-warn/15 text-warn" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
          <div className="font-display text-lg mb-3">Recent users</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_users || []).map((u, idx) => (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div>{u.display_name}</div>
                <div className="text-[11px] text-muted">{u.email} · {u.role}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
          <div className="font-display text-lg mb-3">Recent projects</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_projects || []).map((p, idx) => (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div>{p.name}</div>
                  <div className="text-[11px] text-muted">{p.description || 'No description'}</div>
                </div>
                <button onClick={() => setDeleteTarget(p)} className="text-[#ef476f] hover:text-[#ff5b80] shrink-0 rounded-full border border-[#ef476f]/30 bg-[#ef476f]/10 p-2">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
          <div className="font-display text-lg mb-3">Recent runs</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_runs || []).slice(0, 12).map((r, idx) => (
              <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div>{r.workflow_name || r.run_id}</div>
                <div className="text-[11px] text-muted">{r.status} · {r.owner_user_id || 'unknown user'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeProject}
        title={`Delete ${deleteTarget?.name || 'project'}?`}
        description="This admin action detaches workflows and runs from the project while preserving historical execution data."
        confirmLabel="Delete project"
      />
    </div>
  )
}
