import React, { useEffect, useState } from 'react'
import { Save, ShieldCheck, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { listModels, listTools, updateAgent } from '../../api/platform.js'
import { validateRemoteCard } from '../../api/a2a.js'
import CustomSelect from '../common/CustomSelect.jsx'
import { normalizeModelOptions } from '../../lib/modelOptions.js'

export default function AgentConfigPanel({ node, onClose, onUpdate, onRemove }) {
  const [tools, setTools] = useState([])
  const [models, setModels] = useState([])
  const [form, setForm] = useState({
    name: '',
    system_prompt: '',
    model_name: 'gpt-4o',
    tools: [],
    hitl_enabled: false,
    a2a_enabled: true,
    a2a_mode: 'local',
    remote_agent_card_url: '',
    input_bindings: {
      include_text_input: true,
      include_uploaded_files: true,
      include_github_repo: true,
      include_knowledge_base: true,
      include_upstream_outputs: true,
    },
  })
  const [saving, setSaving] = useState(false)
  const [testingRemoteCard, setTestingRemoteCard] = useState(false)
  const [remoteCardSummary, setRemoteCardSummary] = useState(null)

  useEffect(() => {
    listTools().then(d => setTools(d.tools || [])).catch(() => {})
    listModels().then(d => setModels(normalizeModelOptions(d.models || []))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!node) return
    const d = node.data || {}
    setForm({
      name: d.name || '',
      system_prompt: d.system_prompt || '',
      model_name: d.model_name || 'gpt-4o',
      tools: d.tools || [],
      hitl_enabled: !!d.hitl_enabled,
      a2a_enabled: d.a2a_enabled ?? true,
      a2a_mode: d.a2a_mode || 'local',
      remote_agent_card_url: d.remote_agent_card_url || '',
      input_bindings: {
        include_text_input: true,
        include_uploaded_files: true,
        include_github_repo: true,
        include_knowledge_base: true,
        include_upstream_outputs: true,
        ...(d.input_bindings || {}),
      },
    })
    setRemoteCardSummary(null)
  }, [node])
  if (!node) return null

  const toggleTool = (t) => setForm(f => ({ ...f, tools: f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t] }))
  const toggleBinding = (key) => setForm(f => ({ ...f, input_bindings: { ...f.input_bindings, [key]: !f.input_bindings[key] } }))

  const testRemoteCardNow = async () => {
    const url = form.remote_agent_card_url.trim()
    if (!url) return toast.error('Enter a remote agent card URL first')
    setTestingRemoteCard(true)
    try {
      const res = await validateRemoteCard(url)
      setRemoteCardSummary(res.summary)
      toast.success(`Remote card validated for ${res.summary?.name || 'agent'}`)
    } catch (err) {
      setRemoteCardSummary(null)
      toast.error(err?.response?.data?.detail || 'Remote card validation failed')
    } finally {
      setTestingRemoteCard(false)
    }
  }

  const save = async () => {
    if (!node.data?.agent_id) return toast.error('Agent not yet persisted')
    if (form.a2a_mode === 'remote' && !form.remote_agent_card_url.trim()) return toast.error('Remote agent card URL is required for remote A2A mode')
    setSaving(true)
    try {
      const persistable = {
        name: form.name,
        system_prompt: form.system_prompt,
        model_name: form.model_name,
        tools: form.tools,
        hitl_enabled: form.hitl_enabled,
        a2a_enabled: form.a2a_enabled,
        a2a_mode: form.a2a_mode,
        remote_agent_card_url: form.a2a_mode === 'remote' ? form.remote_agent_card_url.trim() : '',
      }
      const updated = await updateAgent(node.data.agent_id, persistable)
      onUpdate(node.id, {
        ...node.data,
        ...updated,
        a2a_enabled: form.a2a_enabled,
        a2a_mode: form.a2a_mode,
        remote_agent_card_url: form.a2a_mode === 'remote' ? form.remote_agent_card_url.trim() : '',
        input_bindings: form.input_bindings,
      })
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
          <CustomSelect
            label="Model"
            value={form.model_name}
            onChange={(value) => setForm((f) => ({ ...f, model_name: value }))}
            options={models}
          />
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
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5">A2A routing</label>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded border border-line bg-elev/40 px-3 py-2">
              <span className="text-sm">A2A enabled</span>
              <button onClick={() => setForm(f => ({ ...f, a2a_enabled: !f.a2a_enabled }))} className={`relative w-10 h-5 rounded-full transition ${form.a2a_enabled ? 'bg-accent' : 'bg-line'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.a2a_enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <CustomSelect
              label="A2A mode"
              value={form.a2a_mode}
              onChange={(value) => setForm((f) => ({ ...f, a2a_mode: value }))}
              options={[
                { value: 'local', label: 'Local agent execution' },
                { value: 'remote', label: 'Remote A2A agent route' },
              ]}
            />
            {form.a2a_mode === 'remote' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={form.remote_agent_card_url} onChange={(e) => { setForm(f => ({ ...f, remote_agent_card_url: e.target.value })); setRemoteCardSummary(null) }} placeholder="https://host/api/a2a/agents/{agent_id}/card" className="flex-1 bg-elev border border-line rounded-md px-3 py-2 text-sm font-mono focus:border-accent outline-none" />
                  <button type="button" onClick={testRemoteCardNow} disabled={testingRemoteCard || !form.remote_agent_card_url.trim()} className="px-3 py-2 rounded-md border border-accent/40 text-sm text-accent hover:bg-accent/10 disabled:opacity-50">
                    {testingRemoteCard ? 'Testing...' : 'Test remote card'}
                  </button>
                </div>
                {remoteCardSummary && (
                  <div className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-[12px] text-muted">
                    Connected to <span className="text-ink font-medium">{remoteCardSummary.name}</span>
                    {remoteCardSummary.framework ? ` (${remoteCardSummary.framework})` : ''} with {remoteCardSummary.skills_count} skill{remoteCardSummary.skills_count === 1 ? '' : 's'}.
                  </div>
                )}
              </div>
            )}
            <div className="text-[11px] text-muted">Use remote mode when this node should delegate to an external agent card over HTTP instead of running locally in this backend.</div>
          </div>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted mb-1.5">Workflow input bindings</label>
          <div className="space-y-1">
            {[
              ['include_text_input', 'Text input'],
              ['include_uploaded_files', 'Uploaded files'],
              ['include_github_repo', 'Workflow GitHub import'],
              ['include_knowledge_base', 'Knowledge base context'],
              ['include_upstream_outputs', 'Upstream agent outputs'],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => toggleBinding(key)} className={`w-full flex items-center justify-between rounded border px-3 py-2 text-sm ${form.input_bindings[key] ? 'border-accent/40 bg-accent/10 text-ink' : 'border-line bg-elev/40 text-muted'}`}>
                <span>{label}</span>
                <span className="text-[10px] font-mono uppercase">{form.input_bindings[key] ? 'ON' : 'OFF'}</span>
              </button>
            ))}
          </div>
          <div className="text-[11px] text-muted mt-2">These bindings are saved on this workflow node, so the same installed agent can see different inputs in different workflows.</div>
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
