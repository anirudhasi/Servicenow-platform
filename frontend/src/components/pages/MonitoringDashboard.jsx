import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PolarAngleAxis
} from 'recharts'
import {
  AlertTriangle, Activity, Clock, RefreshCw, RotateCcw, CheckCircle2,
  Users, TrendingDown, Search, ChevronLeft, ChevronRight, ArrowUpDown
} from 'lucide-react'
import { format } from 'date-fns'
import { monitoring as monApi, insights as insApi, buildParams } from '../../services/api'
import Header from '../layout/Header'
import {
  KPICard, InsightCard, FilterBar, DrilldownModal,
  SkeletonCard, CustomTooltip, EmptyState
} from '../common/index.jsx'
import clsx from 'clsx'

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = ['#2563EB','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444']
const P_COLORS = { P1: '#EF4444', P2: '#F97316', P3: '#EAB308', P4: '#22C55E' }
const STATE_COLORS = {
  Open: '#3B82F6', 'In Progress': '#8B5CF6', 'On Hold': '#F59E0B', Resolved: '#22C55E', Closed: '#94A3B8'
}

// ── Custom SLA Gauge ──────────────────────────────────────────────────────────
function SLAGauge({ data }) {
  if (!data) return <SkeletonCard h="h-48" />
  const pct = data.compliance_pct || 0
  const color = pct >= 90 ? '#22C55E' : pct >= 75 ? '#F59E0B' : '#EF4444'
  const radialData = [{ name: 'SLA', value: pct, fill: color }, { name: 'bg', value: 100 - pct, fill: '#e2e8f0' }]
  return (
    <div className="flex flex-col items-center justify-center h-full py-4">
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart cx="50%" cy="80%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={radialData}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="text-center -mt-12">
        <p className="text-3xl font-bold" style={{ color }}>{pct}%</p>
        <p className="text-xs text-slate-500 mt-1">SLA Compliance</p>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4 w-full px-4 text-center">
        {data.by_priority?.map(p => (
          <div key={p.priority}>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.compliance}%</p>
            <p className="text-[10px] text-slate-400">P{p.priority}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Priority Heatmap ──────────────────────────────────────────────────────────
function PriorityHeatmap({ data = [] }) {
  const maxVal = Math.max(...data.flatMap(r => [r.p1, r.p2, r.p3, r.p4]), 1)
  const intensity = v => Math.round((v / maxVal) * 255)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 pr-3 text-slate-500 font-medium w-44">Group</th>
            {['P1 Critical','P2 High','P3 Medium','P4 Low'].map(l => (
              <th key={l} className="text-center py-2 px-3 text-slate-500 font-medium">{l}</th>
            ))}
            <th className="text-center py-2 px-3 text-slate-500 font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
              <td className="py-2 pr-3 text-slate-700 dark:text-slate-200 font-medium text-[11px] leading-tight">
                {row.group.replace('DPS-','').replace(' ','​')}
              </td>
              {[row.p1, row.p2, row.p3, row.p4].map((v, pi) => (
                <td key={pi} className="py-2 px-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-7 rounded text-xs font-bold"
                    style={{ background: `rgba(${pi === 0 ? '239,68,68' : pi === 1 ? '249,115,22' : pi === 2 ? '234,179,8' : '34,197,94'},${0.15 + (v / maxVal) * 0.65})`, color: `rgb(${pi === 0 ? '185,28,28' : pi === 1 ? '194,65,12' : pi === 2 ? '161,98,7' : '21,128,61'})` }}>
                    {v}
                  </span>
                </td>
              ))}
              <td className="py-2 px-3 text-center font-bold text-slate-700 dark:text-slate-200">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Incident Table ────────────────────────────────────────────────────────────
const BADGE_P = { 1: 'badge-p1', 2: 'badge-p2', 3: 'badge-p3', 4: 'badge-p4' }
const BADGE_S = { Open:'badge-open','In Progress':'badge-in-progress','On Hold':'badge-on-hold',Resolved:'badge-resolved',Closed:'badge-closed' }

function IncidentTable({ filters }) {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created')
  const [sortDir, setSortDir] = useState('desc')
  const [data, setData]     = useState({ data: [], total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(false)
  const [drilldown, setDrilldown] = useState(null)

  useEffect(() => { setPage(1) }, [filters, search])

  useEffect(() => {
    setLoading(true)
    const params = { ...buildParams(filters), page, limit: 25, search, sort_by: sortBy, sort_dir: sortDir }
    monApi.incidents(params).then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [page, search, sortBy, sortDir, filters])

  const toggleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const COLS = [
    { key: 'number',               label: 'Number',     sortable: true },
    { key: 'created',              label: 'Created',    sortable: true },
    { key: 'first_assignment_group',label: 'Group',     sortable: true },
    { key: 'category',             label: 'Category',   sortable: true },
    { key: 'priority',             label: 'Priority',   sortable: true },
    { key: 'state',                label: 'State',      sortable: true },
    { key: 'made_sla',             label: 'SLA',        sortable: false },
    { key: 'short_description',    label: 'Description',sortable: false },
    { key: 'mttr_hours',           label: 'MTTR(h)',    sortable: true },
  ]

  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <span className="card-title">Live Incident Register</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{data.total?.toLocaleString()} total</span>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:border-brand-500 focus:outline-none w-48"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
            <tr>
              {COLS.map(c => (
                <th key={c.key} onClick={() => c.sortable && toggleSort(c.key)}
                  className={clsx('text-left px-3 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap select-none',
                    c.sortable && 'cursor-pointer hover:text-brand-600')}>
                  <span className="flex items-center gap-1">
                    {c.label}
                    {c.sortable && <ArrowUpDown size={10} className={sortBy === c.key ? 'text-brand-500' : ''} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={clsx('divide-y divide-slate-100 dark:divide-slate-700/50', loading && 'opacity-50')}>
            {data.data.map((row, i) => (
              <tr key={i}
                onClick={() => setDrilldown(row)}
                className="hover:bg-brand-50 dark:hover:bg-brand-900/10 cursor-pointer transition-colors">
                <td className="px-3 py-2 font-mono text-brand-600 dark:text-brand-400 font-semibold">{row.number}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.created?.slice(0,16)}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{row.first_assignment_group?.replace('DPS-','')}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.category}</td>
                <td className="px-3 py-2"><span className={BADGE_P[row.priority]}>P{row.priority}</span></td>
                <td className="px-3 py-2"><span className={BADGE_S[row.state] || 'badge'}>{row.state}</span></td>
                <td className="px-3 py-2">
                  <span className={row.made_sla_bool ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {row.made_sla_bool ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">{row.short_description}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  {row.mttr_hours ? `${Number(row.mttr_hours).toFixed(1)}h` : '—'}
                </td>
              </tr>
            ))}
            {!loading && !data.data.length && (
              <tr><td colSpan={9}><EmptyState /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
        <span className="text-xs text-slate-500">
          Page {data.total_pages ? page : 0} of {data.total_pages}
        </span>
        <div className="flex gap-1">
          <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
            className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
          {Array.from({ length: Math.min(5, data.total_pages || 1) }, (_, i) => {
            const pg = Math.max(1, page - 2) + i
            if (pg > (data.total_pages || 1)) return null
            return (
              <button key={pg} onClick={() => setPage(pg)}
                className={clsx('btn text-xs w-7 h-7 justify-center', pg === page ? 'btn-primary' : 'btn-ghost')}>
                {pg}
              </button>
            )
          })}
          <button disabled={page >= (data.total_pages || 1)} onClick={() => setPage(p => p+1)}
            className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Drilldown detail modal */}
      {drilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="font-mono text-brand-600 dark:text-brand-400 font-bold">{drilldown.number}</span>
                <span className={BADGE_P[drilldown.priority]}>P{drilldown.priority}</span>
                <span className={BADGE_S[drilldown.state] || 'badge'}>{drilldown.state}</span>
              </div>
              <button onClick={() => setDrilldown(null)} className="btn-ghost p-1.5 text-slate-400">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{drilldown.short_description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                {[
                  ['Group', drilldown.first_assignment_group],
                  ['Category', drilldown.category],
                  ['Assigned To', drilldown.assigned_to],
                  ['Created', drilldown.created?.slice(0,16)],
                  ['Resolved', drilldown.resolved?.slice(0,16) || '—'],
                  ['MTTR', drilldown.mttr_hours ? `${Number(drilldown.mttr_hours).toFixed(1)} hrs` : '—'],
                  ['SLA', drilldown.made_sla_bool ? '✓ Met' : '✗ Breached'],
                  ['Reassignments', drilldown.reassignment_count],
                  ['Reopen Count', drilldown.reopen_count],
                  ['Resolution Code', drilldown.resolution_code || '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-slate-400 font-medium">{k}</p>
                    <p className="text-slate-700 dark:text-slate-200 font-semibold">{v}</p>
                  </div>
                ))}
              </div>
              {drilldown.resolution_notes && (
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">Resolution Notes</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 leading-relaxed">
                    {drilldown.resolution_notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
function ActivityFeed() {
  const [items, setItems] = useState([])
  useEffect(() => {
    monApi.lastUpdated({ limit: 10 }).then(r => setItems(r.data)).catch(console.error)
  }, [])
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
          <div className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0',
            item.state === 'Resolved' ? 'bg-green-500' : item.state === 'Open' ? 'bg-blue-500' :
            item.state === 'On Hold' ? 'bg-amber-500' : 'bg-purple-500')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 font-mono shrink-0">{item.number}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{item.updated?.slice(0,16)}</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{item.short_description}</p>
            <p className="text-[10px] text-slate-400">{item.first_assignment_group?.replace('DPS-','')} · {item.updated_by}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function MonitoringDashboard() {
  const [filters, setFilters] = useState({ dateFrom:'',dateTo:'',groups:[],priorities:[],categories:[],states:[],sla:'' })
  const [opts, setOpts]       = useState({})
  const [kpis, setKpis]       = useState(null)
  const [byGroup, setByGroup] = useState([])
  const [byCat, setByCat]     = useState([])
  const [slaData, setSlaData] = useState(null)
  const [heatmap, setHeatmap] = useState([])
  const [reopen, setReopen]   = useState(null)
  const [monInsights, setMonInsights] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load filter options once
  useEffect(() => {
    monApi.filters().then(r => setOpts(r.data)).catch(console.error)
  }, [])

  const loadAll = useCallback(() => {
    setLoading(true)
    const p = buildParams(filters)
    Promise.all([
      monApi.kpis(p),
      monApi.byGroup(p),
      monApi.byCategory(p),
      monApi.slaKpi(p),
      monApi.priorityHeatmap(p),
      monApi.reopenTracker(p),
      insApi.monitoring(p),
    ]).then(([k, g, c, s, h, r, ins]) => {
      setKpis(k.data); setByGroup(g.data); setByCat(c.data)
      setSlaData(s.data); setHeatmap(h.data); setReopen(r.data)
      setMonInsights(ins.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M1 — Real-Time Monitoring Dashboard"
        subtitle="Live incident KPIs · SLA tracking · Queue health"
        onRefresh={() => setRefreshKey(k => k+1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Filters */}
        <FilterBar filters={filters} onChange={setFilters} options={opts} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard title="Active Incidents"  value={kpis?.total_active}      icon={Activity}      color="blue"   loading={loading} sub="Open + In Progress + On Hold" />
          <KPICard title="Critical (P1)"     value={kpis?.critical_p1}       icon={AlertTriangle} color="red"    loading={loading} sub="Requires immediate action" trendDir={kpis?.critical_p1 > 5 ? 'up' : 'neutral'} trend={kpis?.critical_p1 > 5 ? 'Above threshold' : 'Within limit'} />
          <KPICard title="High (P2)"         value={kpis?.high_p2}           icon={TrendingDown}  color="amber"  loading={loading} />
          <KPICard title="SLA Compliance"    value={kpis?.sla_compliance_pct}unit="%"  icon={CheckCircle2} color="green" loading={loading} trendDir={kpis?.sla_compliance_pct >= 90 ? 'down' : 'up'} trend={kpis?.sla_compliance_pct >= 90 ? 'On target' : 'Below 90% target'} />
          <KPICard title="Avg MTTR"          value={kpis?.avg_mttr_hours}    unit="h"  icon={Clock}       color="purple" loading={loading} sub="Resolved incidents" />
          <KPICard title="SLA Breaches"      value={kpis?.sla_breaches}      icon={AlertTriangle} color="red"    loading={loading} trendDir={kpis?.sla_breaches > 50 ? 'up' : 'neutral'} />
        </div>

        {/* Row 2: Group + Category */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Incident by Group */}
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <span className="card-title">Incident Volume by Assignment Group</span>
              <span className="text-xs text-slate-400">Click bar to drill down</span>
            </div>
            <div className="p-4" style={{ height: 280 }}>
              {loading ? <SkeletonCard h="h-full" /> : byGroup.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byGroup} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="group" tick={{ fontSize: 10 }} tickFormatter={v => v.replace('DPS-','').slice(0,14)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.entries(STATE_COLORS).map(([s, c]) => (
                      <Bar key={s} dataKey={s} stackId="a" fill={c} name={s} radius={s === 'Closed' ? [3,3,0,0] : [0,0,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </div>
          </div>

          {/* Category Donut */}
          <div className="card">
            <div className="card-header"><span className="card-title">By Category</span></div>
            <div className="p-4 flex flex-col" style={{ height: 280 }}>
              {loading ? <SkeletonCard h="h-full" /> : byCat.length ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={byCat} dataKey="count" nameKey="category" cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} incidents`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-1 gap-1 mt-2">
                    {byCat.slice(0,5).map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{d.category}</span>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">{d.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <EmptyState />}
            </div>
          </div>
        </div>

        {/* Row 3: SLA Gauge + Priority Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="card" style={{ minHeight: 280 }}>
            <div className="card-header"><span className="card-title">SLA KPI Gauge</span></div>
            <SLAGauge data={slaData} />
          </div>

          <div className="lg:col-span-2 card">
            <div className="card-header">
              <span className="card-title">Priority Distribution Heat Map</span>
              <span className="text-xs text-slate-400">Intensity = ticket count</span>
            </div>
            <div className="p-4">
              {loading ? <SkeletonCard h="h-32" /> : <PriorityHeatmap data={heatmap} />}
            </div>
          </div>
        </div>

        {/* Row 4: Reopen + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <span className="card-title">Reopen Tracker</span>
              {reopen && <span className="text-xs text-slate-500">{reopen.total_reopened} tickets reopened</span>}
            </div>
            <div className="p-4" style={{ height: 220 }}>
              {reopen?.monthly_trend?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reopen.monthly_trend} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="reopen_count" name="Reopen Events" fill="#F97316" radius={[3,3,0,0]} />
                    <Bar dataKey="incident_count" name="Tickets Reopened" fill="#FED7AA" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Last Updated</span></div>
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 220 }}>
              <ActivityFeed />
            </div>
          </div>
        </div>

        {/* Row 5: Insights */}
        {monInsights.length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">AI Insights</span><span className="text-xs text-slate-400">Data-backed analysis</span></div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {monInsights.map(ins => <InsightCard key={ins.id} insight={ins} />)}
            </div>
          </div>
        )}

        {/* Row 6: Incident Table */}
        <IncidentTable filters={filters} />
      </div>
    </div>
  )
}
