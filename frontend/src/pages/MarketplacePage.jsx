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
                {(tpl.suggested_tools || []).map(t => <span key={t} className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-line text-muted bg-elev/50">{t}</span>)}
                {tpl.hitl_enabled && <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10">HITL</span>}
              </div>
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
    </div>
  )
}
