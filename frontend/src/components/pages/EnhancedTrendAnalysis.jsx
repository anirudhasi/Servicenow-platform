import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ZAxis, Cell, ComposedChart,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { trends as trendApi, insights as insApi, monitoring as monApi, buildParams } from '../../services/api'
import Header from '../layout/Header'
import DateFilter from '../common/DateFilter'
import { TowerFilter, SDMFilter } from '../common/TowerSDMFilter.jsx'
import { InsightCard, FilterBar, SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'

// ── Colour maps ───────────────────────────────────────────────────────────────
const PALETTE = ['#2563EB','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444','#EC4899','#14B8A6','#F97316','#EAB308']
const groupColor = (name, idx) => PALETTE[idx % PALETTE.length]
const CAT_COLORS = {
  'Application Access':'#2563EB','Application Error':'#0EA5E9','Hardware':'#10B981',
  'Network':'#EF4444','Software & Tools':'#F59E0B','Software':'#F59E0B','Email':'#8B5CF6',
  'User Account':'#EC4899','Infrastructure':'#14B8A6','Data & Reporting':'#F97316',
  'Change Request':'#EAB308','Service Request':'#6366F1','Security':'#EF4444','General':'#94A3B8',
}
const catColor = (name, idx) => CAT_COLORS[name] || PALETTE[idx % PALETTE.length]
const PRIORITY_COLORS = { P1:'#EF4444', P2:'#F97316', P3:'#EAB308', P4:'#22C55E' }
const DOW_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const COLORS = ['#2563EB','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444','#EC4899','#14B8A6','#F97316','#EAB308']

// ── Smart grouping: top N + Others (for flat lists) ───────────────────────────
function smartGroupData(data, key, limit = 10) {
  if (!data || data.length === 0) return data
  const sorted = [...data].sort((a, b) => (b[key] || 0) - (a[key] || 0))
  if (sorted.length <= limit) return sorted
  const top = sorted.slice(0, limit)
  const others = sorted.slice(limit)
  const othersSum = others.reduce((sum, item) => sum + (item[key] || 0), 0)
  return [...top, { name: 'Others', [key]: othersSum, isOthers: true, count: others.length }]
}

// ── Smart grouping for time-series data (groups as columns) ───────────────────
// Input:  [{period:'2025-11', 'GroupA': 10, 'GroupB': 5, ...}, ...]
// Output: same shape but with only top-N groups + 'Others' column
function smartGroupSeries(data, limit = 10) {
  if (!data || data.length === 0) return { data: [], keys: [] }
  const groupKeys = Object.keys(data[0]).filter(k => k !== 'period' && k !== 'total' && k !== 'overall_avg')
  if (groupKeys.length <= limit) return { data, keys: groupKeys }

  // Rank groups by total across all periods
  const totals = {}
  groupKeys.forEach(g => { totals[g] = data.reduce((s, row) => s + (row[g] || 0), 0) })
  const sorted = [...groupKeys].sort((a, b) => totals[b] - totals[a])
  const top = sorted.slice(0, limit)
  const rest = sorted.slice(limit)

  // Rebuild rows with top groups + Others
  const newData = data.map(row => {
    const out = { period: row.period }
    top.forEach(g => { out[g] = row[g] || 0 })
    out['Others'] = rest.reduce((s, g) => s + (row[g] || 0), 0)
    return out
  })
  return { data: newData, keys: [...top, 'Others'] }
}

// ── Resolution heatmap ────────────────────────────────────────────────────────
function ResolutionHeatmap({ data }) {
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const hours  = Array.from({ length: 24 }, (_, i) => i)
  const byDow  = {}
  DOW_ORDER.forEach(d => { byDow[d] = {} })
  data.forEach(d => { if (byDow[d.dow]) byDow[d.dow][d.hour] = d.count })
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
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

// ── Root Cause bars ───────────────────────────────────────────────────────────
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
          <button onClick={() => setSelected(null)} className="text-xs text-brand-600 hover:underline mb-3">← Back to all categories</button>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{shown?.name} — Sub-categories</p>
          {shown?.children?.map((sub, i) => (
            <div key={sub.name} className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-600 dark:text-slate-300">{sub.name}</span>
                <span className="text-xs text-slate-500">{sub.count}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(sub.count / (shown.children[0]?.count || 1)) * 100}%`, background: catColor(sub.name, i) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Forecast chart ────────────────────────────────────────────────────────────
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
        <ReferenceLine x={data.historical?.[data.historical.length - 1]?.period}
          stroke="#94A3B8" strokeDasharray="4 4"
          label={{ value: 'Today', fontSize: 10, fill: '#64748B', position: 'top' }} />
        <Area type="monotone" dataKey="actual" name="Actual" fill="url(#grad_actual)" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
        <Area type="monotone" dataKey="forecast" name="Forecast" fill="url(#grad_forecast)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#F59E0B' }} />
        <Area type="monotone" dataKey="ci_upper" name="Upper CI" stroke="none" fill="none" />
        <Area type="monotone" dataKey="ci_lower" name="Lower CI" stroke="none" fill="rgba(245,158,11,0.08)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Chart card wrapper ────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, height = 300, insight, error }) {
  const containerStyle = typeof height === 'number' ? { height: `${height}px` } : {}
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <span className="card-title">{title}</span>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {error && <span className="text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">error</span>}
      </div>
      <div className="p-4" style={containerStyle}>
        {error
          ? <div className="h-full flex items-center justify-center text-xs text-red-500">{error}</div>
          : children}
      </div>
      {insight && !error && (
        <div className="px-4 pb-4"><InsightCard insight={insight} /></div>
      )}
    </div>
  )
}

// ── Volume by Group (smart grouped) ──────────────────────────────────────────
function VolumeByGroup({ data, loading }) {
  if (loading) return <SkeletonCard h="h-72" />
  if (!data || data.length === 0) return <EmptyState />
  const groupCounts = {}
  data.forEach(inc => {
    const g = inc.assignment_group || 'Unknown'
    groupCounts[g] = (groupCounts[g] || 0) + 1
  })
  const chartData = smartGroupData(
    Object.entries(groupCounts).map(([name, count]) => ({ name, count })),
    'count', 10
  )
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ left: -20, right: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" name="Incidents" radius={[3,3,0,0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.isOthers ? '#94A3B8' : COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── MTTR by Group (smart grouped) ────────────────────────────────────────────
function MTTRByGroup({ data, loading }) {
  if (loading) return <SkeletonCard h="h-72" />
  if (!data || data.length === 0) return <EmptyState />
  const groupStats = {}
  data.forEach(inc => {
    const mttr = inc.mttr_hours
    if (mttr === null || mttr === undefined || mttr < 0) return
    const g = inc.assignment_group || 'Unknown'
    if (!groupStats[g]) groupStats[g] = { total: 0, count: 0 }
    groupStats[g].total += mttr
    groupStats[g].count += 1
  })
  const chartData = smartGroupData(
    Object.entries(groupStats)
      .filter(([, s]) => s.count >= 2)
      .map(([name, s]) => ({ name, mttr: parseFloat((s.total / s.count).toFixed(1)), count: s.count })),
    'mttr', 10
  )
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ left: 0, right: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
        <ReferenceLine y={4}  stroke="#22C55E" strokeDasharray="4 4" label={{ value:'P1 4h', fontSize:9, fill:'#22C55E', position:'right' }} />
        <ReferenceLine y={8}  stroke="#F97316" strokeDasharray="4 4" label={{ value:'P2 8h', fontSize:9, fill:'#F97316', position:'right' }} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null
          const d = payload[0].payload
          return (
            <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-xs">
              <p className="font-bold">{d.name}</p>
              <p>MTTR: {d.mttr}h</p>
              <p className="text-slate-500">Incidents: {d.count}</p>
            </div>
          )
        }} />
        <Bar dataKey="mttr" name="Avg MTTR (h)" radius={[3,3,0,0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.mttr > 8 ? '#EF4444' : entry.mttr > 4 ? '#F97316' : '#22C55E'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EnhancedTrendAnalysis() {
  const [filters, setFilters] = useState({
    dateFrom:'', dateTo:'', towers:[], sdms:[], groups:[], priorities:[], categories:[], states:[], sla:'', granularity:'month'
  })
  const [opts, setOpts]           = useState({})
  const [volume, setVolume]       = useState([])
  const [mttr, setMttr]           = useState([])
  const [catDist, setCatDist]     = useState([])
  const [slaTrend, setSlaTrend]   = useState([])
  const [prioTrend, setPrioTrend] = useState([])
  const [heatmap, setHeatmap]     = useState([])
  const [reass, setReass]         = useState({ by_group:[], scatter_data:[] })
  const [forecast, setForecast]   = useState(null)
  const [rootCause, setRootCause] = useState([])
  const [trendInsights, setTrendInsights] = useState([])
  const [chartErrors, setChartErrors]     = useState({})
  const [allIncidents, setAllIncidents]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    monApi.filters().then(r => setOpts(r.data)).catch(console.error)
  }, [])

  const loadAll = useCallback(() => {
    setLoading(true)
    setChartErrors({})
    const p = buildParams(filters)

    // Load trend charts from API
    Promise.allSettled([
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
      monApi.incidents({ ...p, page: 1, limit: 5000 }),
    ]).then(results => {
      const errs = {}
      const names = ['volume','mttr','catDist','slaTrend','prioTrend','heatmap','reass','forecast','rootCause','insights','incidents']
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const d = r.value.data
          if (i === 0) setVolume(d)
          else if (i === 1) setMttr(d)
          else if (i === 2) setCatDist(d)
          else if (i === 3) setSlaTrend(d)
          else if (i === 4) setPrioTrend(d)
          else if (i === 5) setHeatmap(d)
          else if (i === 6) setReass(d || { by_group:[], scatter_data:[] })
          else if (i === 7) setForecast(d)
          else if (i === 8) setRootCause(d)
          else if (i === 9) setTrendInsights(d)
          else if (i === 10) setAllIncidents(d?.data || [])
        } else {
          errs[names[i]] = r.reason?.response?.data?.detail || r.reason?.message || 'Failed to load'
        }
      })
      setChartErrors(errs)
    }).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  const insightByChart = trendInsights.reduce((acc, ins) => { acc[ins.chart] = ins; return acc }, {})
  const catKeys   = catDist.length ? Object.keys(catDist[0]).filter(k => k !== 'period') : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M2 — Trend Analysis"
        subtitle="Volume trends · MTTR · SLA compliance · Forecasting · Dynamic grouping"
        onRefresh={() => setRefreshKey(k => k+1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Unified Filter Panel */}
        <div className="card p-4 bg-slate-50 dark:bg-slate-900/30 border-l-4 border-brand-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Date Range</p>
              <DateFilter
                onDateChange={(range) => setFilters(f => ({ ...f, dateFrom: range.from, dateTo: range.to }))}
                disabled={loading}
              />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Organisation</p>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-40">
                  <TowerFilter towers={opts.towers || []} value={filters.towers}
                    onChange={(v) => setFilters(f => ({ ...f, towers: v }))} disabled={loading} />
                </div>
                <div className="flex-1 min-w-40">
                  <SDMFilter sdms={opts.sdms || []} value={filters.sdms}
                    onChange={(v) => setFilters(f => ({ ...f, sdms: v }))} disabled={loading} />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <FilterBar filters={filters} onChange={setFilters} options={opts} showGranularity />
          </div>
        </div>

        {/* Row 1: Volume + SLA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Incident Volume Over Time"
            subtitle={volume.length ? (() => { const k = Object.keys(volume[0]).filter(k => k !== 'period' && k !== 'total'); return k.length > 10 ? `Top 10 groups + Others (${k.length} total)` : `${k.length} groups` })() : 'Stacked by assignment group'}
            height={280} insight={insightByChart['volume']} error={chartErrors.volume}>
            {loading ? <SkeletonCard h="h-full" /> : volume.length ? (() => {
              const { data: vData, keys: vKeys } = smartGroupSeries(volume, 10)
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vData} margin={{ left: -20, right: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {vKeys.map((g, i) => (
                      <Bar key={g} dataKey={g} name={g} stackId="stack"
                        fill={g === 'Others' ? '#94A3B8' : groupColor(g, i)}
                        radius={i === vKeys.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )
            })() : <EmptyState />}
          </ChartCard>

          <ChartCard title="SLA Compliance Trend" subtitle="% met · breach count" height={280}
            insight={insightByChart['sla_compliance']} error={chartErrors.slaTrend}>
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
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="right" y={90} stroke="#22C55E" strokeDasharray="4 4"
                    label={{ value:'90% target', fontSize:9, fill:'#22C55E' }} />
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
          <ChartCard title="MTTR Trends by Group"
            subtitle={mttr.length ? (() => { const k = Object.keys(mttr[0]).filter(g => g !== 'period' && g !== 'overall_avg'); return k.length > 10 ? `Top 10 groups + Others (${k.length} total)` : `${k.length} groups` })() : 'Mean time to resolve (hours)'}
            height={280} insight={insightByChart['mttr']} error={chartErrors.mttr}>
            {loading ? <SkeletonCard h="h-full" /> : mttr.length ? (() => {
              const mttrWithoutOverall = mttr.map(row => {
                const { overall_avg, ...rest } = row
                return rest
              })
              const { data: mData, keys: mKeys } = smartGroupSeries(mttrWithoutOverall, 10)
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mData} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${Number(v).toFixed(1)}h`} />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {mKeys.map((g, i) => (
                      <Line key={g} type="monotone" dataKey={g} name={g}
                        stroke={g === 'Others' ? '#94A3B8' : groupColor(g, i)}
                        strokeWidth={g === 'Others' ? 1.5 : 2}
                        strokeDasharray={g === 'Others' ? '4 2' : undefined}
                        dot={{ r: 2 }} connectNulls />
                    ))}
                    {mttr[0]?.overall_avg !== undefined && (
                      <Line type="monotone" dataKey="overall_avg" name="Overall Avg"
                        stroke="#475569" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )
            })() : <EmptyState />}
          </ChartCard>

          <ChartCard title="Priority Trend" subtitle="Incident count by priority over time" height={280}
            error={chartErrors.prioTrend}>
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
        <ChartCard title="Issue Category Distribution Over Time" subtitle="Stacked volume per category" height={300}
          insight={insightByChart['category_distribution']} error={chartErrors.catDist}>
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

        {/* Row 4: Incident Volume by Group + MTTR by Group (smart grouped, top 10 + Others) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard
            title="Incident Volume by Assignment Group"
            subtitle={allIncidents.length > 0 ? `${Object.keys(allIncidents.reduce((a,i) => ({...a,[i.assignment_group]:1}), {})).length} groups → top 10 + Others` : ''}
            height={320}>
            <VolumeByGroup data={allIncidents} loading={loading} />
          </ChartCard>

          <ChartCard
            title="Avg MTTR by Assignment Group"
            subtitle="Top 10 groups · color: green ≤4h · orange 4–8h · red >8h"
            height={320}>
            <MTTRByGroup data={allIncidents} loading={loading} />
          </ChartCard>
        </div>

        {/* Row 5: Forecast + Root Cause */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Volume Forecast" subtitle="6-period ahead forecast" height={300}
            insight={insightByChart['forecast']} error={chartErrors.forecast}>
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

        {/* Row 6: Creation Heatmap */}
        <ChartCard title="Incident Creation Heat Map"
          subtitle="Day-of-week × hour-of-day — identify peak load windows" height="auto"
          error={chartErrors.heatmap}>
          <div style={{ minHeight: 200 }}>
            {heatmap.length ? <ResolutionHeatmap data={heatmap} /> : <EmptyState />}
          </div>
        </ChartCard>

        {/* Row 7: Reassignment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Reassignment Rate by Group" subtitle="Average reassignments per incident" height={280}
            error={chartErrors.reass}>
            {loading ? <SkeletonCard h="h-full" /> : reass.by_group?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reass.by_group} layout="vertical" margin={{ left: 100, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="group" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg_reassignments" name="Avg Reassignments" radius={[0,3,3,0]}>
                    {reass.by_group?.map((r, i) => (
                      <Cell key={i} fill={r.avg_reassignments > 1 ? '#EF4444' : r.avg_reassignments > 0.5 ? '#F59E0B' : '#22C55E'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>

          <ChartCard title="Reassignment Impact on SLA"
            subtitle="SLA breach rate & avg MTTR by number of reassignments" height={280} error={chartErrors.reass}>
            {loading ? <SkeletonCard h="h-full" /> : (() => {
              const bucketDef = [
                { key: '0', label: '0 (First Try)', min: 0, max: 0 },
                { key: '1', label: '1 Reassign',   min: 1, max: 1 },
                { key: '2', label: '2 Reassigns',  min: 2, max: 2 },
                { key: '3+', label: '3+ Reassigns', min: 3, max: 99 },
              ]
              const bucketData = bucketDef.map(({ key, label, min, max }) => {
                const matches = allIncidents.filter(i => {
                  const rc = i.reassignment_count ?? 0
                  return rc >= min && rc <= max
                })
                const breached = matches.filter(i => i.made_sla_bool === false || i.made_sla_bool === 'false').length
                const resolved = matches.filter(i => i.mttr_hours != null && i.mttr_hours > 0)
                const avgMttr = resolved.length
                  ? Math.round(resolved.reduce((s, i) => s + Number(i.mttr_hours), 0) / resolved.length)
                  : 0
                return {
                  label,
                  total: matches.length,
                  breach_pct: matches.length ? Math.round(100 * breached / matches.length) : 0,
                  avg_mttr: avgMttr,
                }
              }).filter(b => b.total > 0)
              return bucketData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={bucketData} margin={{ left: -10, right: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`}
                      label={{ value: 'Avg MTTR (h)', angle: -90, position: 'insideLeft', fontSize: 9, dy: 40 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`}
                      domain={[0, 100]} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-xs shadow-lg">
                          <p className="font-bold mb-1">{label}</p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }}>{p.name}: {p.value}{p.name.includes('%') ? '' : 'h'}</p>
                          ))}
                          <p className="text-slate-400 mt-1">{payload[0]?.payload?.total?.toLocaleString()} incidents</p>
                        </div>
                      )
                    }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar yAxisId="left" dataKey="avg_mttr" name="Avg MTTR (h)" radius={[4,4,0,0]}>
                      {bucketData.map((b, i) => (
                        <Cell key={i} fill={b.breach_pct > 70 ? '#EF4444' : b.breach_pct > 50 ? '#F97316' : b.breach_pct > 30 ? '#EAB308' : '#22C55E'} />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="breach_pct" name="SLA Breach %" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 5, fill: '#EF4444' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <EmptyState />
            })()}
          </ChartCard>
        </div>

        {/* Row 8: Insights */}
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
