import React, { useEffect, useState } from 'react'
import { Briefcase, Check, PencilLine, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects.js'
import { useAuth } from '../context/AuthContext.jsx'
import { getCurrentProjectId, setCurrentProjectId } from '../lib/projectStorage.js'

export default function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrent] = useState(getCurrentProjectId())
  const [form, setForm] = useState({ name: '', description: '', member_emails: '' })
  const [editingId, setEditingId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = async () => {
    try {
      const data = await listProjects()
      setProjects(data.projects || [])
      if (!currentProjectId && data.projects?.[0]?.project_id) {
        setCurrent(data.projects[0].project_id)
        setCurrentProjectId(data.projects[0].project_id)
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load projects')
    }
  }

  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Project name required')
    const body = {
      name: form.name,
      description: form.description,
      member_emails: form.member_emails.split(',').map((v) => v.trim()).filter(Boolean),
    }
    try {
      const project = editingId ? await updateProject(editingId, body) : await createProject(body)
      toast.success(editingId ? 'Project updated' : 'Project created')
      if (project.missing_member_emails?.length) toast.error(`Unknown users: ${project.missing_member_emails.join(', ')}`)
      setForm({ name: '', description: '', member_emails: '' })
      setEditingId('')
      setCurrent(project.project_id)
      setCurrentProjectId(project.project_id)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Project save failed')
    }
  }

  const startEdit = (project) => {
    setEditingId(project.project_id)
    setForm({
      name: project.name,
      description: project.description || '',
      member_emails: (project.member_emails || []).join(', '),
    })
  }

  const removeProject = async () => {
    if (!deleteTarget) return
    try {
      await deleteProject(deleteTarget.project_id)
      toast.success('Project deleted')
      if (currentProjectId === deleteTarget.project_id) {
        setCurrent('')
        setCurrentProjectId('')
      }
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Project delete failed')
    }
  }

  return (
    <div className="p-8 max-w-[1450px]">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent">Shared workspaces</div>
        <h2 className="mt-4 text-4xl font-display tracking-tight">Projects for teams, not tabs.</h2>
        <p className="text-muted text-sm mt-2 max-w-2xl">Create a project, attach member emails, and every linked workflow and run becomes visible to the invited workspace members.</p>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-5">
        <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-4">Available projects</div>
          <div className="space-y-3">
            {projects.map((project) => {
              const canManage = user?.role === 'admin' || project.owner_user_id === user?.user_id
              const active = currentProjectId === project.project_id
              return (
                <div key={project.project_id} className={`rounded-[24px] border px-4 py-4 ${active ? 'border-accent/40 bg-accent/10 shadow-[0_18px_60px_rgba(0,213,255,0.08)]' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => { setCurrent(project.project_id); setCurrentProjectId(project.project_id) }} className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{project.name}</div>
                        {active && <Check size={16} className="text-accent shrink-0" />}
                      </div>
                      <div className="text-[12px] text-muted line-clamp-2 mt-1">{project.description || 'No description yet.'}</div>
                      <div className="text-[11px] text-muted mt-3 flex items-center gap-2"><Users size={12} /> {(project.member_emails || []).length} team members</div>
                    </button>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(project)} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:border-accent/40">
                          <PencilLine size={12} /> Edit
                        </button>
                        <button onClick={() => setDeleteTarget(project)} className="inline-flex items-center justify-center rounded-full border border-[#ef476f]/30 bg-[#ef476f]/10 p-2 text-[#ef476f] hover:bg-[#ef476f]/15">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {projects.length === 0 && <div className="text-sm text-muted py-10 text-center">No projects yet.</div>}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-accent" />
            <div className="font-display text-lg">{editingId ? 'Update project' : 'Create project'}</div>
          </div>
          <div className="space-y-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Project name" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What workflows does this team run here?" rows={4} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
            <textarea value={form.member_emails} onChange={(e) => setForm((f) => ({ ...f, member_emails: e.target.value }))} placeholder="Member emails, comma separated" rows={3} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-accent/40" />
            <button onClick={submit} className="w-full rounded-full bg-accent text-white text-sm font-medium py-3 inline-flex items-center justify-center gap-2">
              <Plus size={14} /> {editingId ? 'Update project' : 'Create project'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeProject}
        title={`Delete ${deleteTarget?.name || 'project'}?`}
        description="Workflows and runs will be detached from this project, but their historical records will remain."
        confirmLabel="Delete project"
      />
    </div>
  )
}
