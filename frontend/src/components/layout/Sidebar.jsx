import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, ChevronLeft, ChevronRight, Layers,
  Zap, Activity, MessageSquare, ClipboardList, Upload, ShieldAlert, Database, GitCompare,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const NAV = [
  { to: '/summary',      icon: Layers,           label: 'Executive Summary',       sub: 'Tower & SDM Overview' },
  { to: '/comparison',   icon: GitCompare,       label: 'Tower vs SDM',            sub: 'Performance Comparison' },
  { to: '/monitoring',   icon: LayoutDashboard, label: 'M1 Monitoring',          sub: 'Live KPIs & Queues' },
  { to: '/trends',       icon: TrendingUp,      label: 'M2 Trend Analysis',      sub: '6-Month Insights' },
  { to: '/triage',     icon: Zap,             label: 'M3 Smart Triage',        sub: 'AI Auto-Classification' },
  { to: '/routing',    icon: Activity,        label: 'M4 Intelligent Routing',  sub: 'Auto-Assignment ML' },
  { to: '/chatbot',    icon: MessageSquare,   label: 'M5 NL Chatbot',           sub: 'Conversational AI' },
  { to: '/scorecard',  icon: ClipboardList,   label: 'M6 SDM Scorecard',        sub: 'SLA & Agent KPIs' },
  { to: '/breach',     icon: ShieldAlert,     label: 'SLA Risk Board',           sub: 'Breach Intelligence' },
  { to: '/upload',     icon: Upload,          label: 'M7 Data Upload',           sub: 'CSV / Excel Ingestion' },
  { to: '/data',       icon: Database,        label: 'Data Management',          sub: 'Import & Merge Data' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={clsx(
      'flex flex-col h-screen bg-navy dark:bg-slate-900 text-white transition-all duration-300 relative shrink-0',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-5 border-b border-white/10',
        collapsed && 'justify-center px-2'
      )}>
        <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shrink-0">
          <LayoutDashboard size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-white leading-tight">ServiceNow AI</p>
            <p className="text-[10px] text-blue-300 leading-tight">Intelligence Platform</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {!collapsed && (
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-blue-300/60">
            Modules
          </p>
        )}
        {NAV.map(({ to, icon: Icon, label, sub }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150 group',
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-blue-100/80 hover:bg-white/10 hover:text-white',
              collapsed && 'justify-center'
            )}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold leading-tight">{label}</p>
                <p className="text-[10px] opacity-60 leading-tight">{sub}</p>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-20 w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center shadow-lg hover:bg-brand-500 transition-colors z-10"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-white/10 text-[10px] text-blue-300/50">
          <p>Capgemini Technology Services</p>
          <p className="opacity-60">v2.3.0 · AI &amp; Data Practice</p>
        </div>
      )}
    </aside>
  )
}
