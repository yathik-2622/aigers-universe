import React, { useEffect, useState } from 'react'
import { Briefcase, Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createProject, listProjects } from '../api/projects.js'
import { getCurrentProjectId, setCurrentProjectId } from '../lib/projectStorage.js'

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrent] = useState(getCurrentProjectId())
  const [form, setForm] = useState({ name: '', description: '' })

  const load = async () => {
    try {
      const data = await listProjects()
      setProjects(data.projects || [])
      if (!currentProjectId && data.projects?.[0]?.project_id) {
        setCurrent(data.projects[0].project_id)
        setCurrentProjectId(data.projects[0].project_id)
      }
    } catch {}
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.name.trim()) return toast.error('Project name required')
    try {
      const project = await createProject(form)
      toast.success('Project created')
      setForm({ name: '', description: '' })
      setCurrent(project.project_id)
      setCurrentProjectId(project.project_id)
      load()
    } catch {
      toast.error('Project creation failed')
    }
  }

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Projects</h2>
          <p className="text-muted text-sm mt-1">Organize multiple workflows under a team-level project.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-4">Available projects</div>
          <div className="space-y-2">
            {projects.map(project => (
              <button key={project.project_id} onClick={() => { setCurrent(project.project_id); setCurrentProjectId(project.project_id) }} className={`w-full text-left rounded-xl border px-4 py-3 ${currentProjectId === project.project_id ? 'border-accent bg-accent/10' : 'border-line bg-elev/40'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{project.name}</div>
                    <div className="text-[12px] text-muted line-clamp-2 mt-1">{project.description || 'No description yet.'}</div>
                  </div>
                  {currentProjectId === project.project_id && <Check size={16} className="text-accent shrink-0" />}
                </div>
              </button>
            ))}
            {projects.length === 0 && <div className="text-sm text-muted py-8 text-center">No projects yet.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="flex items-center gap-2 mb-4"><Briefcase size={16} className="text-accent" /><div className="font-display text-lg">Create project</div></div>
          <div className="space-y-3">
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Project name" className="w-full rounded-lg border border-line bg-elev/50 px-3 py-2 text-sm outline-none focus:border-accent/40" />
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What workflows does this team run here?" rows={4} className="w-full rounded-lg border border-line bg-elev/50 px-3 py-2 text-sm outline-none focus:border-accent/40" />
            <button onClick={create} className="w-full rounded-lg bg-accent text-white text-sm font-medium py-2 inline-flex items-center justify-center gap-2"><Plus size={14} /> Create project</button>
          </div>
        </div>
      </div>
    </div>
  )
}
