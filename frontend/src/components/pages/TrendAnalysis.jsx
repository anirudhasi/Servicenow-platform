import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ZAxis, Cell
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { trends as trendApi, insights as insApi, monitoring as monApi, buildParams } from '../../services/api'
import Header from '../layout/Header'
import { InsightCard, FilterBar, DrilldownModal, SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'
import clsx from 'clsx'

// ── Colour maps ───────────────────────────────────────────────────────────────
const PALETTE = ['#2563EB','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444','#EC4899','#14B8A6','#F97316','#EAB308']
const GROUP_COLORS = {
  'DPS-McLean WEB':         '#2563EB',
  'DPS-Global Service Desk':'#0EA5E9',
  'DPS-Materials WFR':      '#10B981',
  'DPS-Network Operations': '#F59E0B',
  'DPS-Security Team':      '#8B5CF6',
  'DPS-Infrastructure':     '#EF4444',
  'DPS-WEB-L2':             '#2563EB',
  'Global Service Desk':    '#0EA5E9',
  'Global-Traceability-L2': '#10B981',
  'PACS-L2':                '#F59E0B',
  'CG-DPS-Automation-L2':   '#8B5CF6',
}
const groupColor = (name, idx) => GROUP_COLORS[name] || PALETTE[idx % PALETTE.length]
const CAT_COLORS = {
  'Application Access':'#2563EB','Application Error':'#0EA5E9','Hardware':'#10B981',
  'Network':'#EF4444','Software & Tools':'#F59E0B','Software':'#F59E0B','Email':'#8B5CF6',
  'User Account':'#EC4899','Infrastructure':'#14B8A6','Data & Reporting':'#F97316',
  'Change Request':'#EAB308','Service Request':'#6366F1','Security':'#EF4444','General':'#94A3B8',
}
const catColor = (name, idx) => CAT_COLORS[name] || PALETTE[idx % PALETTE.length]
const PRIORITY_COLORS = { P1:'#EF4444', P2:'#F97316', P3:'#EAB308', P4:'#22C55E' }
const DOW_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

// ── Heatmap renderer ──────────────────────────────────────────────────────────
function ResolutionHeatmap({ data }) {
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const hours  = Array.from({ length: 24 }, (_, i) => i)
  const byDow  = {}
  DOW_ORDER.forEach(d => { byDow[d] = {} })
  data.forEach(d => { if (byDow[d.dow]) byDow[d.dow][d.hour] = d.count })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex ml-20 mb-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-[9px] text-slate-400">{h % 4 === 0 ? `${h}h` : ''}</div>
          ))}
        </div>
        {DOW_ORDER.map(day => (
          <div key={day} className="flex items-center mb-0.5">
            <div className="w-20 text-[10px] text-slate-500 dark:text-slate-400 text-right pr-2 shrink-0">{day.slice(0,3)}</div>
            {hours.map(h => {
              const v = byDow[day]?.[h] || 0
              const opacity = 0.05 + (v / maxVal) * 0.9
              return (
                <div key={h} className="flex-1 mx-px rounded-sm" style={{ height: 18, background: `rgba(37,99,235,${opacity})` }}
                  title={`${day} ${h}:00 — ${v} incidents`} />
              )
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400 ml-20">
          <span>Low</span>
          <div className="flex gap-0.5">
            {[0.05,0.2,0.4,0.6,0.8,0.95].map((o,i) => (
              <div key={i} className="w-4 h-3 rounded-sm" style={{ background: `rgba(37,99,235,${o})` }} />
            ))}
          </div>
          <span>High</span>
        </div>
      </div>
    </div>
  )
}

// ── Root Cause Treemap (manual implementation) ────────────────────────────────
function RootCauseBars({ data }) {
  const [selected, setSelected] = useState(null)
  const shown = selected ? data.find(d => d.name === selected) : null

  return (
    <div className="space-y-3">
      {!selected ? (
        data.map((cat, i) => (
          <div key={cat.name} className="cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setSelected(cat.name)}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cat.name}</span>
              <span className="text-xs text-slate-500">{cat.total} tickets</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-5 overflow-hidden">
              <div className="h-full rounded-full flex items-center pl-2"
                style={{ width: `${(cat.total / (data[0]?.total || 1)) * 100}%`, background: catColor(cat.name, i) }}>
                <span className="text-[10px] text-white font-semibold">{cat.total}</span>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div>
          <button onClick={() => setSelected(null)} className="text-xs text-brand-600 hover:underline mb-3 flex items-center gap-1">← Back to all categories</button>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{shown?.name} — Sub-categories</p>
          {shown?.children?.map((sub, i) => (
            <div key={sub.name} className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-600 dark:text-slate-300">{sub.name}</span>
                <span className="text-xs text-slate-500">{sub.count}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${(sub.count / (shown.children[0]?.count || 1)) * 100}%`,
                  background: catColor(sub.name, i)
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Forecast Chart ────────────────────────────────────────────────────────────
function ForecastChart({ data }) {
  if (!data) return <SkeletonCard h="h-full" />
  const combined = [
    ...data.historical.map(d => ({ ...d, actual: d.count })),
    ...data.forecast.map(d => ({ ...d })),
  ]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={combined} margin={{ left: -20, right: 10 }}>
        <defs>
          <linearGradient id="grad_actual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="grad_forecast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine
          x={data.historical?.[data.historical.length - 1]?.period}
          stroke="#94A3B8" strokeDasharray="4 4"
          label={{ value: 'Today', fontSize: 10, fill: '#64748B', position: 'top' }}
        />
        <Area type="monotone" dataKey="actual" name="Actual" fill="url(#grad_actual)" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
        <Area type="monotone" dataKey="forecast" name="Forecast" fill="url(#grad_forecast)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#F59E0B' }} />
        <Area type="monotone" dataKey="ci_upper" name="Upper CI" stroke="none" fill="none" strokeDasharray="2 2" />
        <Area type="monotone" dataKey="ci_lower" name="Lower CI" stroke="none" fill="rgba(245,158,11,0.08)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Chart card wrapper ────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, height = 300, insight }) {
  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <div>
          <span className="card-title">{title}</span>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4 flex-1" style={{ height }}>
        {children}
      </div>
      {insight && (
        <div className="px-4 pb-4">
          <InsightCard insight={insight} />
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrendAnalysis() {
  const [filters, setFilters] = useState({
    dateFrom:'', dateTo:'', groups:[], priorities:[], categories:[], states:[], sla:'', granularity:'month'
  })
  const [opts, setOpts]         = useState({})
  const [volume, setVolume]     = useState([])
  const [mttr, setMttr]         = useState([])
  const [catDist, setCatDist]   = useState([])
  const [slaTrend, setSlaTrend] = useState([])
  const [prioTrend, setPrioTrend] = useState([])
  const [heatmap, setHeatmap]   = useState([])
  const [reass, setReass]       = useState({ by_group:[], scatter_data:[] })
  const [forecast, setForecast] = useState(null)
  const [rootCause, setRootCause] = useState([])
  const [trendInsights, setTrendInsights] = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    monApi.filters().then(r => setOpts(r.data)).catch(console.error)
  }, [])

  const loadAll = useCallback(() => {
    setLoading(true)
    const p = buildParams(filters)
    Promise.all([
      trendApi.volume(p),
      trendApi.mttr(p),
      trendApi.categoryDist(p),
      trendApi.slaCompliance(p),
      trendApi.priorityTrend(p),
      trendApi.resolutionHeatmap(p),
      trendApi.reassignment(p),
      trendApi.forecast({ ...p, periods: 6 }),
      trendApi.rootCause(p),
      insApi.trends(p),
    ]).then(([v, m, c, s, pr, h, ra, f, rc, ins]) => {
      setVolume(v.data); setMttr(m.data); setCatDist(c.data); setSlaTrend(s.data)
      setPrioTrend(pr.data); setHeatmap(h.data); setReass(ra.data); setForecast(f.data)
      setRootCause(rc.data); setTrendInsights(ins.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  // Build per-chart insight lookup
  const insightByChart = trendInsights.reduce((acc, ins) => { acc[ins.chart] = ins; return acc }, {})

  // Derive group keys from volume data
  const groupKeys = volume.length
    ? Object.keys(volume[0]).filter(k => k !== 'period' && k !== 'total')
    : []
  const catKeys = catDist.length
    ? Object.keys(catDist[0]).filter(k => k !== 'period')
    : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M2 — Trend Analysis Engine"
        subtitle="6-month / 1-year patterns · MTTR trends · Forecasting"
        onRefresh={() => setRefreshKey(k => k+1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Filters */}
        <FilterBar filters={filters} onChange={setFilters} options={opts} showGranularity />

        {/* Row 1: Volume + SLA Compliance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Incident Volume Over Time" subtitle="Stacked by assignment group" height={280}
            insight={insightByChart['volume']}>
            {loading ? <SkeletonCard h="h-full" /> : volume.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volume} margin={{ left: -20, right: 5 }}>
                  <defs>
                    {groupKeys.map((g, i) => (
                      <linearGradient key={g} id={`gv${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={groupColor(g, i)} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={groupColor(g, i)} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {groupKeys.map((g, i) => (
                    <Area key={g} type="monotone" dataKey={g} name={g.replace('DPS-','')}
                      stackId="1" fill={`url(#gv${i})`} stroke={groupColor(g, i)} strokeWidth={1.5} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>

          <ChartCard title="SLA Compliance Trend" subtitle="% met · absolute breach count" height={280}
            insight={insightByChart['sla_compliance']}>
            {loading ? <SkeletonCard h="h-full" /> : slaTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slaTrend} margin={{ left: -20, right: 5 }}>
                  <defs>
                    <linearGradient id="gSlaMet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gSlaBreach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip formatter={(v, n) => n === 'Compliance %' ? `${v}%` : v} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="right" y={90} stroke="#22C55E" strokeDasharray="4 4" label={{ value: '90% target', fontSize: 9, fill: '#22C55E' }} />
                  <Area yAxisId="left" type="monotone" dataKey="met" name="SLA Met" fill="url(#gSlaMet)" stroke="#22C55E" strokeWidth={2} />
                  <Area yAxisId="left" type="monotone" dataKey="breached" name="Breached" fill="url(#gSlaBreach)" stroke="#EF4444" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="compliance_pct" name="Compliance %" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        </div>

        {/* Row 2: MTTR + Priority Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="MTTR Trends by Group" subtitle="Mean time to resolve (hours)" height={280}
            insight={insightByChart['mttr']}>
            {loading ? <SkeletonCard h="h-full" /> : mttr.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mttr} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${Number(v).toFixed(1)}h`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {Object.keys(mttr[0] || {}).filter(g => g !== 'period' && g !== 'overall_avg').map((g, i) => (
                    <Line key={g} type="monotone" dataKey={g} name={g.replace('DPS-','')}
                      stroke={groupColor(g, i)} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                  {mttr[0]?.overall_avg !== undefined && (
                    <Line type="monotone" dataKey="overall_avg" name="Overall Avg"
                      stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>

          <ChartCard title="Priority Trend" subtitle="Incident count by priority over time" height={280}
            insight={insightByChart['volume']}>
            {loading ? <SkeletonCard h="h-full" /> : prioTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prioTrend} margin={{ left: -20, right: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {['P1','P2','P3','P4'].map(p => (
                    <Bar key={p} dataKey={p} name={p} stackId="a" fill={PRIORITY_COLORS[p]}
                      radius={p === 'P4' ? [3,3,0,0] : [0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        </div>

        {/* Row 3: Category Distribution */}
        <ChartCard title="Issue Category Distribution Over Time"
          subtitle="Stacked volume per category — hover for drilldown values" height={300}
          insight={insightByChart['category_distribution']}>
          {loading ? <SkeletonCard h="h-full" /> : catDist.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catDist} margin={{ left: -20, right: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {catKeys.map((c, i) => (
                  <Bar key={c} dataKey={c} name={c} stackId="a" fill={catColor(c, i)}
                    radius={i === catKeys.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        {/* Row 4: Forecast + Root Cause */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Volume Forecast" subtitle="Linear regression + seasonal adjustment · 6-period ahead" height={300}
            insight={insightByChart['forecast']}>
            {loading ? <SkeletonCard h="h-full" /> : forecast ? <ForecastChart data={forecast} /> : <EmptyState />}
          </ChartCard>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Root Cause Analysis</span>
              <span className="text-xs text-slate-400">Click category to drill into sub-causes</span>
            </div>
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 360 }}>
              {rootCause.length ? <RootCauseBars data={rootCause} /> : <EmptyState />}
            </div>
          </div>
        </div>

        {/* Row 5: Resolution Heatmap */}
        <ChartCard title="Incident Creation Heat Map"
          subtitle="Day-of-week × hour-of-day intensity — identify peak load windows" height="auto">
          <div style={{ minHeight: 200 }}>
            {heatmap.length ? <ResolutionHeatmap data={heatmap} /> : <EmptyState />}
          </div>
        </ChartCard>

        {/* Row 6: Reassignment Scatter */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Reassignment Rate by Group"
            subtitle="Average reassignments per incident" height={280}>
            {loading ? <SkeletonCard h="h-full" /> : reass.by_group?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reass.by_group} layout="vertical" margin={{ left: 100, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="group" type="category" tick={{ fontSize: 10 }} tickFormatter={v => v.replace('DPS-','')} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg_reassignments" name="Avg Reassignments" fill="#8B5CF6" radius={[0,3,3,0]}>
                    {reass.by_group?.map((r, i) => (
                      <Cell key={i} fill={r.avg_reassignments > 1 ? '#EF4444' : r.avg_reassignments > 0.5 ? '#F59E0B' : '#22C55E'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>

          <ChartCard title="MTTR vs Reassignment Correlation"
            subtitle="Each bubble = 1 incident · size = reassignment count" height={280}>
            {loading ? <SkeletonCard h="h-full" /> : reass.scatter_data?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="reassignment_count" name="Reassignments" type="number" tick={{ fontSize: 10 }} label={{ value: 'Reassignments', fontSize: 10, position: 'insideBottom', offset: -5 }} />
                  <YAxis dataKey="mttr_hours" name="MTTR (h)" type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                  <ZAxis range={[20, 120]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl p-3 text-xs">
                          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{d?.number}</p>
                          <p className="text-slate-500">MTTR: {Number(d?.mttr_hours).toFixed(1)}h</p>
                          <p className="text-slate-500">Reassigned: {d?.reassignment_count}x</p>
                          <p className="text-slate-500">Priority: P{d?.priority}</p>
                        </div>
                      )
                    }}
                  />
                  {[1,2,3,4].map(p => (
                    <Scatter key={p} name={`P${p}`}
                      data={reass.scatter_data?.filter(d => d.priority === p)}
                      fill={{ 1:'#EF4444',2:'#F97316',3:'#EAB308',4:'#22C55E' }[p]} fillOpacity={0.7} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        </div>

        {/* Row 7: Consolidated Insights */}
        {trendInsights.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Trend Insights Summary</span>
              <span className="text-xs text-slate-400">Auto-generated from data patterns</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {trendInsights.map(ins => <InsightCard key={ins.id} insight={ins} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
