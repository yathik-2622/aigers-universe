import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getAdminOverview } from '../api/admin.js'
import { deleteProject } from '../api/projects.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function AdminPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)

  const load = () => getAdminOverview().then(setData).catch(() => {})
  useEffect(() => { load() }, [])
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const counts = data?.counts || {}

  const removeProject = async (projectId) => {
    if (!confirm('Delete this project as admin? Workflows and runs will be detached from it.')) return
    try {
      await deleteProject(projectId)
      toast.success('Project deleted')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete project')
    }
  }

  return (
    <div className="p-8 max-w-[1500px]">
      <h2 className="text-2xl font-display font-semibold tracking-tight mb-2">Admin Control Tower</h2>
      <p className="text-muted text-sm mb-6">Global visibility across users, projects, workflows, documents, and pending approvals.</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Object.entries(counts).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-panel/60 p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted">{label.replaceAll('_', ' ')}</div>
            <div className="text-3xl font-display font-semibold mt-3">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="font-display text-lg mb-3">Recent users</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_users || []).map((u, idx) => <div key={idx} className="rounded-lg border border-line bg-elev/40 px-3 py-2"><div>{u.display_name}</div><div className="text-[11px] text-muted">{u.email} · {u.role}</div></div>)}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="font-display text-lg mb-3">Recent projects</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_projects || []).map((p, idx) => (
              <div key={idx} className="rounded-lg border border-line bg-elev/40 px-3 py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div>{p.name}</div>
                  <div className="text-[11px] text-muted">{p.description || 'No description'}</div>
                </div>
                <button onClick={() => removeProject(p.project_id)} className="text-bad hover:text-bad/80 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="font-display text-lg mb-3">Recent runs</div>
          <div className="space-y-2 text-sm">
            {(data?.recent_runs || []).slice(0, 12).map((r, idx) => <div key={idx} className="rounded-lg border border-line bg-elev/40 px-3 py-2"><div>{r.workflow_name || r.run_id}</div><div className="text-[11px] text-muted">{r.status} · {r.owner_user_id || 'unknown user'}</div></div>)}
          </div>
        </section>
      </div>
    </div>
  )
}
