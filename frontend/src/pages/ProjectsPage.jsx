import React, { useEffect, useState } from 'react'
import { Briefcase, Check, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects.js'
import { useAuth } from '../context/AuthContext.jsx'
import { getCurrentProjectId, setCurrentProjectId } from '../lib/projectStorage.js'

export default function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrent] = useState(getCurrentProjectId())
  const [form, setForm] = useState({ name: '', description: '', member_emails: '' })
  const [editingId, setEditingId] = useState('')

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
      member_emails: form.member_emails.split(',').map(v => v.trim()).filter(Boolean),
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

  const removeProject = async (projectId) => {
    if (!confirm('Delete this project? Workflows and runs will be detached from it.')) return
    try {
      await deleteProject(projectId)
      toast.success('Project deleted')
      if (currentProjectId === projectId) {
        setCurrent('')
        setCurrentProjectId('')
      }
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Project delete failed')
    }
  }

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Projects</h2>
          <p className="text-muted text-sm mt-1">Organize shared workflows by project and add team members by email.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="rounded-[28px] border border-line bg-panel/70 p-5 shadow-2xl shadow-black/15">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-4">Available projects</div>
          <div className="space-y-2">
            {projects.map(project => {
              const canManage = user?.role === 'admin' || project.owner_user_id === user?.user_id
              return (
                <div key={project.project_id} className={`w-full text-left rounded-2xl border px-4 py-3 ${currentProjectId === project.project_id ? 'border-accent bg-accent/10' : 'border-line bg-elev/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => { setCurrent(project.project_id); setCurrentProjectId(project.project_id) }} className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{project.name}</div>
                        {currentProjectId === project.project_id && <Check size={16} className="text-accent shrink-0" />}
                      </div>
                      <div className="text-[12px] text-muted line-clamp-2 mt-1">{project.description || 'No description yet.'}</div>
                      <div className="text-[11px] text-muted mt-2 flex items-center gap-2"><Users size={12} /> {(project.member_emails || []).length} team members</div>
                    </button>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(project)} className="text-xs text-accent hover:underline">Edit</button>
                        <button onClick={() => removeProject(project.project_id)} className="text-bad hover:text-bad/80"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {projects.length === 0 && <div className="text-sm text-muted py-8 text-center">No projects yet.</div>}
          </div>
        </div>

        <div className="rounded-[28px] border border-line bg-panel/70 p-5 shadow-2xl shadow-black/15">
          <div className="flex items-center gap-2 mb-4"><Briefcase size={16} className="text-accent" /><div className="font-display text-lg">{editingId ? 'Update project' : 'Create project'}</div></div>
          <div className="space-y-3">
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Project name" className="w-full rounded-xl border border-line bg-elev/50 px-3 py-3 text-sm outline-none focus:border-accent/40" />
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What workflows does this team run here?" rows={4} className="w-full rounded-xl border border-line bg-elev/50 px-3 py-3 text-sm outline-none focus:border-accent/40" />
            <textarea value={form.member_emails} onChange={(e) => setForm(f => ({ ...f, member_emails: e.target.value }))} placeholder="Member emails, comma separated" rows={3} className="w-full rounded-xl border border-line bg-elev/50 px-3 py-3 text-sm outline-none focus:border-accent/40" />
            <button onClick={submit} className="w-full rounded-xl bg-accent text-white text-sm font-medium py-3 inline-flex items-center justify-center gap-2"><Plus size={14} /> {editingId ? 'Update project' : 'Create project'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
