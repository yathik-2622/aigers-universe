import React from 'react'

export default function SectorLegend({ legend = {}, counts = {}, active = '', onToggle = () => {} }) {
  const keys = Object.keys(legend || {}).sort()
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onToggle('')}
        className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.15em] ${
          !active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/15 text-muted hover:border-accent/30'
        }`}
      >
        All
      </button>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onToggle(active === key ? '' : key)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
            active === key ? 'border-accent/40 bg-accent/10 text-ink' : 'border-white/15 text-muted hover:border-accent/30'
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: legend[key] }} />
          <span className="uppercase tracking-[0.12em]">{key}</span>
          <span className="font-mono text-[11px]">{counts[key] || 0}</span>
        </button>
      ))}
    </div>
  )
}
