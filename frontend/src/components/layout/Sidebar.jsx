import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Store, Workflow, Cpu, ShieldCheck, Activity,
  Hexagon, ChevronsLeft, ChevronsRight,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',     label: 'Dashboard',         icon: LayoutDashboard, id: 'dashboard' },
  { to: '/marketplace',   label: 'Marketplace',       icon: Store,           id: 'marketplace' },
  { to: '/agents',        label: 'Agents',            icon: Cpu,             id: 'agents' },
  { to: '/builder',       label: 'Workflow Builder',  icon: Workflow,        id: 'builder' },
  { to: '/hitl',          label: 'HITL Approvals',    icon: ShieldCheck,     id: 'hitl' },
  { to: '/observability', label: 'Observability',     icon: Activity,        id: 'observability' },
]

const STORAGE_KEY = 'aigers.sidebar.collapsed'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`shrink-0 border-r border-line bg-panel/70 backdrop-blur-md flex flex-col relative z-10 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Brand */}
      <div className={`pt-6 pb-7 ${collapsed ? 'px-3' : 'px-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="relative w-9 h-9 flex items-center justify-center" data-testid="brand-logo">
            <Hexagon size={32} strokeWidth={1.4} className="text-accent absolute inset-0 m-auto" />
            <Hexagon size={20} strokeWidth={1.4} className="text-accent2 absolute inset-0 m-auto rotate-90" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-base tracking-tight">AIger's Universe</div>
              <div className="text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">Orchestration v1</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} space-y-0.5`}>
        {NAV.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${id}`}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-accent/15 text-ink border border-accent/30'
                  : 'text-muted hover:text-ink hover:bg-elev/60 border border-transparent'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {!collapsed && <span className="font-medium tracking-tight">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`mx-3 mt-2 mb-2 inline-flex items-center ${
          collapsed ? 'justify-center' : 'justify-between gap-2 px-3'
        } py-2 rounded-lg border border-line bg-elev/60 text-muted hover:text-ink hover:border-accent/40 text-[12px]`}
      >
        {collapsed
          ? <ChevronsRight size={14} />
          : (<><span className="font-medium">Collapse</span><ChevronsLeft size={14} /></>)
        }
      </button>

      {/* Footer status badge */}
      {!collapsed && (
        <div className="m-3 p-3 rounded-lg border border-line bg-elev/60 text-[11px] text-muted leading-relaxed">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ok" />
            <span className="text-ink font-medium">Gateway online</span>
          </div>
          MCP · A2A · LangGraph · FAISS
        </div>
      )}
      {collapsed && (
        <div className="mb-3 flex justify-center" title="Gateway online">
          <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
        </div>
      )}
    </aside>
  )
}
