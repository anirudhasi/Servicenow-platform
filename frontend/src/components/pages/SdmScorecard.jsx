import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { ClipboardList, Users, TrendingUp, CheckCircle2, AlertTriangle, Minus } from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { scorecard as scorecardApi, monitoring as monApi, buildParams } from '../../services/api'
import { FilterBar, SkeletonCard, EmptyState, CustomTooltip } from '../common/index.jsx'
import { TowerFilter, SDMFilter } from '../common/TowerSDMFilter.jsx'

// ── RAG badge ─────────────────────────────────────────────────────────────────
function RAGBadge({ rag }) {
  const cfg = {
    green: { cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', icon: CheckCircle2 },
    amber: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', icon: Minus },
    red:   { cls: 'bg-red-100  text-red-700   dark:bg-red-900/40   dark:text-red-400',   icon: AlertTriangle },
  }[rag] || { cls: 'bg-slate-100 text-slate-500', icon: Minus }
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', cfg.cls)}>
      <Icon size={9} />{rag?.toUpperCase()}
    </span>
  )
}

// ── Compliance bar ────────────────────────────────────────────────────────────
function ComplianceBar({ actual, target }) {
  const pct = Math.min(actual, 100)
  const color = actual >= target ? '#22C55E' : actual >= target - 5 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold shrink-0" style={{ color }}>{actual}%</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SdmScorecard() {
  const [filters, setFilters] = useState({ dateFrom:'', dateTo:'', towers:[], sdms:[], groups:[] })
  const [opts, setOpts]       = useState({})
  const [summary, setSummary] = useState([])
  const [agents, setAgents]   = useState([])
  const [monthly, setMonthly] = useState([])
  const [tab, setTab]         = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    monApi.filters().then(r => setOpts(r.data)).catch(console.error)
  }, [])

  const loadAll = useCallback(() => {
    setLoading(true)
    const p = buildParams(filters)
    Promise.all([
      scorecardApi.summary(p),
      scorecardApi.byAgent(p),
      scorecardApi.monthly(p),
    ]).then(([s, a, m]) => {
      setSummary(s.data); setAgents(a.data); setMonthly(m.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  // KPI summary from metrics
  const greenCount = summary.filter(m => m.rag === 'green').length
  const amberCount = summary.filter(m => m.rag === 'amber').length
  const redCount   = summary.filter(m => m.rag === 'red').length
  const ftfMetric  = summary.find(m => m.id === 'AM.17')
  const agingMetric= summary.find(m => m.id === 'AM.18')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M6 SDM Scorecard"
        subtitle="Service Delivery Manager view — AM metric compliance & agent performance"
        onRefresh={() => setRefreshKey(k => k + 1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Filters */}
        <div className="card p-4 bg-slate-50 dark:bg-slate-900/30 border-l-4 border-brand-500 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-40">
              <TowerFilter towers={opts.towers || []} value={filters.towers}
                onChange={v => setFilters(f => ({ ...f, towers: v }))} disabled={loading} />
            </div>
            <div className="flex-1 min-w-40">
              <SDMFilter sdms={opts.sdms || []} value={filters.sdms}
                onChange={v => setFilters(f => ({ ...f, sdms: v }))} disabled={loading} />
            </div>
          </div>
          <FilterBar filters={filters} onChange={setFilters} options={{ ...opts, showPriority: false }} />
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Metrics Green', value: greenCount, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
            { label: 'Metrics Amber', value: amberCount, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Metrics Red',   value: redCount,   color: 'text-red-600',   bg: 'bg-red-50   dark:bg-red-900/20' },
            { label: 'First Time Fix',value: ftfMetric  ? `${ftfMetric.actual}%`  : '—', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={clsx('card p-4 flex flex-col gap-1', bg)}>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
              <p className={clsx('text-3xl font-black', color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {[
            { key: 'metrics', label: 'AM Metrics', icon: ClipboardList },
            { key: 'agents',  label: 'Agent Breakdown', icon: Users },
            { key: 'monthly', label: 'Monthly Trend', icon: TrendingUp },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors',
                tab === key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* ── Tab: AM Metrics ───────────────────────────────────────────────── */}
        {tab === 'metrics' && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    {['ID','Metric','Type','Target','Threshold','Total','Met','Not Met','Actual','Status','Compliance'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}><td colSpan={11} className="px-3 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /></td></tr>
                    ))
                  ) : summary.map(m => (
                    <tr key={m.id} className={clsx(
                      'hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors',
                      m.rag === 'red' && 'bg-red-50/40 dark:bg-red-900/10'
                    )}>
                      <td className="px-3 py-2.5 font-mono font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">{m.id}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-[200px]">
                        <p className="font-semibold leading-tight">{m.name}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{m.description}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold',
                          m.type === 'SLA' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                           : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        )}>{m.type}</span>
                      </td>
                      <td className="px-3 py-2.5 text-green-600 dark:text-green-400 font-semibold">{m.target}%</td>
                      <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400 font-semibold">{m.threshold}%</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 font-semibold">{(m.total ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-green-600 dark:text-green-400 font-semibold">{(m.met ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-red-500 font-semibold">{(m.not_met ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100">{m.actual}%</td>
                      <td className="px-3 py-2.5"><RAGBadge rag={m.rag} /></td>
                      <td className="px-3 py-2.5 min-w-[140px]"><ComplianceBar actual={m.actual} target={m.target} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Agent Breakdown ──────────────────────────────────────────── */}
        {tab === 'agents' && (
          <div className="card overflow-hidden">
            {!agents.length && !loading ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No agent data available. Ensure the CSV has an <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">assigned_to</code> column.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      {['Agent','Total','SLA %','FTF %','Avg MTTR','P1','P2','P3','P4'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /></td></tr>
                      ))
                    ) : agents.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 max-w-[180px] truncate" title={a.agent}>{a.agent}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{a.total.toLocaleString()}</td>
                        <td className="px-3 py-2.5">
                          <span className={clsx('font-bold', a.sla_pct >= 90 ? 'text-green-600' : a.sla_pct >= 75 ? 'text-amber-600' : 'text-red-500')}>
                            {a.sla_pct}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={clsx('font-bold', a.ftf_pct >= 55 ? 'text-green-600' : a.ftf_pct >= 40 ? 'text-amber-600' : 'text-red-500')}>
                            {a.ftf_pct}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{a.avg_mttr != null ? `${a.avg_mttr}h` : '—'}</td>
                        {[1, 2, 3, 4].map(p => {
                          const bpp = a.by_priority?.find(x => x.priority === p)
                          return (
                            <td key={p} className="px-3 py-2.5 text-center">
                              {bpp ? (
                                <div>
                                  <p className={clsx('font-bold', bpp.pct >= 90 ? 'text-green-600' : bpp.pct >= 75 ? 'text-amber-600' : 'text-red-500')}>
                                    {bpp.pct}%
                                  </p>
                                  <p className="text-[10px] text-slate-400">{bpp.total} inc</p>
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Monthly Trend ────────────────────────────────────────────── */}
        {tab === 'monthly' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <div className="card-header">
                <span className="card-title">SLA Compliance Trend</span>
                <span className="text-xs text-slate-400">Monthly overall SLA % with 90% target line</span>
              </div>
              <div className="p-4" style={{ height: 280 }}>
                {loading ? <SkeletonCard h="h-full" /> : monthly.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly} margin={{ left: -20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={90} stroke="#22C55E" strokeDasharray="4 4"
                        label={{ value: '90% target', fontSize: 9, fill: '#22C55E', position: 'right' }} />
                      <Line type="monotone" dataKey="sla_pct" name="SLA %" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">First Time Fix Trend</span>
                <span className="text-xs text-slate-400">Monthly FTF % with 55% target line</span>
              </div>
              <div className="p-4" style={{ height: 280 }}>
                {loading ? <SkeletonCard h="h-full" /> : monthly.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly} margin={{ left: -20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={55} stroke="#8B5CF6" strokeDasharray="4 4"
                        label={{ value: '55% target', fontSize: 9, fill: '#8B5CF6', position: 'right' }} />
                      <Line type="monotone" dataKey="ftf_pct" name="FTF %" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>

            <div className="card lg:col-span-2">
              <div className="card-header">
                <span className="card-title">Monthly Avg MTTR (hours)</span>
                <span className="text-xs text-slate-400">Mean time to resolve across all priorities</span>
              </div>
              <div className="p-4" style={{ height: 240 }}>
                {loading ? <SkeletonCard h="h-full" /> : monthly.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ left: -20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                      <Tooltip content={<CustomTooltip formatter={v => `${v}h`} />} />
                      <Bar dataKey="avg_mttr" name="Avg MTTR (h)" fill="#F59E0B" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
