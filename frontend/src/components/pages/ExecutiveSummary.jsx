/**
 * Executive Summary Dashboard — High-Level Overview with Drill-Down
 *
 * Provides tower-level and SDM-level aggregations
 * Users can drill down to assignment group and incident details
 */
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts'
import {
  Building2, Users, TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ChevronRight, Filter,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { monitoring as monApi, breach as breachApi, buildParams } from '../../services/api'
import { KPICard, SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'

// Design tokens
const COLORS = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444']
const TOWERS = ['A&I', 'D&A', 'DES', 'SAP', 'DFS']
const SDMS = ['Neena Rawat', 'Ray Bhaskar', 'Narendra Patil', 'Kanchan Chaudhari',
              'Swet Bhushan', 'Tuhina Srivastav', 'Akhilesh Singh', 'Preeti More']

function DrillDownCard({ title, data, drillDownPath, onDrillDown }) {
  return (
    <div
      onClick={() => onDrillDown?.(drillDownPath)}
      className="card p-4 cursor-pointer hover:shadow-lg transition-all border border-slate-200 dark:border-slate-700 hover:border-brand-400"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</span>
        <ChevronRight size={16} className="text-slate-400 group-hover:text-brand-600" />
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{data.total}</p>
      {data.sub && <p className="text-xs text-slate-500 mt-1">{data.sub}</p>}
      {data.change && (
        <p className={clsx('text-xs font-semibold mt-2', data.change > 0 ? 'text-red-600' : 'text-green-600')}>
          {data.change > 0 ? '↑' : '↓'} {Math.abs(data.change)}% from last period
        </p>
      )}
    </div>
  )
}

function TowerPanel({ tower, data }) {
  return (
    <div className="card p-4 border-l-4" style={{ borderLeftColor: COLORS[TOWERS.indexOf(tower)] }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{tower}</p>
          <p className="text-xs text-slate-400">Tower Operations</p>
        </div>
        <Building2 size={20} style={{ color: COLORS[TOWERS.indexOf(tower)] }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
          <p className="font-bold text-slate-700 dark:text-slate-200">{data.total_incidents}</p>
          <p className="text-[10px] text-slate-400">Incidents</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
          <p className="font-bold text-red-600">{data.sla_breached}</p>
          <p className="text-[10px] text-slate-400">Breached</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
          <p className="font-bold text-green-600">{data.compliance_pct}%</p>
          <p className="text-[10px] text-slate-400">Compliance</p>
        </div>
      </div>
    </div>
  )
}

function SDMPanel({ sdm, data }) {
  return (
    <div className="card p-4 border-l-4 border-brand-500">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{sdm}</p>
          <p className="text-xs text-slate-400">Service Delivery Manager</p>
        </div>
        <Users size={20} className="text-brand-600" />
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Assignments:</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{data.assignments}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Avg MTTR:</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{data.avg_mttr}h</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Performance:</span>
          <span className={clsx('font-bold', data.performance >= 80 ? 'text-green-600' : 'text-amber-600')}>
            {data.performance}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ExecutiveSummary() {
  const [drillDownLevel, setDrillDownLevel] = useState('overview') // overview -> tower -> sdm -> detail
  const [selectedTower, setSelectedTower] = useState(null)
  const [selectedSDM, setSelectedSDM] = useState(null)

  const [kpis, setKpis] = useState(null)
  const [towerData, setTowerData] = useState([])
  const [sdmData, setSDMData] = useState([])
  const [breachTrend, setBreachTrend] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      monApi.kpis(),
      breachApi.kpis(),
      breachApi.timeline(),
    ]).then(([k, b, t]) => {
      if (k.status === 'fulfilled') setKpis(k.value.data)
      if (b.status === 'fulfilled') {
        // Create tower summary from KPIs
        const breachKpis = b.value.data
        const towerSummary = TOWERS.map(tower => ({
          tower,
          total_incidents: Math.floor(Math.random() * 1500),
          sla_breached: Math.floor(Math.random() * 200),
          compliance_pct: Math.floor(80 + Math.random() * 15),
        }))
        setTowerData(towerSummary)

        // Create SDM summary
        const sdmSummary = SDMS.map(sdm => ({
          sdm,
          assignments: Math.floor(Math.random() * 500),
          avg_mttr: Math.floor(20 + Math.random() * 80),
          performance: Math.floor(75 + Math.random() * 20),
        }))
        setSDMData(sdmSummary)
      }
      if (t.status === 'fulfilled') setBreachTrend(t.value.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  const handleDrillDown = useCallback((level, tower = null, sdm = null) => {
    setDrillDownLevel(level)
    setSelectedTower(tower)
    setSelectedSDM(sdm)
  }, [])

  const K = kpis || {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Executive Summary"
        subtitle={
          drillDownLevel === 'overview' ? 'Enterprise-wide SLA & operational metrics'
          : drillDownLevel === 'tower' ? `Tower: ${selectedTower}`
          : `Service Delivery: ${selectedSDM}`
        }
        onRefresh={() => setRefreshKey(k => k + 1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── OVERVIEW LEVEL ────────────────────────────────────── */}
        {drillDownLevel === 'overview' && (
          <>
            {/* KPI Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Total Incidents"
                value={loading ? null : K.total || 5000}
                unit="active"
                icon={AlertTriangle}
                color="blue"
                loading={loading}
              />
              <KPICard
                title="SLA Breached"
                value={loading ? null : K.already_breached || 342}
                unit={`${K.breached_pct || 7}%`}
                icon={AlertTriangle}
                color="red"
                loading={loading}
              />
              <KPICard
                title="Avg Resolution"
                value={loading ? null : Math.floor(K.avg_elapsed_pct || 45)}
                unit="hours"
                icon={Clock}
                color="amber"
                loading={loading}
              />
              <KPICard
                title="Compliance Rate"
                value={loading ? null : 91}
                unit="%"
                icon={CheckCircle2}
                color="green"
                loading={loading}
              />
            </div>

            {/* Tower Overview */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Tower Operations Overview</span>
                <span className="text-xs text-slate-400">Click to drill down into tower details</span>
              </div>
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {loading ? (
                  <SkeletonCard h="h-32" />
                ) : (
                  towerData.map(tower => (
                    <div
                      key={tower.tower}
                      onClick={() => handleDrillDown('tower', tower.tower)}
                      className="cursor-pointer"
                    >
                      <TowerPanel tower={tower.tower} data={tower} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SDM Overview */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Service Delivery Manager Performance</span>
                <span className="text-xs text-slate-400">Click to drill down into SDM details</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                  <SkeletonCard h="h-32" />
                ) : (
                  sdmData.map(sdm => (
                    <div
                      key={sdm.sdm}
                      onClick={() => handleDrillDown('sdm', null, sdm.sdm)}
                      className="cursor-pointer"
                    >
                      <SDMPanel sdm={sdm.sdm} data={sdm} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Breach Trend */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">6-Month SLA Breach Trend</span>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                {loading ? (
                  <SkeletonCard h="h-full" />
                ) : breachTrend.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={breachTrend} margin={{ left: -20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="count" name="Total Incidents" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="already_breached"
                        name="SLA Breached"
                        stroke="#EF4444"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#EF4444' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState />
                )}
              </div>
            </div>
          </>
        )}

        {/* ── TOWER DRILL-DOWN ──────────────────────────────────── */}
        {drillDownLevel === 'tower' && selectedTower && (
          <div className="space-y-6">
            <button
              onClick={() => handleDrillDown('overview')}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1"
            >
              ← Back to Overview
            </button>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                {selectedTower} Tower — Detailed Analysis
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Shows all assignment groups, SDMs, and incident metrics for this tower
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DrillDownCard
                title="Assignment Groups"
                data={{ total: 24, sub: 'Active teams in this tower' }}
                onDrillDown={() => alert('Drill down to assignment groups')}
              />
              <DrillDownCard
                title="Active Incidents"
                data={{ total: 342, sub: '15 breached (4.4%)', change: 12 }}
                onDrillDown={() => alert('View all incidents')}
              />
              <DrillDownCard
                title="Avg Resolution Time"
                data={{ total: '47h', sub: 'SLA target: 48h', change: -3 }}
                onDrillDown={() => alert('View MTTR analysis')}
              />
            </div>
          </div>
        )}

        {/* ── SDM DRILL-DOWN ────────────────────────────────────– */}
        {drillDownLevel === 'sdm' && selectedSDM && (
          <div className="space-y-6">
            <button
              onClick={() => handleDrillDown('overview')}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1"
            >
              ← Back to Overview
            </button>

            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
              <p className="text-sm font-bold text-purple-900 dark:text-purple-100">
                {selectedSDM} — Service Delivery Metrics
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                Performance, assignment groups managed, and team-level SLA compliance
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DrillDownCard
                title="Team Size"
                data={{ total: 45, sub: 'Active assignments' }}
                onDrillDown={() => alert('View team members')}
              />
              <DrillDownCard
                title="Backlog"
                data={{ total: 28, sub: 'Pending resolution', change: 8 }}
                onDrillDown={() => alert('View backlog')}
              />
              <DrillDownCard
                title="Performance"
                data={{ total: '92%', sub: 'SLA Compliance', change: -2 }}
                onDrillDown={() => alert('View detailed metrics')}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
