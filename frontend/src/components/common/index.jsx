// ─── KPICard ──────────────────────────────────────────────────────────────────
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

export function KPICard({ title, value, unit = '', sub, trend, trendDir = 'neutral', icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    red:    'bg-red-50  dark:bg-red-900/20  text-red-600  dark:text-red-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    teal:   'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400',
  }
  const TrendIcon = trendDir === 'up' ? TrendingUp : trendDir === 'down' ? TrendingDown : Minus
  const trendColor = trendDir === 'up' ? 'text-red-500' : trendDir === 'down' ? 'text-green-500' : 'text-slate-400'

  // Dynamic text sizing based on value length
  const valueStr = value?.toLocaleString() || '—'
  const textSize = valueStr.length > 10 ? 'text-lg' : valueStr.length > 6 ? 'text-xl' : 'text-2xl'
  const unitSize = valueStr.length > 10 ? 'text-xs' : 'text-sm'

  return (
    <div className="card p-4 animate-fade-in h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 flex-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate leading-tight">{title}</p>
          {loading ? (
            <div className="mt-2 h-7 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          ) : (
            <p className={clsx('mt-2 font-bold text-slate-800 dark:text-slate-100 leading-tight break-words', textSize)}>
              {valueStr}
              {unit && <span className={clsx('font-normal text-slate-500 dark:text-slate-400 ml-1', unitSize)}>{unit}</span>}
            </p>
          )}
          {sub && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{sub}</p>}
        </div>
        {Icon && (
          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', colors[color])}>
            <Icon size={16} />
          </div>
        )}
      </div>
      {trend && (
        <div className={clsx('mt-2 flex items-center gap-1 text-xs font-medium', trendColor)}>
          <TrendIcon size={12} />
          <span className="truncate">{trend}</span>
        </div>
      )}
    </div>
  )
}

// ─── InsightCard ──────────────────────────────────────────────────────────────
export function InsightCard({ insight }) {
  const cfg = {
    positive: { bar: 'bg-green-500',  bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', dot: '🟢' },
    warning:  { bar: 'bg-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', dot: '🟡' },
    critical: { bar: 'bg-red-500',    bg: 'bg-red-50   dark:bg-red-900/20',   text: 'text-red-700   dark:text-red-300',   dot: '🔴' },
    info:     { bar: 'bg-brand-500',  bg: 'bg-blue-50  dark:bg-blue-900/20',  text: 'text-blue-700  dark:text-blue-300',  dot: '🔵' },
  }
  const sev = insight.severity || 'info'
  const c = cfg[sev] || cfg.info

  return (
    <div className={clsx('rounded-lg p-3 flex gap-3 animate-fade-in', c.bg)}>
      <div className={clsx('w-1 rounded-full shrink-0', c.bar)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={clsx('text-xs font-semibold', c.text)}>{c.dot} {insight.title}</p>
          {insight.metric && (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-slate-700/60 px-2 py-0.5 rounded shrink-0">
              {insight.metric}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{insight.message}</p>
      </div>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from 'react'
import { Filter, X, ChevronDown } from 'lucide-react'

const DATE_PRESETS = [
  { label: '30 Days',  days: 30  },
  { label: '90 Days',  days: 90  },
  { label: '6 Months', days: 180 },
  { label: '1 Year',   days: 365 },
  { label: 'All Time', days: null },
]

function MultiSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
          value.length
            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
        )}
      >
        {label} {value.length > 0 && <span className="bg-brand-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{value.length}</span>}
        <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl min-w-48 py-1 max-h-60 overflow-y-auto animate-fade-in">
          {options.map(opt => {
            const v = typeof opt === 'object' ? opt.value : opt
            const l = typeof opt === 'object' ? opt.label : opt
            return (
              <label key={v} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} className="accent-brand-600 w-3.5 h-3.5" />
                <span className="text-xs text-slate-700 dark:text-slate-200">{l}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function FilterBar({ filters, onChange, options = {}, showGranularity = false }) {
  const activeCount = [
    filters.groups?.length, filters.priorities?.length,
    filters.categories?.length, filters.states?.length, filters.sla,
  ].filter(Boolean).length

  const setPreset = (days) => {
    if (!days) { onChange({ ...filters, dateFrom: '', dateTo: '' }); return }
    const to   = new Date()
    const from = new Date(to - days * 86400000)
    onChange({ ...filters, dateFrom: from.toISOString().slice(0,10), dateTo: to.toISOString().slice(0,10) })
  }

  const priorityOpts = [
    { value: 1, label: 'P1 Critical' }, { value: 2, label: 'P2 High' },
    { value: 3, label: 'P3 Medium'  }, { value: 4, label: 'P4 Low'  },
  ]

  return (
    <div className="card px-4 py-3 flex flex-wrap items-center gap-2 animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Filter size={13} />
        Filters
        {activeCount > 0 && (
          <span className="bg-brand-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">{activeCount}</span>
        )}
      </div>

      {/* Date presets */}
      <div className="flex gap-1">
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => setPreset(p.days)}
            className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 hover:border-brand-400 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400 transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom dates */}
      <div className="flex items-center gap-1">
        <input type="date" value={filters.dateFrom || ''} onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:border-brand-500 focus:outline-none" />
        <span className="text-xs text-slate-400">→</span>
        <input type="date" value={filters.dateTo || ''} onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:border-brand-500 focus:outline-none" />
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-600" />

      {options.groups    && <MultiSelect label="Group"    options={options.groups}    value={filters.groups    || []} onChange={v => onChange({ ...filters, groups: v })} />}
      {options.priorities&& <MultiSelect label="Priority" options={priorityOpts}      value={filters.priorities|| []} onChange={v => onChange({ ...filters, priorities: v })} />}
      {options.categories&& <MultiSelect label="Category" options={options.categories}value={filters.categories|| []} onChange={v => onChange({ ...filters, categories: v })} />}
      {options.states    && <MultiSelect label="State"    options={options.states}    value={filters.states    || []} onChange={v => onChange({ ...filters, states: v })} />}

      {/* SLA toggle */}
      <select value={filters.sla || ''} onChange={e => onChange({ ...filters, sla: e.target.value })}
        className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:border-brand-500 focus:outline-none">
        <option value="">All SLA</option>
        <option value="met">SLA Met</option>
        <option value="breached">SLA Breached</option>
      </select>

      {showGranularity && (
        <select value={filters.granularity || 'month'} onChange={e => onChange({ ...filters, granularity: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:border-brand-500 focus:outline-none">
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      )}

      {/* Reset */}
      {activeCount > 0 && (
        <button onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '', groups: [], priorities: [], categories: [], states: [], sla: '', granularity: 'month' })}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors ml-1">
          <X size={12} /> Reset
        </button>
      )}
    </div>
  )
}

// ─── DrilldownModal ───────────────────────────────────────────────────────────
export function DrilldownModal({ title, data = [], columns = [], onClose }) {
  if (!data.length) return null
  const PRIORITY_BADGE = { 1: 'badge-p1', 2: 'badge-p2', 3: 'badge-p3', 4: 'badge-p4' }
  const STATE_BADGE = {
    'Open': 'badge-open', 'In Progress': 'badge-in-progress',
    'On Hold': 'badge-on-hold', 'Resolved': 'badge-resolved', 'Closed': 'badge-closed',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            <p className="text-xs text-slate-500">{data.length} incidents</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
              <tr>
                {columns.map(c => (
                  <th key={c.key} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  {columns.map(c => (
                    <td key={c.key} className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {c.key === 'priority' ? (
                        <span className={PRIORITY_BADGE[row[c.key]]}>{`P${row[c.key]}`}</span>
                      ) : c.key === 'state' ? (
                        <span className={STATE_BADGE[row[c.key]] || 'badge'}>{row[c.key]}</span>
                      ) : c.key === 'made_sla' ? (
                        <span className={row[c.key] === 'TRUE' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                          {row[c.key] === 'TRUE' ? '✓ Met' : '✗ Breached'}
                        </span>
                      ) : (
                        <span>{String(row[c.key] ?? '—').slice(0, 80)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
export function SkeletonCard({ h = 'h-64' }) {
  return (
    <div className={clsx('card', h, 'animate-pulse')}>
      <div className="card-header">
        <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div className="p-5 space-y-3">
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
      </div>
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
export function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl p-3 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {formatter ? formatter(p.value, p.name) : p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ message = 'No data available for the selected filters.' }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <p className="text-4xl mb-3">📭</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  )
}
