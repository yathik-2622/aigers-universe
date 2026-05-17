import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Plus, Trash2, Workflow as WfIcon } from 'lucide-react'
import { listAgents, deleteAgent, registerAgent, listTools } from '../api/platform.js'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import { toast } from 'sonner'

export default function AgentsPage() {
  const [agents, setAgents] = useState([])
  const [tools, setTools] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', framework: 'langgraph', description: '', system_prompt: '', tools: [], hitl_enabled: false })

  const load = () => listAgents().then(d => setAgents(d.agents || []))
  useEffect(() => { load(); listTools().then(d => setTools(d.tools || [])) }, [])

  const remove = async (id) => {
    if (!confirm('Deactivate this agent?')) return
    try { await deleteAgent(id); toast.success('Agent removed'); load() } catch { toast.error('Failed') }
  }

  const create = async () => {
    if (!form.name || form.system_prompt.length < 10) return toast.error('Name and system_prompt (≥10 chars) required')
    try {
      await registerAgent(form)
      toast.success('Agent registered')
      setShowCreate(false)
      setForm({ name: '', framework: 'langgraph', description: '', system_prompt: '', tools: [], hitl_enabled: false })
      load()
    } catch { toast.error('Registration failed') }
  }

  return (
    <div data-testid="agents-page" className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Registered agents</h2>
          <p className="text-muted text-sm mt-1">{agents.length} active · click an agent to edit prompts and tools.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/marketplace" className="px-3 py-2 rounded-md border border-line bg-elev/50 text-sm hover:border-accent/40">From marketplace</Link>
          <button data-testid="create-agent-btn" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">
            <Plus size={13} /> New agent
          </button>
        </div>
      </div>

      {agents.length === 0 && (
        <div className="text-center py-20 text-muted">
          <Cpu size={32} className="mx-auto mb-3 opacity-50" />
          <div className="text-sm">No agents yet. Install from the Marketplace or create a new one.</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(a => (
          <div key={a.agent_id} data-testid={`agent-card-${a.agent_id}`} className="rounded-xl border border-line bg-panel/60 p-5 card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                  <Cpu size={18} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold tracking-tight truncate">{a.name}</div>
                  <div className="text-[11px] font-mono text-muted truncate">{a.agent_id.slice(0, 12)}…</div>
                </div>
              </div>
              <button onClick={() => remove(a.agent_id)} className="text-muted hover:text-bad p-1" data-testid={`delete-agent-${a.agent_id}`}>
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-[12px] text-muted leading-relaxed line-clamp-2 mb-3 min-h-[34px]">{a.description || 'No description.'}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <FrameworkBadge framework={a.framework} />
              {a.hitl_enabled && <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              {(a.tools || []).slice(0, 3).map(t => (
                <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line text-muted">{t}</span>
              ))}
              {a.tools && a.tools.length > 3 && (
                <span className="text-[10px] font-mono text-muted">+{a.tools.length - 3}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl border border-line bg-panel p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <WfIcon size={18} className="text-accent" />
              <div className="font-display text-lg font-semibold">Register new agent</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Name</label>
                <input data-testid="new-agent-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Framework</label>
                  <select data-testid="new-agent-framework" value={form.framework} onChange={e => setForm(f => ({ ...f, framework: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
                    <option value="langgraph">LangGraph</option>
                    <option value="crewai">CrewAI</option>
                    <option value="langchain">LangChain</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.hitl_enabled} onChange={e => setForm(f => ({ ...f, hitl_enabled: e.target.checked }))} className="accent-warn" />
                    HITL enabled
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Description</label>
                <input data-testid="new-agent-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">System Prompt</label>
                <textarea data-testid="new-agent-prompt" rows={5} value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-[12px] font-mono focus:border-accent outline-none resize-none" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Tools</label>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tools: f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t] }))} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${form.tools.includes(t) ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 rounded-md border border-line text-sm hover:border-bad/40">Cancel</button>
              <button data-testid="submit-new-agent" onClick={create} className="flex-1 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">Register</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
