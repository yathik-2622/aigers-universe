import React from 'react'
import clsx from 'clsx'

const STYLES = {
  langgraph: 'bg-accent/10 text-accent border-accent/30',
  crewai: 'bg-accent2/10 text-accent2 border-accent2/30',
  langchain: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  agno: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
}

export default function FrameworkBadge({ framework, className }) {
  const style = STYLES[framework] || 'bg-muted/10 text-muted border-muted/30'
  return (
    <span
      data-testid={`framework-${framework}`}
      className={clsx('px-2 py-0.5 text-[10px] font-mono uppercase rounded border', style, className)}
    >
      {framework}
    </span>
  )
}
