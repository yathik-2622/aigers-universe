import React, { useEffect, useState } from 'react'
import { Save, ShieldCheck, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { listModels, listTools, updateAgent } from '../../api/platform.js'

export default function AgentConfigPanel({ node, onClose, onUpdate, onRemove }) {
  const [tools, setTools] = useState([])
  const [models, setModels] = useState([])
  const [form, setForm] = useState({ name: '', system_prompt: '', model_name: 'gpt-4o', tools: [], hitl_enabled: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listTools().then(d => setTools(d.tools || [])).catch(() => {})
    listModels().then(d => setModels(d.models || [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (!node) return
    const d = node.data || {}
    setForm({ name: d.name || '', system_prompt: d.system_prompt || '', model_name: d.model_name || 'gpt-4o', tools: d.tools || [], hitl_enabled: !!d.hitl_enabled })
  }, [node])
  if (!node) return null

  const toggleTool = (t) => setForm(f => ({ ...f, tools: f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t] }))

  const save = async () => {
    if (!node.data?.agent_id) return toast.error('Agent not yet persisted')
    setSaving(true)
    try {
      const updated = await updateAgent(node.data.agent_id, form)
      onUpdate(node.id, { ...node.data, ...updated })
      toast.success('Agent updated')
    } catch {
      toast.error('Failed to update agent')
    } finally { setSaving(false) }
  }

  return (
    <div data-testid="agent-config-panel" className="absolute right-0 top-0 bottom-0 w-[420px] bg-panel/95 backdrop-blur-xl border-l border-line z-20 flex flex-col">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div><div className="text-[11px] uppercase tracking-widest text-muted">Agent config</div><div className="text-base font-display font-semibold mt-0.5">{form.name || 'Untitled'}</div></div>
        <button onClick={onClose} className="text-muted hover:text-ink p-1"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5">Name</label>
          <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm font-mono focus:border-accent outline-none" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5">Model</label>
          <select value={form.model_name} onChange={(e) => setForm(f => ({ ...f, model_name: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
            {models.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5">System Prompt</label>
          <textarea value={form.system_prompt} onChange={(e) => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={8} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-[12px] font-mono focus:border-accent outline-none resize-none leading-relaxed" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1.5"><Wrench size={11} /> MCP Tools</label>
          <div className="space-y-1">
            {tools.map(t => (
              <label key={t} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded border border-line bg-elev/50 hover:border-accent/40 cursor-pointer">
                <input type="checkbox" checked={form.tools.includes(t)} onChange={() => toggleTool(t)} className="accent-accent" />
                <span className="font-mono text-[12px]">{t}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-elev/50">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-warn" />
            <div><div className="text-sm font-medium">HITL enabled</div><div className="text-[11px] text-muted">Pause workflow for human review</div></div>
          </div>
          <button onClick={() => setForm(f => ({ ...f, hitl_enabled: !f.hitl_enabled }))} className={`relative w-10 h-5 rounded-full transition ${form.hitl_enabled ? 'bg-warn' : 'bg-line'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.hitl_enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-line flex items-center gap-2">
        <button onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"><Save size={14} /> {saving ? 'Saving...' : 'Save changes'}</button>
        <button onClick={() => onRemove(node.id)} className="px-3 py-2 rounded-md border border-bad/40 text-bad text-sm hover:bg-bad/10">Remove</button>
      </div>
    </div>
  )
}
