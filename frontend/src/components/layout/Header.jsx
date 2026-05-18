import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTitle } from '../../context/TitleContext.jsx'

const TITLES = {
  '/dashboard': { title: 'Mission Control', subtitle: 'Live state of every agent, workflow, and approval.' },
  '/projects': { title: 'Projects', subtitle: 'Organize team workflows by workspace and ownership.' },
  '/marketplace': { title: 'Agent Marketplace', subtitle: 'Install review agents and compose your workflow stack.' },
  '/agents': { title: 'Registered Agents', subtitle: 'Configure system prompts, tools, and HITL gates.' },
  '/builder': { title: 'Workflow Builder', subtitle: 'Attach policies, upload documents, save, and run.' },
  '/tools-chat': { title: 'Tool Playground', subtitle: 'Interact with MCP tools through a chat-style playground.' },
  '/runs': { title: 'Workflow Run', subtitle: 'Live execution, resumable steps, and readable reports.' },
  '/hitl': { title: 'Human-in-the-Loop', subtitle: 'Review and approve paused workflows.' },
  '/observability': { title: 'Observability', subtitle: 'Traces, tokens, latency, and cost across all runs.' },
  '/admin': { title: 'Admin Control Tower', subtitle: 'Global visibility across users, projects, and workflow operations.' },
}

export default function Header() {
  const loc = useLocation()
  const { override } = useTitle()
  const base = '/' + (loc.pathname.split('/')[1] || 'dashboard')
  if (base === '/dashboard') return null
  const fallback = TITLES[base] || TITLES['/dashboard']
  const meta = override && (override.title || override.subtitle)
    ? { title: override.title || fallback.title, subtitle: override.subtitle || fallback.subtitle }
    : fallback

  return (
    <header data-testid="app-header" className="px-8 py-5 border-b border-line bg-panel/40 backdrop-blur-md flex items-center justify-between relative z-10">
      <div className="min-w-0">
        <h1 className="text-[22px] font-display font-semibold tracking-tight truncate" data-testid="header-title">{meta.title}</h1>
        <p className="text-[13px] text-muted mt-0.5 truncate" data-testid="header-subtitle">{meta.subtitle}</p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-accent/10 border border-accent/30 text-accent">live</span>
      </div>
    </header>
  )
}
