import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Code2, Copy, Cpu, Download, Eye, Link2, Plus, Trash2, Workflow as WfIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import CodeSnippet from '../components/common/CodeSnippet.jsx'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import CustomSelect from '../components/common/CustomSelect.jsx'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import ModelBadge from '../components/common/ModelBadge.jsx'
import { deleteAgent, exportAgentCode, listAgents, listModels, listTools, registerAgent } from '../api/platform.js'
import { listAgentCards, validateRemoteCard } from '../api/a2a.js'
import { normalizeModelOptions } from '../lib/modelOptions.js'

const EXPORT_FRAMEWORKS = [
  { value: 'langgraph', label: 'LangGraph Python' },
  { value: 'langchain', label: 'LangChain Python' },
  { value: 'crewai', label: 'CrewAI Python' },
  { value: 'agno', label: 'Agno Python' },
  { value: 'langflow', label: 'Langflow JSON' },
]

export default function AgentsPage() {
  const [agents, setAgents] = useState([])
  const [tools, setTools] = useState([])
  const [models, setModels] = useState([])
  const [agentCards, setAgentCards] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    framework: 'langgraph',
    description: '',
    system_prompt: '',
    model_name: 'gpt-4o',
    tools: [],
    hitl_enabled: false,
    tags: [],
    tag_input: '',
    a2a_enabled: true,
    a2a_mode: 'local',
    remote_agent_card_url: '',
  })
  const [codeModal, setCodeModal] = useState({ open: false, agent: null, framework: 'langgraph', content: '' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [copiedCardId, setCopiedCardId] = useState('')
  const [testingRemoteCard, setTestingRemoteCard] = useState(false)
  const [remoteCardSummary, setRemoteCardSummary] = useState(null)

  const load = () => listAgents().then(d => setAgents(d.agents || []))
  useEffect(() => {
    load()
    listTools().then(d => setTools(d.tools || []))
    listModels().then(d => setModels(normalizeModelOptions(d.models || [])))
    listAgentCards().then(d => setAgentCards(d.cards || [])).catch(() => {})
  }, [])

  const normalizedFramework = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const filteredTags = (agent) => (agent.tags || []).filter(tag => normalizedFramework(tag) !== normalizedFramework(agent.framework))

  const copyCardUrl = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedCardId(id)
      toast.success('Agent card URL copied')
      window.setTimeout(() => setCopiedCardId(''), 1500)
    } catch {
      toast.error('Failed to copy agent card URL')
    }
  }

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

  const remove = async () => {
    if (!deleteTarget) return
    try { await deleteAgent(deleteTarget); toast.success('Agent removed'); setDeleteTarget(null); load() } catch { toast.error('Failed') }
  }

  const create = async () => {
    if (!form.name || form.system_prompt.length < 10) return toast.error('Name and system prompt are required')
    if (form.a2a_mode === 'remote' && !form.remote_agent_card_url.trim()) return toast.error('Remote agent card URL is required for remote A2A mode')
    try {
      await registerAgent({
        name: form.name,
        framework: form.framework,
        description: form.description,
        system_prompt: form.system_prompt,
        model_name: form.model_name,
        tools: form.tools,
        hitl_enabled: form.hitl_enabled,
        tags: form.tags,
        a2a_enabled: form.a2a_enabled,
        a2a_mode: form.a2a_mode,
        remote_agent_card_url: form.a2a_mode === 'remote' ? form.remote_agent_card_url.trim() : '',
      })
      toast.success('Agent registered')
      setShowCreate(false)
      setForm({ name: '', framework: 'langgraph', description: '', system_prompt: '', model_name: 'gpt-4o', tools: [], hitl_enabled: false, tags: [], tag_input: '', a2a_enabled: true, a2a_mode: 'local', remote_agent_card_url: '' })
      setRemoteCardSummary(null)
      load()
    } catch { toast.error('Registration failed') }
  }

  const openCodeModal = async (agent, framework = agent.framework || 'langgraph') => {
    try {
      const content = await exportAgentCode(agent.agent_id, framework)
      setCodeModal({ open: true, agent, framework, content })
    } catch {
      toast.error('Failed to load agent code')
    }
  }

  const changeExportFramework = async (framework) => {
    if (!codeModal.agent) return
    try {
      const content = await exportAgentCode(codeModal.agent.agent_id, framework)
      setCodeModal((prev) => ({ ...prev, framework, content }))
    } catch {
      toast.error('Failed to change export format')
    }
  }

  const downloadCode = () => {
    if (!codeModal.agent || !codeModal.content) return
    const ext = codeModal.framework === 'langflow' ? 'json' : 'py'
    const blob = new Blob([codeModal.content], { type: ext === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${codeModal.agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${codeModal.framework}.${ext}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-testid="agents-page" className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Registered agents</h2>
          <p className="text-muted text-sm mt-1">{agents.length} active · model-aware agents for real workflow execution.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/marketplace" className="px-3 py-2 rounded-md border border-line bg-elev/50 text-sm hover:border-accent/40">From marketplace</Link>
          <button data-testid="create-agent-btn" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">
            <Plus size={13} /> New agent
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent mb-3">
              <Link2 size={12} /> Local agent cards
            </div>
            <div className="font-display text-lg font-semibold tracking-tight">Copy card URLs directly for remote A2A routing.</div>
            <div className="text-sm text-muted mt-1 max-w-3xl">Use `Local` when the agent should execute inside this backend. Use `Remote` when the agent should delegate to another agent card URL over HTTP. Remote is useful for cross-backend federation, specialized external agents, or isolating heavy runtimes.</div>
          </div>
          <div className="text-xs text-muted">Available cards: {agentCards.length}</div>
        </div>
        {agentCards.length > 0 && (
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
            {agentCards.slice(0, 8).map((card) => (
              <div key={card.agent_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{card.name}</div>
                    <div className="text-[11px] font-mono text-muted truncate">{card.invoke_url}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FrameworkBadge framework={card.framework} />
                    <button onClick={() => copyCardUrl(card.url, card.agent_id)} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:border-accent/40">
                      {copiedCardId === card.agent_id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedCardId === card.agent_id ? 'Copied' : 'Copy card URL'}
                    </button>
                  </div>
                </div>
                <div className="text-[12px] text-muted line-clamp-2">{card.description || 'No description provided.'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(a => (
          <div key={a.agent_id} data-testid={`agent-card-${a.agent_id}`} className="rounded-xl border border-line bg-panel/60 p-5 card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0"><Cpu size={18} className="text-accent" /></div>
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold tracking-tight truncate">{a.name}</div>
                  <div className="mt-1"><ModelBadge model={a.model_name || 'gpt-4o'} /></div>
                </div>
              </div>
              <button onClick={() => setDeleteTarget(a.agent_id)} className="text-muted hover:text-bad p-1" data-testid={`delete-agent-${a.agent_id}`}><Trash2 size={14} /></button>
            </div>
            <p className="text-[12px] text-muted leading-relaxed line-clamp-2 mb-3 min-h-[34px]">{a.description || 'No description.'}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <FrameworkBadge framework={a.framework} />
              {a.hitl_enabled && <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              {a.a2a_enabled && <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${a.a2a_mode === 'remote' ? 'border-accent/40 text-accent bg-accent/10' : 'border-line text-muted'}`}>A2A {a.a2a_mode === 'remote' ? 'REMOTE' : 'LOCAL'}</span>}
              {filteredTags(a).slice(0, 2).map(tag => <span key={tag} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line text-muted">{tag}</span>)}
              {(a.tools || []).slice(0, 3).map(t => <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line text-muted">{t}</span>)}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => openCodeModal(a)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-line bg-elev/50 px-3 py-2 text-xs hover:border-accent/40">
                <Eye size={13} /> View code
              </button>
              <button onClick={() => openCodeModal(a, 'langflow')} className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-elev/50 px-3 py-2 text-xs hover:border-accent/40">
                <Code2 size={13} /> JSON
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-panel p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4"><WfIcon size={18} className="text-accent" /><div className="font-display text-lg font-semibold">Register new agent</div></div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Framework</label>
                <CustomSelect
                  label="Framework"
                  value={form.framework}
                  onChange={(value) => setForm((f) => ({ ...f, framework: value }))}
                  options={[
                    { value: 'langgraph', label: 'LangGraph' },
                    { value: 'crewai', label: 'CrewAI' },
                    { value: 'langchain', label: 'LangChain' },
                    { value: 'agno', label: 'Agno' },
                  ]}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Model</label>
                <CustomSelect
                  label="Model"
                  value={form.model_name}
                  onChange={(value) => setForm((f) => ({ ...f, model_name: value }))}
                  options={models}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">System Prompt</label>
                <textarea rows={6} value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} className="w-full bg-elev border border-line rounded-md px-3 py-2 text-[12px] font-mono focus:border-accent outline-none resize-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Tools</label>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tools: f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t] }))} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${form.tools.includes(t) ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input value={form.tag_input} onChange={e => setForm(f => ({ ...f, tag_input: e.target.value }))} placeholder="migration, java, spring-boot" className="flex-1 bg-elev border border-line rounded-md px-3 py-2 text-sm focus:border-accent outline-none" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tag_input.trim() ? [...new Set([...f.tags, ...f.tag_input.split(',').map(t => t.trim()).filter(Boolean)])] : f.tags, tag_input: '' }))} className="px-3 py-2 rounded-md border border-line text-sm hover:border-accent/40">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map(tag => (
                    <button key={tag} type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== tag) }))} className="text-[11px] font-mono px-2 py-0.5 rounded border border-line text-muted hover:border-bad/40">
                      {tag} ×
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] uppercase tracking-widest text-muted block mb-1">A2A mode</label>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.a2a_enabled} onChange={e => setForm(f => ({ ...f, a2a_enabled: e.target.checked }))} className="accent-accent" />
                    <span className="text-sm">A2A enabled</span>
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
                </div>
                {form.a2a_mode === 'remote' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={form.remote_agent_card_url} onChange={e => { setForm(f => ({ ...f, remote_agent_card_url: e.target.value })); setRemoteCardSummary(null) }} placeholder="https://host/api/a2a/agents/{agent_id}/card" className="flex-1 bg-elev border border-line rounded-md px-3 py-2 text-sm font-mono focus:border-accent outline-none" />
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
                <div className="text-[11px] text-muted mt-2">Use remote mode when this installed agent should delegate work to a network-reachable agent card.</div>
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={form.hitl_enabled} onChange={e => setForm(f => ({ ...f, hitl_enabled: e.target.checked }))} className="accent-warn" />
                <span className="text-sm">HITL enabled</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 rounded-md border border-line text-sm hover:border-bad/40">Cancel</button>
              <button onClick={create} className="flex-1 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90">Register</button>
            </div>
          </div>
        </div>
      )}

      {codeModal.open && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCodeModal({ open: false, agent: null, framework: 'langgraph', content: '' })}>
          <div className="w-full max-w-5xl max-h-[88vh] rounded-2xl border border-line bg-panel shadow-2xl shadow-black/35 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted">Agent export</div>
                <div className="font-display text-lg font-semibold mt-1">{codeModal.agent?.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <CustomSelect
                  label="Export framework"
                  value={codeModal.framework}
                  onChange={changeExportFramework}
                  options={EXPORT_FRAMEWORKS}
                  className="w-[220px]"
                />
                <button onClick={downloadCode} className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm text-white hover:opacity-90">
                  <Download size={14} /> Download
                </button>
                <button onClick={() => setCodeModal({ open: false, agent: null, framework: 'langgraph', content: '' })} className="rounded-md border border-line bg-elev/50 p-2 text-muted hover:text-ink">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-line text-xs text-muted">
              Exported code is generated from the registered agent config so teams can inspect the prompt, model, framework shape, and configured tool list before promoting it elsewhere.
            </div>
            <div className="flex-1 overflow-auto p-5">
              <CodeSnippet code={codeModal.content} />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Deactivate this agent?"
        description="The agent will stop appearing in active workflow libraries, but historical runs will keep their trace records."
        confirmLabel="Deactivate agent"
      />
    </div>
  )
}
