import React, { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BookOpenText, Briefcase, Cpu, Database, Hexagon, LayoutDashboard, LogOut, Orbit, Settings, ShieldCheck, Store, UserCog, Workflow, Wrench } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [hovered, setHovered] = useState(false)
  const expanded = hovered


  const nav = useMemo(() => {
    const items = [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
      { to: '/projects', label: 'Projects', icon: Briefcase, id: 'projects' },
      { to: '/marketplace', label: 'Marketplace', icon: Store, id: 'marketplace' },
      { to: '/agents', label: 'Agents', icon: Cpu, id: 'agents' },
      { to: '/builder', label: 'Workflow Builder', icon: Workflow, id: 'builder' },
      { to: '/tools-chat', label: 'AIger Copilot', icon: Wrench, id: 'tools-chat' },
      { to: '/knowledge-base', label: 'Knowledge Ingest', icon: Database, id: 'knowledge-base' },
      { to: '/knowledge-graph', label: 'Knowledge Graph', icon: Orbit, id: 'knowledge-graph' },
      { to: '/hitl', label: 'HITL Approvals', icon: ShieldCheck, id: 'hitl' },
      { to: '/observability', label: 'Observability', icon: Activity, id: 'observability' },
      { to: '/platform-docs', label: 'Platform Docs', icon: BookOpenText, id: 'platform-docs' },
    ]
    if (user?.role === 'admin') items.push({ to: '/admin', label: 'Admin View', icon: UserCog, id: 'admin' })
    return items
  }, [user?.role])

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={!expanded}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`h-screen shrink-0 border-r border-line/70 bg-[linear-gradient(180deg,rgba(11,16,28,0.98),rgba(14,20,31,0.94))] backdrop-blur-xl flex flex-col overflow-hidden relative z-10 transition-[width] duration-200 ease-out ${expanded ? 'w-[264px]' : 'w-[78px]'}`}
    >
      <div className={`pt-6 pb-6 ${expanded ? 'px-5' : 'px-3'}`}>
        <div className={`flex items-center ${expanded ? 'gap-3' : 'justify-center'}`}>
          <div className="relative w-9 h-9 flex items-center justify-center" data-testid="brand-logo">
            <Hexagon size={32} strokeWidth={1.4} className="text-accent absolute inset-0 m-auto" />
            <Hexagon size={20} strokeWidth={1.4} className="text-amber-300 absolute inset-0 m-auto rotate-90" />
          </div>
          {expanded && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-base tracking-tight">Aigers Universe</div>
              <div className="text-[10px] text-muted uppercase tracking-[0.22em] mt-0.5">{user?.role === 'admin' ? 'Admin Workspace' : 'Workspace'}</div>
            </div>
          )}
        </div>
      </div>

      <nav className={`flex-1 overflow-y-auto ${expanded ? 'px-3' : 'px-2'} space-y-1`}>
        {nav.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${id}`}
            title={!expanded ? label : undefined}
            className={({ isActive }) => `group flex items-center ${expanded ? 'gap-3 px-3.5' : 'justify-center px-3'} py-3 rounded-2xl text-sm transition-all ${isActive ? 'bg-white/[0.08] text-ink border border-white/10 shadow-[0_18px_48px_rgba(0,0,0,0.18)]' : 'text-muted hover:text-ink hover:bg-white/[0.05] border border-transparent'}`}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            {expanded && <span className="font-medium tracking-tight">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={`mx-3 mb-3 mt-2 rounded-[22px] border border-white/10 bg-white/[0.05] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all ${expanded ? 'p-3' : 'px-2 py-3'}`}>
        {expanded ? (
          <>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-1.5">{user?.role === 'admin' ? 'Admin access' : 'Signed in'}</div>
            <div className="text-sm text-ink font-medium truncate">{user?.display_name || 'Workspace user'}</div>
            <div className="mt-0.5 text-[11px] text-muted truncate">{user?.email || ''}</div>
            <NavLink
              to="/settings"
              className={({ isActive }) => `mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-muted hover:text-ink ${isActive ? 'text-ink border-accent/40 bg-accent/10' : ''}`}
            >
              <Settings size={13} /> Settings
            </NavLink>
            <button onClick={logout} className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-panel/70 px-3 py-2 text-[12px] text-muted hover:text-ink">
              <LogOut size={13} /> Logout
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/[0.08] flex items-center justify-center text-xs font-semibold text-ink">
              {(user?.display_name || user?.email || 'A').slice(0, 1).toUpperCase()}
            </div>
            <NavLink to="/settings" title="Settings" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] p-2 text-muted hover:text-ink" >
              <Settings size={14} />
            </NavLink>
            <button onClick={logout} title="Logout" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-panel/70 p-2 text-muted hover:text-ink">
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>

      {expanded ? null : (
        <div className="mb-3 flex justify-center">
          <span className="h-10 w-1 rounded-full bg-gradient-to-b from-accent via-accent2 to-amber-300 opacity-80" />
        </div>
      )}


    </aside>
  )
}
