/**
 * Enhanced Trend Analysis — M2 with Dynamic Group Limiting
 *
 * Features:
 * - Priority Distribution Heat Map (P1-P4 × groups/towers)
 * - Incident Volume by Group (top 10 + Others)
 * - Volume Over Time (stacked or line)
 * - MTTR Trend by Group (top 10 + Others)
 * - All filter-responsive
 */
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
  ComposedChart,
} from 'recharts'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { trends as trendApi, monitoring as monApi, buildParams } from '../../services/api'
import Header from '../layout/Header'
import DateFilter from '../common/DateFilter'
import { TowerFilter, SDMFilter } from '../common/TowerSDMFilter.jsx'
import { SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'
import clsx from 'clsx'

const COLORS = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#EAB308']
const PRIORITY_COLORS = { 1: '#EF4444', 2: '#F97316', 3: '#EAB308', 4: '#22C55E' }
const PRIORITY_LABELS = { 1: 'P1-Critical', 2: 'P2-High', 3: 'P3-Moderate', 4: 'P4-Standard' }

/**
 * Helper: Group data intelligently
 * If >10 groups, take top 10 by value + group rest as "Others"
 */
function smartGroupData(data, key, limit = 10) {
  if (!data || data.length === 0) return data

  const sorted = [...data].sort((a, b) => (b[key] || 0) - (a[key] || 0))

  if (sorted.length <= limit) return sorted

  const top = sorted.slice(0, limit)
  const others = sorted.slice(limit)
  const othersSum = others.reduce((sum, item) => sum + (item[key] || 0), 0)

  return [
    ...top,
    {
      name: 'Others',
      [key]: othersSum,
      isOthers: true,
      count: others.length,
    },
  ]
}

/**
 * Priority Distribution Heat Map
 */
function PriorityHeatMap({ data, filters }) {
  if (!data || data.length === 0) return <EmptyState />

  // Create matrix: groups × priorities
  const groupMap = {}
  data.forEach(incident => {
    const group = incident.assignment_group || 'Unknown'
    if (!groupMap[group]) groupMap[group] = { P1: 0, P2: 0, P3: 0, P4: 0 }
    groupMap[group][`P${incident.priority}`] = (groupMap[group][`P${incident.priority}`] || 0) + 1
  })

  const allData = Object.entries(groupMap)
    .map(([group, counts]) => ({ group, ...counts }))
    .sort((a, b) => (b.P1 || 0) + (b.P2 || 0) - (a.P1 || 0) - (a.P2 || 0))

  // Apply smart grouping: top 10 + Others
  let heatData = allData
  if (allData.length > 10) {
    const top = allData.slice(0, 10)
    const others = allData.slice(10)
    const otherP1 = others.reduce((sum, g) => sum + (g.P1 || 0), 0)
    const otherP2 = others.reduce((sum, g) => sum + (g.P2 || 0), 0)
    const otherP3 = others.reduce((sum, g) => sum + (g.P3 || 0), 0)
    const otherP4 = others.reduce((sum, g) => sum + (g.P4 || 0), 0)
    heatData = [...top, { group: 'Others', P1: otherP1, P2: otherP2, P3: otherP3, P4: otherP4, count: others.length }]
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Priority Distribution Heatmap</span>
        <span className="text-xs text-slate-400">Top 15 assignment groups by P1+P2 volume</span>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/30">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Assignment Group</th>
              <th className="px-3 py-2 text-center font-bold" style={{ color: '#EF4444' }}>P1</th>
              <th className="px-3 py-2 text-center font-bold" style={{ color: '#F97316' }}>P2</th>
              <th className="px-3 py-2 text-center font-bold" style={{ color: '#EAB308' }}>P3</th>
              <th className="px-3 py-2 text-center font-bold" style={{ color: '#22C55E' }}>P4</th>
              <th className="px-3 py-2 text-center font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {heatData.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 truncate">{row.group}</td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold">
                    {row.P1 || 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-bold">
                    {row.P2 || 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 font-bold">
                    {row.P3 || 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-bold">
                    {row.P4 || 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">
                  {(row.P1 || 0) + (row.P2 || 0) + (row.P3 || 0) + (row.P4 || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Incident Volume by Assignment Group (Top 10 + Others)
 */
function VolumeByGroup({ data, loading }) {
  if (loading) return <SkeletonCard h="h-80" />
  if (!data || data.length === 0) return <EmptyState />

  // Count by group
  const groupCounts = {}
  data.forEach(incident => {
    const group = incident.assignment_group || 'Unknown'
    groupCounts[group] = (groupCounts[group] || 0) + 1
  })

  const chartData = smartGroupData(
    Object.entries(groupCounts).map(([name, count]) => ({ name, count })),
    'count',
    10
  )

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Incident Volume by Assignment Group</span>
        <span className="text-xs text-slate-400">
          {chartData.length <= 10 ? `All ${chartData.length} groups` : `Top 10 + Others (${chartData[chartData.length - 1].count} total)`}
        </span>
      </div>
      <div className="p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: -20, right: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="#2563EB" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isOthers ? '#94A3B8' : COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Incident Volume Over Time
 */
function VolumeOverTime({ data, loading }) {
  if (loading) return <SkeletonCard h="h-80" />
  if (!data || data.length === 0) return <EmptyState />

  // Group by date
  const dateMap = {}
  data.forEach(incident => {
    const date = new Date(incident.created).toISOString().split('T')[0]
    dateMap[date] = (dateMap[date] || 0) + 1
  })

  const chartData = Object.entries(dateMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Incident Volume Over Time</span>
        <span className="text-xs text-slate-400">{chartData.length} days of data</span>
      </div>
      <div className="p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ left: -20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="#10B981" radius={[3, 3, 0, 0]} name="Daily Volume" />
            <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={false} name="Trend" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * MTTR Trend by Assignment Group (Top 10)
 */
function MTTRTrendByGroup({ data, loading }) {
  if (loading) return <SkeletonCard h="h-80" />
  if (!data || data.length === 0) return <EmptyState />

  // Calculate avg MTTR by group
  const groupStats = {}
  data.forEach(incident => {
    const mttr = incident.mttr_hours
    if (mttr === null || mttr === undefined || mttr < 0) return
    const group = incident.assignment_group || 'Unknown'
    if (!groupStats[group]) groupStats[group] = { count: 0, total: 0 }
    groupStats[group].total += mttr
    groupStats[group].count += 1
  })

  const chartData = smartGroupData(
    Object.entries(groupStats)
      .map(([name, stats]) => ({
        name,
        mttr: parseFloat((stats.total / stats.count).toFixed(1)),
        count: stats.count,
      }))
      .filter(d => d.count >= 2), // Only groups with 2+ incidents
    'mttr',
    10
  )

  // SLA targets
  const P1_TARGET = 4
  const P2_TARGET = 8

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Average MTTR by Assignment Group</span>
        <span className="text-xs text-slate-400">
          {chartData.length <= 10 ? `All ${chartData.length} groups` : `Top 10 + Others`}
        </span>
      </div>
      <div className="p-4" style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: -20, right: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis label={{ value: 'MTTR (hours)', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 10 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.[0]) {
                  return (
                    <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-300 dark:border-slate-600 text-xs">
                      <p className="font-bold">{payload[0].payload.name}</p>
                      <p className="text-blue-600">MTTR: {payload[0].value}h</p>
                      <p className="text-slate-500">Incidents: {payload[0].payload.count}</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="mttr" fill="#8B5CF6" radius={[3, 3, 0, 0]} name="Avg MTTR">
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.mttr > P2_TARGET
                      ? '#EF4444' // Red: >8h
                      : entry.mttr > P1_TARGET
                      ? '#F97316' // Orange: >4h
                      : '#22C55E' // Green: <=4h
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Main Enhanced Trend Analysis Component
 */
export default function EnhancedTrendAnalysis() {
  const [filters, setFilters] = useState({
    dateFrom: '', dateTo: '', towers: [], sdms: [], groups: [], priorities: [], categories: [], states: [], sla: '', granularity: 'month'
  })
  const [opts, setOpts] = useState({})
  const [allIncidents, setAllIncidents] = useState([]) // Raw data for client-side filtering
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load filter options once
  useEffect(() => {
    monApi.filters()
      .then(r => setOpts(r.data))
      .catch(console.error)
  }, [])

  // Load all incidents for client-side filtering
  const loadAll = useCallback(() => {
    setLoading(true)
    monApi.incidents({ page: 1, limit: 5000 })
      .then(r => {
        // axios response: r.data = { data: [...incidents], total: N, ... }
        const incidents = r.data?.data || []
        setAllIncidents(incidents)
      })
      .catch(err => {
        console.error('Failed to load incidents:', err)
        setAllIncidents([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  // Filter incidents client-side based on selected filters
  const filteredIncidents = allIncidents.filter(incident => {
    if (filters.dateFrom && new Date(incident.created) < new Date(filters.dateFrom)) return false
    if (filters.dateTo && new Date(incident.created) > new Date(filters.dateTo)) return false
    if (filters.towers.length && !filters.towers.includes(incident.tower)) return false
    if (filters.sdms.length && !filters.sdms.includes(incident.sdm)) return false
    if (filters.groups.length && !filters.groups.includes(incident.assignment_group)) return false
    if (filters.priorities.length && !filters.priorities.includes(incident.priority)) return false
    if (filters.categories.length && !filters.categories.includes(incident.category)) return false
    if (filters.states.length && !filters.states.includes(incident.state)) return false
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M2 — Enhanced Trend Analysis"
        subtitle="Dynamic grouping · Priority heatmap · Real-time filtering"
        onRefresh={() => setRefreshKey(k => k + 1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Date & Tower/SDM Filters */}
        <DateFilter
          onDateChange={(range) => setFilters(f => ({ ...f, dateFrom: range.from, dateTo: range.to }))}
          disabled={loading}
        />

        <div className="flex gap-4 flex-wrap items-start">
          <TowerFilter
            towers={opts.towers || []}
            value={filters.towers}
            onChange={(v) => setFilters(f => ({ ...f, towers: v }))}
            disabled={loading}
          />
          <SDMFilter
            sdms={opts.sdms || []}
            value={filters.sdms}
            onChange={(v) => setFilters(f => ({ ...f, sdms: v }))}
            disabled={loading}
          />
        </div>

        {/* Status Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-900 dark:text-blue-100">
          Showing <span className="font-bold">{filteredIncidents.length}</span> incidents (filtered from {allIncidents.length} total)
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Priority Heatmap - Full Width */}
          <div className="lg:col-span-2">
            <PriorityHeatMap data={filteredIncidents} filters={filters} />
          </div>

          {/* Volume by Group */}
          <div>
            <VolumeByGroup data={filteredIncidents} loading={loading} />
          </div>

          {/* Volume Over Time */}
          <div>
            <VolumeOverTime data={filteredIncidents} loading={loading} />
          </div>

          {/* MTTR Trend */}
          <div className="lg:col-span-2">
            <MTTRTrendByGroup data={filteredIncidents} loading={loading} />
          </div>
        </div>

        {/* Legend & Help */}
        <div className="card p-4 bg-slate-50 dark:bg-slate-900/30 border-l-4 border-blue-500">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Dynamic Grouping Logic:</p>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <li>• <span className="font-semibold">≤ 10 groups:</span> Show all groups individually</li>
            <li>• <span className="font-semibold">&gt; 10 groups:</span> Show top 10 + "Others" (sum of remaining)</li>
            <li>• <span className="font-semibold">Heatmap:</span> Always shows top 15 groups by P1+P2 volume</li>
            <li>• <span className="font-semibold">Real-time:</span> All charts update instantly with filter changes</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
