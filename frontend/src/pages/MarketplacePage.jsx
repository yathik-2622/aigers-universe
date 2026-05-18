import React, { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, Download, FileText, Lightbulb, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { installTemplate, listTemplates } from '../api/platform.js'

const ICONS = { FileText, Database, AlertTriangle, ShieldCheck, Lightbulb }

export default function MarketplacePage() {
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState(null)

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

  return (
    <div data-testid="marketplace-page" className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Agent templates</h2>
          <p className="text-muted text-sm mt-1">Install once, then the marketplace will keep the card marked as installed for your user workspace.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value) }} placeholder="Search templates..." className="bg-elev border border-line rounded-md pl-9 pr-3 py-2 text-sm w-64 focus:border-accent outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map((tpl, i) => {
          const Icon = ICONS[tpl.icon] || FileText
          return (
            <div key={tpl.template_id} className="rounded-xl border border-line bg-panel/60 backdrop-blur p-5 card-hover fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center"><Icon size={18} className="text-accent" /></div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{tpl.category}</span>
              </div>
              <div className="font-display text-base font-semibold tracking-tight mb-1">{tpl.name}</div>
              <p className="text-[13px] text-muted leading-relaxed mb-4 min-h-[42px]">{tpl.description}</p>
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {(tpl.suggested_tools || []).map(t => <span key={t} className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-line text-muted bg-elev/50">{t}</span>)}
                {tpl.hitl_enabled && <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              </div>
              {tpl.installed ? (
                <div className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-ok/30 bg-ok/10 text-ok text-sm font-medium">
                  <CheckCircle2 size={13} /> Installed
                </div>
              ) : (
                <button onClick={() => install(tpl)} disabled={installing === tpl.template_id} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  <Download size={13} /> {installing === tpl.template_id ? 'Installing...' : 'Install'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
