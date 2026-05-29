import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, Clock, AlertTriangle, CheckCircle2, Pause, Play,
  XCircle, Filter, Download,
} from 'lucide-react'
import clsx from 'clsx'
import { monitoring as monApi, buildParams } from '../../services/api'
import Header from '../layout/Header'

// ── Priority / State config ───────────────────────────────────────────────────
const P_COLOR = {
  1: { bg: 'bg-red-600',    text: 'text-white',       badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',    label: 'P1' },
  2: { bg: 'bg-orange-500', text: 'text-white',       badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', label: 'P2' },
  3: { bg: 'bg-amber-400',  text: 'text-amber-900',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'P3' },
  4: { bg: 'bg-slate-400',  text: 'text-white',       badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', label: 'P4' },
}
const S_COLOR = {
  'Open':        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'In Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'On Hold':     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Resolved':    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Closed':      'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',       label: 'All',              states: [],                          priorities: [] },
  { key: 'active',    label: 'Active',           states: ['Open','In Progress','On Hold'], priorities: [] },
  { key: 'critical',  label: 'Critical / High',  states: [],                          priorities: [1, 2] },
  { key: 'breached',  label: 'SLA Breached',     states: [],                          priorities: [],  sla: 'breached' },
  { key: 'resolved',  label: 'Resolved / Closed',states: ['Resolved','Closed'],       priorities: [] },
]

const SORT_COLS = [
  { key: 'created', label: 'Created' },
  { key: 'priority', label: 'Priority' },
  { key: 'state', label: 'State' },
  { key: 'first_assignment_group', label: 'Group' },
  { key: 'mttr_hours', label: 'MTTR' },
]

// ── Row detail drawer ─────────────────────────────────────────────────────────
function RowDetail({ row, onClose }) {
  return (
    <tr>
      <td colSpan={9} className="px-0 py-0">
        <div className="bg-slate-50 dark:bg-slate-800/60 border-t border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
            {[
              ['Incident #',   row.number],
              ['State',        row.state],
              ['Priority',     `P${row.priority} — ${['','Critical','High','Moderate','Standard'][row.priority]}`],
              ['Category',     `${row.category}${row.subcategory ? ' › ' + row.subcategory : ''}`],
              ['Group',        row.first_assignment_group],
              ['Assigned To',  row.assigned_to || '—'],
              ['Created',      row.created?.slice(0, 16) || '—'],
              ['Resolved',     row.resolved?.slice(0, 16) || '—'],
              ['MTTR',         row.mttr_hours != null ? `${Number(row.mttr_hours).toFixed(1)} hrs` : '—'],
              ['SLA',          row.made_sla_bool ? '✓ Met' : '✗ Breached'],
              ['Reassignments',row.reassignment_count],
              ['Reopens',      row.reopen_count],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{k}</p>
                <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5 break-words">{v}</p>
              </div>
            ))}
          </div>
          {row.short_description && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Description</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{row.short_description}</p>
            </div>
          )}
          {row.resolution_notes && (
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Resolution Notes</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/50 rounded-lg p-3 leading-relaxed">{row.resolution_notes}</p>
            </div>
          )}
          <button onClick={onClose} className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1">
            <ChevronUp size={12} /> Collapse
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LiveRegister() {
  const [tab, setTab]           = useState('active')
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage]         = useState(1)
  const [sortBy, setSortBy]     = useState('created')
  const [sortDir, setSortDir]   = useState('desc')
  const [data, setData]         = useState({ data: [], total: 0, total_pages: 1 })
  const [loading, setLoading]   = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [groupFilter, setGroupFilter] = useState([])
  const [opts, setOpts]         = useState({})
  const timerRef = useRef(null)

  useEffect(() => {
    monApi.filters().then(r => setOpts(r.data)).catch(console.error)
  }, [])

  const activeTab = TABS.find(t => t.key === tab)

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = {
      page,
      limit: 25,
      sort_by: sortBy,
      sort_dir: sortDir,
      ...(search     && { search }),
      ...(activeTab?.states?.length     && { states:     activeTab.states }),
      ...(activeTab?.priorities?.length && { priorities: activeTab.priorities }),
      ...(activeTab?.sla                && { sla:        activeTab.sla }),
      ...(groupFilter.length            && { groups:     groupFilter }),
    }
    monApi.incidents(p)
      .then(r => { setData(r.data); setLastRefreshed(new Date()) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, sortBy, sortDir, search, tab, groupFilter, activeTab])

  useEffect(() => { setPage(1) }, [tab, search, groupFilter])
  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 30000)
    }
    return () => clearInterval(timerRef.current)
  }, [autoRefresh, fetchData])

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  const toggleGroupFilter = (g) => {
    setGroupFilter(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    )
  }

  // Export visible rows as CSV
  const exportCsv = () => {
    if (!data.data?.length) return
    const cols = ['number','created','priority','state','first_assignment_group',
                  'assigned_to','category','short_description','made_sla','mttr_hours',
                  'reassignment_count','reopen_count','resolved']
    const header = cols.join(',')
    const rows = data.data.map(r =>
      cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `incidents_${tab}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronDown size={10} className="text-slate-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-brand-600" />
      : <ChevronDown size={10} className="text-brand-600" />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Live Incident Register"
        subtitle={`${(data.total ?? 0).toLocaleString()} incidents · auto-refresh every 30s`}
        loading={loading}
        onRefresh={fetchData}
      />

      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 space-y-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0',
                  tab === t.key
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
              >
                {t.label}
                {tab === t.key && data.total > 0 && (
                  <span className="ml-1.5 bg-white/25 px-1.5 py-0.5 rounded-full text-[10px]">
                    {data.total.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search number, description, user…"
                  className="input-field pl-8 text-xs py-1.5"
                />
                {searchInput && (
                  <button type="button" onClick={() => { setSearchInput(''); setSearch('') }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                    <XCircle size={12} />
                  </button>
                )}
              </div>
              <button type="submit" className="btn-primary py-1.5 text-xs px-3">Search</button>
            </form>

            {/* Group filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter size={11} className="text-slate-400 shrink-0" />
              {(opts.groups || []).map(g => (
                <button
                  key={g}
                  onClick={() => toggleGroupFilter(g)}
                  className={clsx(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap',
                    groupFilter.includes(g)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-brand-400'
                  )}
                >
                  {g.replace('DPS-', '')}
                </button>
              ))}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value); setSortDir('desc') }}
                className="input-field text-xs py-1.5"
              >
                {SORT_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>

              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(a => !a)}
                className={clsx(
                  'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors',
                  autoRefresh
                    ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                )}
                title={autoRefresh ? 'Auto-refresh ON — click to pause' : 'Auto-refresh OFF — click to enable'}
              >
                {autoRefresh ? <><Play size={11} className="fill-current" /> Live</> : <><Pause size={11} /> Paused</>}
              </button>

              {/* Export */}
              <button onClick={exportCsv} className="btn-ghost py-1.5 text-xs flex items-center gap-1.5" title="Export current page as CSV">
                <Download size={12} /> Export
              </button>

              {/* Manual refresh */}
              <button onClick={fetchData} className="btn-ghost p-1.5" title="Refresh now">
                <RefreshCw size={13} className={clsx(loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Last refreshed */}
          {lastRefreshed && (
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock size={9} />
              Last updated {lastRefreshed.toLocaleTimeString()}
              {autoRefresh && <span className="text-green-500 ml-1">· auto-refresh active</span>}
            </p>
          )}
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
              <tr>
                <th className="w-6 px-3 py-3" />
                {[
                  { col: 'number',                 label: 'Incident #',  w: 'w-28' },
                  { col: 'priority',               label: 'Pri',         w: 'w-14' },
                  { col: 'state',                  label: 'State',       w: 'w-28' },
                  { col: 'created',                label: 'Created',     w: 'w-32' },
                  { col: 'first_assignment_group', label: 'Group',       w: 'w-40' },
                  { col: null,                     label: 'Description', w: '' },
                  { col: 'mttr_hours',             label: 'MTTR',        w: 'w-16' },
                  { col: null,                     label: 'SLA',         w: 'w-16' },
                ].map(({ col, label, w }) => (
                  <th
                    key={label}
                    onClick={col ? () => handleSort(col) : undefined}
                    className={clsx(
                      'px-3 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap',
                      w,
                      col && 'cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none'
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {label}{col && <SortIcon col={col} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading && !data.data?.length ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-3 py-3">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" style={{ width: `${60 + (i % 4) * 10}%` }} />
                    </td>
                  </tr>
                ))
              ) : !data.data?.length ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    No incidents match the current filters.
                  </td>
                </tr>
              ) : data.data.map((row, i) => {
                const isExpanded = expandedRow === row.number
                const pc = P_COLOR[row.priority] || P_COLOR[4]
                return [
                  <tr
                    key={row.number}
                    onClick={() => setExpandedRow(isExpanded ? null : row.number)}
                    className={clsx(
                      'cursor-pointer transition-colors group',
                      isExpanded
                        ? 'bg-brand-50 dark:bg-brand-900/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      row.priority === 1 && !isExpanded && 'border-l-2 border-red-500',
                      row.priority === 2 && !isExpanded && 'border-l-2 border-orange-400',
                    )}
                  >
                    {/* Expand chevron */}
                    <td className="px-3 py-2.5 text-slate-400">
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </td>
                    {/* Number */}
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-brand-600 dark:text-brand-400 text-[11px]">{row.number}</span>
                    </td>
                    {/* Priority */}
                    <td className="px-3 py-2.5">
                      <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black', pc.badge)}>
                        {pc.label}
                      </span>
                    </td>
                    {/* State */}
                    <td className="px-3 py-2.5">
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold', S_COLOR[row.state] || S_COLOR['Open'])}>
                        {row.state}
                      </span>
                    </td>
                    {/* Created */}
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {row.created?.slice(0, 16) || '—'}
                    </td>
                    {/* Group */}
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate" title={row.first_assignment_group}>
                      {row.first_assignment_group?.replace('DPS-', '') || '—'}
                    </td>
                    {/* Description */}
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-[300px]">
                      <p className="truncate leading-tight" title={row.short_description}>{row.short_description || '—'}</p>
                      {row.category && <p className="text-[9px] text-slate-400 mt-0.5">{row.category}</p>}
                    </td>
                    {/* MTTR */}
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {row.mttr_hours != null ? `${Number(row.mttr_hours).toFixed(1)}h` : '—'}
                    </td>
                    {/* SLA */}
                    <td className="px-3 py-2.5">
                      {row.made_sla_bool
                        ? <CheckCircle2 size={14} className="text-green-500" title="SLA Met" />
                        : <AlertTriangle size={14} className="text-red-500" title="SLA Breached" />}
                    </td>
                  </tr>,
                  isExpanded && <RowDetail key={`detail-${row.number}`} row={row} onClose={() => setExpandedRow(null)} />,
                ]
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, data.total)} of {(data.total ?? 0).toLocaleString()} incidents
          </span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(1)} className="btn-ghost p-1.5 disabled:opacity-40" title="First page">«</button>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(5, data.total_pages || 1) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, (data.total_pages || 1) - 4)) + i
                if (pg > (data.total_pages || 1)) return null
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={clsx('w-7 h-7 rounded text-xs font-semibold transition-colors',
                      pg === page ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300')}>
                    {pg}
                  </button>
                )
              })}
            </div>
            <button disabled={page >= (data.total_pages || 1)} onClick={() => setPage(p => p + 1)} className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={14} /></button>
            <button disabled={page >= (data.total_pages || 1)} onClick={() => setPage(data.total_pages)} className="btn-ghost p-1.5 disabled:opacity-40" title="Last page">»</button>
          </div>
        </div>

      </div>
    </div>
  )
}
