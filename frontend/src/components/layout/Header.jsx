import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTitle } from '../../context/TitleContext.jsx'

const TITLES = {
  '/dashboard': { title: 'Mission Control', subtitle: 'Live state of every agent, workflow, and approval.' },
  '/projects': { title: 'Projects', subtitle: 'Organize team workflows by workspace and ownership.' },
  '/marketplace': { title: 'Agent Marketplace', subtitle: 'Install review agents and compose your workflow stack.' },
  '/agents': { title: 'Registered Agents', subtitle: 'Configure system prompts, tools, and HITL gates.' },
  '/builder': { title: 'Workflow Builder', subtitle: 'Attach policies, upload documents, save, and run.' },
  '/tools-chat': { title: 'AIger Copilot', subtitle: 'Platform-aware chat with models, MCP tools, file context, and agent guidance.' },
  '/knowledge-base': { title: 'Knowledge Base', subtitle: 'Upload reusable documents, manage visibility, and explore semantic graph structure.' },
  '/knowledge-graph': { title: 'Knowledge Graph', subtitle: 'Explore semantic document clusters and chunk-level similarity links in 2D/3D.' },
  '/platform-docs': { title: 'Platform Documentation', subtitle: 'Implementation logic, tech stack, and page-by-page system behavior.' },
  '/runs': { title: 'Workflow Run', subtitle: 'Live execution, resumable steps, and readable reports.' },
  '/hitl': { title: 'Human-in-the-Loop', subtitle: 'Review and approve paused workflows.' },
  '/observability': { title: 'Observability', subtitle: 'Traces, tokens, latency, and cost across all runs.' },
  '/admin': { title: 'Admin Control Tower', subtitle: 'Global visibility across users, projects, and workflow operations.' },
}

const HIDDEN_ROUTES = new Set(['/dashboard', '/projects', '/marketplace', '/agents', '/hitl', '/admin', '/runs', '/tools-chat', '/knowledge-graph', '/knowledge-base'])

export default function Header() {
  const loc = useLocation()
  const { override } = useTitle()
  const base = '/' + (loc.pathname.split('/')[1] || 'dashboard')
  if (HIDDEN_ROUTES.has(base)) return null
  const compact = base === '/tools-chat' || base === '/builder'
  const fallback = TITLES[base] || TITLES['/dashboard']
  const meta = override && (override.title || override.subtitle)
    ? { title: override.title || fallback.title, subtitle: override.subtitle || fallback.subtitle }
    : fallback

  return (
    <header data-testid="app-header" className={`border-b border-line bg-panel/40 backdrop-blur-md flex items-center justify-between relative z-10 ${compact ? 'px-6 py-2.5' : 'px-8 py-5'}`}>
      <div className="min-w-0">
        <h1 className={`${compact ? 'text-[18px]' : 'text-[22px]'} font-display font-semibold tracking-tight truncate`} data-testid="header-title">{meta.title}</h1>
        <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-muted mt-0.5 truncate`} data-testid="header-subtitle">{meta.subtitle}</p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className={`font-mono bg-accent/10 border border-accent/30 text-accent rounded-md ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}>live</span>
      </div>
    </header>
  )
}
