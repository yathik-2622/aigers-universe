import React, { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, Briefcase, ChevronLeft, ChevronRight, Cpu, Hexagon, LayoutDashboard, LogOut, Settings, ShieldCheck, Store, UserCog, Workflow, Wrench } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const STORAGE_KEY = 'aigers.sidebar.collapsed'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  const nav = useMemo(() => {
    const items = [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
      { to: '/projects', label: 'Projects', icon: Briefcase, id: 'projects' },
      { to: '/marketplace', label: 'Marketplace', icon: Store, id: 'marketplace' },
      { to: '/agents', label: 'Agents', icon: Cpu, id: 'agents' },
      { to: '/builder', label: 'Workflow Builder', icon: Workflow, id: 'builder' },
      { to: '/tools-chat', label: 'AIger Copilot', icon: Wrench, id: 'tools-chat' },
      { to: '/settings', label: 'Settings', icon: Settings, id: 'settings' },
      { to: '/hitl', label: 'HITL Approvals', icon: ShieldCheck, id: 'hitl' },
      { to: '/observability', label: 'Observability', icon: Activity, id: 'observability' },
    ]
    if (user?.role === 'admin') items.push({ to: '/admin', label: 'Admin View', icon: UserCog, id: 'admin' })
    return items
  }, [user?.role])

  return (
    <aside data-testid="sidebar" data-collapsed={collapsed} className={`h-screen shrink-0 border-r border-line bg-panel/95 backdrop-blur-xl flex flex-col overflow-hidden relative z-10 transition-[width] duration-200 ease-out ${collapsed ? 'w-[72px]' : 'w-64'}`}>
      <div className={`pt-6 pb-7 ${collapsed ? 'px-3' : 'px-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="relative w-9 h-9 flex items-center justify-center" data-testid="brand-logo">
            <Hexagon size={32} strokeWidth={1.4} className="text-accent absolute inset-0 m-auto" />
            <Hexagon size={20} strokeWidth={1.4} className="text-accent2 absolute inset-0 m-auto rotate-90" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-base tracking-tight">Aigers Universe</div>
              <div className="text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">{user?.role === 'admin' ? 'Admin Workspace' : 'User Workspace'}</div>
            </div>
          )}
        </div>
      </div>

      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'} space-y-1`}>
        {nav.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${id}`}
            title={collapsed ? label : undefined}
            className={({ isActive }) => `group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-2xl text-sm transition-all ${isActive ? 'bg-accent/12 text-ink border border-accent/30 shadow-[0_10px_30px_rgba(0,240,255,0.08)]' : 'text-muted hover:text-ink hover:bg-white/5 border border-transparent'}`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {!collapsed && <span className="font-medium tracking-tight">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button data-testid="sidebar-toggle" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="mx-3 mt-2 mb-2 inline-flex items-center justify-center self-start rounded-full border border-white/10 bg-white/5 p-2 text-muted hover:text-ink hover:border-accent/40">
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      {!collapsed && (
        <div className="m-3 rounded-[22px] border border-white/10 bg-white/[0.05] p-3 text-[11px] text-muted leading-relaxed shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-1.5">{user?.role === 'admin' ? 'Control access' : 'Workspace access'}</div>
          <div className="text-ink font-medium truncate">{user?.display_name || 'Workspace user'}</div>
          <div className="truncate">{user?.email || ''}</div>
          <button onClick={logout} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-panel/70 px-3 py-2 text-[12px] text-muted hover:text-ink">
            <LogOut size={13} /> Logout
          </button>
        </div>
      )}
      {collapsed && <div className="mb-3 flex justify-center" title="Workspace access"><span className="w-2 h-2 rounded-full bg-accent animate-pulse" /></div>}
    </aside>
  )
}
