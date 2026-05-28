import React, { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Code2, Database, Download, FileText, Lightbulb, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import CodeSnippet from '../components/common/CodeSnippet.jsx'
import CustomSelect from '../components/common/CustomSelect.jsx'
import FrameworkBadge from '../components/common/FrameworkBadge.jsx'
import ModelBadge from '../components/common/ModelBadge.jsx'
import ModalShell from '../components/common/ModalShell.jsx'
import { getTemplateCode, installTemplate, listTemplates } from '../api/platform.js'

const ICONS = { FileText, Database, AlertTriangle, ShieldCheck, Lightbulb }
const EXPORT_FRAMEWORKS = [
  { value: 'langgraph', label: 'LangGraph Python' },
  { value: 'langchain', label: 'LangChain Python' },
  { value: 'crewai', label: 'CrewAI Python' },
  { value: 'agno', label: 'Agno Python' },
  { value: 'langflow', label: 'Langflow JSON' },
]

export default function MarketplacePage() {
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState(null)
  const [preview, setPreview] = useState({ open: false, name: '', templateId: '', framework: 'langgraph', code: '' })
  const normalizedFramework = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

  const load = (q = '') => listTemplates(q).then(d => setTemplates(d.templates || []))
  useEffect(() => { load() }, [])

  const install = async (tpl) => {
    setInstalling(tpl.template_id)
    try {
      const res = await installTemplate(tpl.template_id, {})
      toast.success(`${res.name} installed as agent`)
      load(search)
    } catch {
      toast.error('Failed to install template')
    } finally { setInstalling(null) }
  }

  const previewCode = async (tpl, framework = tpl.framework) => {
    try {
      const code = await getTemplateCode(tpl.template_id, framework)
      setPreview({ open: true, name: tpl.name, templateId: tpl.template_id, framework, code })
    } catch {
      toast.error('Failed to load template code')
    }
  }

  const changeFramework = async (framework) => {
    if (!preview.templateId) return
    try {
      const code = await getTemplateCode(preview.templateId, framework)
      setPreview((prev) => ({ ...prev, framework, code }))
    } catch {
      toast.error('Failed to change template export')
    }
  }

  const downloadCode = () => {
    if (!preview.code) return
    const ext = preview.framework === 'langflow' ? 'json' : 'py'
    const blob = new Blob([preview.code], { type: ext === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${preview.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${preview.framework}.${ext}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-testid="marketplace-page" className="p-8 max-w-[1450px]">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent">Agent marketplace</div>
          <h2 className="text-4xl font-display font-semibold tracking-tight mt-4">Install production review agents.</h2>
          <p className="text-muted text-sm mt-2 max-w-2xl">Install once, then the marketplace will keep the card marked as installed for your user workspace.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value) }} placeholder="Search templates..." className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2.5 text-sm w-72 focus:border-accent outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map((tpl, i) => {
          const Icon = ICONS[tpl.icon] || FileText
          return (
            <div key={tpl.template_id} className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur p-5 card-hover fade-up shadow-[0_18px_60px_rgba(0,0,0,0.18)]" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center"><Icon size={18} className="text-accent" /></div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{tpl.category}</span>
              </div>
              <div className="font-display text-base font-semibold tracking-tight mb-1">{tpl.name}</div>
              <p className="text-[13px] text-muted leading-relaxed mb-4 min-h-[42px]">{tpl.description}</p>
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                <FrameworkBadge framework={tpl.framework} />
                {tpl.default_model_name && <ModelBadge model={tpl.default_model_name} />}
                {(tpl.tags || []).filter(tag => normalizedFramework(tag) !== normalizedFramework(tpl.framework)).slice(0, 3).map(tag => <span key={tag} className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-line text-muted bg-elev/50">{tag}</span>)}
                {(tpl.suggested_tools || []).map(t => <span key={t} className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-line text-muted bg-elev/50">{t}</span>)}
                {tpl.hitl_enabled && <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              </div>
              <button onClick={() => previewCode(tpl)} className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-full border border-white/10 bg-white/5 text-sm hover:border-accent/40">
                <Code2 size={13} /> Preview code
              </button>
              {tpl.installed ? (
                <div className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-full border border-ok/30 bg-ok/10 text-ok text-sm font-medium">
                  <CheckCircle2 size={13} /> Installed
                </div>
              ) : (
                <button onClick={() => install(tpl)} disabled={installing === tpl.template_id} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  <Download size={13} /> {installing === tpl.template_id ? 'Installing...' : 'Install'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <ModalShell
        open={preview.open}
        onClose={() => setPreview({ open: false, name: '', templateId: '', framework: 'langgraph', code: '' })}
        title={preview.name || 'Template code'}
        subtitle="Colorized scaffold for this marketplace agent template."
        width="max-w-5xl"
        actions={(
          <>
            <CustomSelect
              label="Export framework"
              value={preview.framework}
              options={EXPORT_FRAMEWORKS}
              onChange={changeFramework}
              className="w-[220px]"
            />
            <button onClick={downloadCode} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm text-white hover:opacity-90">
              <Download size={14} /> Download
            </button>
          </>
        )}
      >
        <div className="p-5">
          <CodeSnippet code={preview.code} language={preview.framework === 'langflow' ? 'json' : 'python'} />
        </div>
      </ModalShell>
    </div>
  )
}
