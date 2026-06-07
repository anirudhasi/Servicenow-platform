/**
 * Tower vs SDM Comparison Dashboard
 * Comparative analysis and performance metrics across organizational hierarchy
 */
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Building2, Users, TrendingUp, Award, AlertCircle, Zap,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { monitoring as monApi, breach as breachApi } from '../../services/api'
import { KPICard, SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'

const TOWER_COLORS = {
  'A&I': '#2563EB',
  'D&A': '#10B981',
  'DES': '#8B5CF6',
  'SAP': '#F59E0B',
}

const SDM_COLORS = [
  '#2563EB', '#10B981', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#14B8A6', '#F97316',
]

function ComparisonMetricCard({ title, towers, sdms, metric }) {
  const towerAvg = towers.length ? (towers.reduce((a, b) => a + (b[metric] || 0), 0) / towers.length).toFixed(1) : '—'
  const sdmAvg = sdms.length ? (sdms.reduce((a, b) => a + (b[metric] || 0), 0) / sdms.length).toFixed(1) : '—'

  return (
    <div className="card p-4">
      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-blue-600 dark:text-blue-300">Towers</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-200 mt-1">{towerAvg}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-green-600 dark:text-green-300">SDMs</p>
          <p className="text-xl font-black text-green-700 dark:text-green-200 mt-1">{sdmAvg}</p>
        </div>
      </div>
    </div>
  )
}

export default function TowerSDMComparison() {
  const [towers, setTowers] = useState([])
  const [sdms, setSDMs] = useState([])
  const [towerTrend, setTowerTrend] = useState([])
  const [sdmTrend, setSDMTrend] = useState([])
  const [radarData, setRadarData] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      monApi.filters(),
      breachApi.kpis(),
      breachApi.timeline(),
    ]).then(([filters, kpis, timeline]) => {
      if (filters.status === 'fulfilled') {
        const f = filters.value.data

        // Create mock tower comparison data
        const towerData = (f.towers || []).map(t => ({
          name: t,
          incidents: Math.floor(Math.random() * 2000),
          sla_compliance: Math.floor(80 + Math.random() * 15),
          avg_mttr: Math.floor(30 + Math.random() * 60),
          p1_breached: Math.floor(Math.random() * 20),
          performance: Math.floor(75 + Math.random() * 20),
          color: TOWER_COLORS[t],
        }))
        setTowers(towerData)

        // Create mock SDM comparison data
        const sdmData = (f.sdms || []).map((s, i) => ({
          name: s,
          incidents: Math.floor(Math.random() * 1500),
          sla_compliance: Math.floor(80 + Math.random() * 15),
          avg_mttr: Math.floor(20 + Math.random() * 70),
          assignments: Math.floor(100 + Math.random() * 500),
          performance: Math.floor(70 + Math.random() * 25),
          color: SDM_COLORS[i % SDM_COLORS.length],
        }))
        setSDMs(sdmData)

        // Create radar data for comparison
        setRadarData([
          {
            metric: 'SLA Compliance',
            towers: towerData.length ? (towerData.reduce((a, b) => a + b.sla_compliance, 0) / towerData.length).toFixed(0) : 0,
            sdms: sdmData.length ? (sdmData.reduce((a, b) => a + b.sla_compliance, 0) / sdmData.length).toFixed(0) : 0,
          },
          {
            metric: 'Performance',
            towers: towerData.length ? (towerData.reduce((a, b) => a + b.performance, 0) / towerData.length).toFixed(0) : 0,
            sdms: sdmData.length ? (sdmData.reduce((a, b) => a + b.performance, 0) / sdmData.length).toFixed(0) : 0,
          },
          {
            metric: 'Efficiency',
            towers: 75,
            sdms: 72,
          },
        ])

        // Create trend data
        setTowerTrend(towerData.sort((a, b) => b.incidents - a.incidents))
        setSDMTrend(sdmData.sort((a, b) => b.incidents - a.incidents))
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Tower vs SDM Comparison"
        subtitle="Performance metrics · Incident distribution · Service delivery analysis"
        onRefresh={() => setRefreshKey(k => k + 1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── SUMMARY METRICS ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComparisonMetricCard
            title="SLA Compliance %"
            towers={towers}
            sdms={sdms}
            metric="sla_compliance"
          />
          <ComparisonMetricCard
            title="Avg MTTR (hours)"
            towers={towers}
            sdms={sdms}
            metric="avg_mttr"
          />
          <ComparisonMetricCard
            title="Performance Score"
            towers={towers}
            sdms={sdms}
            metric="performance"
          />
        </div>

        {/* ── RADAR COMPARISON ────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Overall Performance Radar</span>
            <span className="text-xs text-slate-400">Tower vs SDM capabilities comparison</span>
          </div>
          <div className="p-4" style={{ height: 350 }}>
            {loading ? (
              <SkeletonCard h="h-full" />
            ) : radarData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar name="Towers" dataKey="towers" stroke="#2563EB" fill="#2563EB" fillOpacity={0.4} />
                  <Radar name="SDMs" dataKey="sdms" stroke="#10B981" fill="#10B981" fillOpacity={0.4} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* ── TOWER BREAKDOWN ─────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title flex items-center gap-2">
              <Building2 size={16} /> Tower Performance Breakdown
            </span>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <SkeletonCard h="h-40" />
            ) : towers.length ? (
              <>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={towers} margin={{ left: -20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="sla_compliance" name="SLA %" fill="#2563EB" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="performance" name="Performance %" fill="#10B981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  {towers.map(t => (
                    <div key={t.name} className="bg-slate-50 dark:bg-slate-900/30 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.color }} />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t.incidents} incidents · {t.sla_compliance}% SLA
                        </p>
                      </div>
                      <span className={clsx('text-sm font-bold', t.performance >= 80 ? 'text-green-600' : t.performance >= 70 ? 'text-amber-600' : 'text-red-600')}>
                        {t.performance}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* ── SDM BREAKDOWN ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title flex items-center gap-2">
              <Users size={16} /> SDM Performance Breakdown
            </span>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <SkeletonCard h="h-40" />
            ) : sdms.length ? (
              <>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sdms} margin={{ left: -20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="sla_compliance" name="SLA %" fill="#10B981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="performance" name="Performance %" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                  {sdms.slice(0, 4).map(s => (
                    <div key={s.name} className="flex-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2 text-center text-xs">
                      <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.incidents} incidents</p>
                      <p className={clsx('text-sm font-bold mt-0.5', s.performance >= 80 ? 'text-green-600' : 'text-amber-600')}>
                        {s.performance}%
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
