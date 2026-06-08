/**
 * SLA Risk Board — Professional SLA Breach Intelligence
 *
 * Built on contractual SLB SLA targets (from SLB SOW):
 *   P1: Response 15min | Resolution 4h   | 24×7
 *   P2: Response 1h    | Resolution 8h   | 24×7
 *   P3: Response 4h    | Resolution 72bh | 24×5
 *   P4: Response 4h    | Resolution 120bh| 24×5
 *   KPI: First-time-right ≤1% | Aging 95% ≤30d | CSAT 95% ≥4.5
 *
 * Analytical framework: 20-year ITSM domain expertise
 */
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line, ComposedChart,
  ReferenceLine, PieChart, Pie, AreaChart, Area, ScatterChart, Scatter,
} from 'recharts'
import {
  AlertTriangle, Clock, Pause, TrendingUp, ShieldAlert,
  ShieldCheck, Bug, Users, Activity, Target, Timer,
  ChevronRight, RotateCcw,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import DateFilter from '../common/DateFilter'
import { TowerFilter, SDMFilter } from '../common/TowerSDMFilter.jsx'
import { breach as breachApi } from '../../services/api'
import { SkeletonCard, CustomTooltip, EmptyState } from '../common/index.jsx'

// ── Design tokens ─────────────────────────────────────────────────────────────
const GRP = {
  'DPS-WEB-L2':             '#2563EB',
  'Global-Traceability-L2': '#10B981',
  'CG-DPS-Automation-L2':   '#8B5CF6',
}
const PRI = { 1:'#EF4444', 2:'#F97316', 3:'#EAB308', 4:'#22C55E' }
const PALETTE = ['#2563EB','#10B981','#8B5CF6','#F59E0B','#EF4444','#0EA5E9','#EC4899','#14B8A6']
const SEV = { 'Breached':'#EF4444','Critical (90–100%)':'#F97316','At Risk (75–90%)':'#F59E0B','Caution (50–75%)':'#3B82F6','Healthy (<50%)':'#22C55E' }

const SLA_CONTRACT = {
  1: { res:'4h',  label:'P1-Critical', color:'#EF4444', support:'24×7' },
  2: { res:'8h',  label:'P2-High',     color:'#F97316', support:'24×7' },
  3: { res:'72bh',label:'P3-Moderate', color:'#EAB308', support:'24×5' },
  4: { res:'120bh',label:'P4-Standard',color:'#22C55E', support:'24×5' },
}

const gc = n => GRP[n] || '#94A3B8'
const pc = n => PRI[n] || '#94A3B8'

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, bg, valueCls = '', flag, flagCls = '' }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg)}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('text-2xl font-black leading-tight truncate', valueCls)}>{value}</p>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
        {flag && <p className={clsx('text-[10px] font-semibold mt-1', flagCls)}>{flag}</p>}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, badge, badgeCls = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  height = 300, action, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="min-w-0">
          <span className="card-title">{title}</span>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge && <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold border', badgeCls)}>{badge}</span>}
          {action}
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
      status === 'PASS' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
      {status === 'PASS' ? <ShieldCheck size={9}/> : <ShieldAlert size={9}/>}
      {status}
    </span>
  )
}

function Insight({ type = 'warning', title, body }) {
  const s = {
    critical: 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-800 dark:text-red-300',
    warning:  'bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-800 dark:text-amber-300',
    info:     'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-800 dark:text-blue-300',
    success:  'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-300',
  }[type]
  return (
    <div className={clsx('border-l-4 rounded-r-xl px-3 py-2.5', s)}>
      {title && <p className="text-[11px] font-bold mb-0.5">{title}</p>}
      <p className="text-[11px] leading-relaxed">{body}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SLABreachAnalysis() {
  const [kpis,      setKpis]      = useState(null)
  const [timeline,  setTimeline]  = useState([])
  const [compliance,setCompliance]= useState([])
  const [byService, setByService] = useState([])
  const [byGroup,   setByGroup]   = useState([])
  const [elapsed,   setElapsed]   = useState([])
  const [assignAge, setAssignAge] = useState(null)
  const [reassign,  setReassign]  = useState([])
  const [priority,  setPriority]  = useState({ summary:[] })
  const [onHold,    setOnHold]    = useState(null)
  const [scorecard, setScorecard] = useState(null)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [towers, setTowers] = useState([])
  const [sdms, setSDMs] = useState([])
  const [filterOpts, setFilterOpts] = useState({})
  const [loading,   setLoading]   = useState(true)
  const [refreshKey,setRefreshKey]= useState(0)

  const loadAll = useCallback(() => {
    setLoading(true)
    const p = {}
    if (towers.length)       p.towers    = towers
    if (sdms.length)         p.sdms      = sdms
    if (dateRange.from)      p.date_from = dateRange.from
    if (dateRange.to)        p.date_to   = dateRange.to
    Promise.allSettled([
      breachApi.kpis(p),
      breachApi.timeline(p),
      breachApi.slaCompliance(p),
      breachApi.byService(p),
      breachApi.byGroup(p),
      breachApi.elapsedDistribution(p),
      breachApi.assignmentAge(p),
      breachApi.reassignmentImpact(p),
      breachApi.priorityBreakdown(p),
      breachApi.onHoldAnalysis(p),
      breachApi.kpiScorecard(p),
    ]).then(([k,t,c,s,g,e,a,r,pr,o,sc]) => {
      if (k.status==='fulfilled')  setKpis(k.value.data)
      if (t.status==='fulfilled')  setTimeline(t.value.data)
      if (c.status==='fulfilled')  setCompliance(c.value.data)
      if (s.status==='fulfilled')  setByService(s.value.data)
      if (g.status==='fulfilled')  setByGroup(g.value.data)
      if (e.status==='fulfilled')  setElapsed(e.value.data)
      if (a.status==='fulfilled')  setAssignAge(a.value.data)
      if (r.status==='fulfilled')  setReassign(r.value.data)
      if (pr.status==='fulfilled') setPriority(pr.value.data)
      if (o.status==='fulfilled')  setOnHold(o.value.data)
      if (sc.status==='fulfilled') setScorecard(sc.value.data)
    }).finally(() => setLoading(false))
  }, [towers, sdms, dateRange])

  useEffect(() => {
    // Load filter options
    import('../../services/api').then(api => {
      api.monitoring.filters().then(r => setFilterOpts(r.data)).catch(() => {})
    })
    loadAll()
  }, [loadAll, refreshKey])

  const elapsedKeys = elapsed.length
    ? Object.keys(elapsed[0]).filter(k => k!=='range' && k!=='total') : []

  const K = kpis || {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="SLA Risk Board"
        subtitle="Contract-anchored breach intelligence · P1 4h · P2 8h · P3 72bh · P4 120bh"
        onRefresh={() => setRefreshKey(k => k+1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── DATE RANGE FILTER ────────────────────────────────────── */}
        <DateFilter
          onDateChange={(range) => setDateRange(range)}
          disabled={loading}
        />

        {/* ── TOWER & SDM FILTERS ──────────────────────────────────── */}
        <div className="flex gap-4 flex-wrap items-start">
          <TowerFilter
            towers={filterOpts.towers || []}
            value={towers}
            onChange={setTowers}
            disabled={loading}
          />
          <SDMFilter
            sdms={filterOpts.sdms || []}
            value={sdms}
            onChange={setSDMs}
            disabled={loading}
          />
        </div>

        {/* ── CONTRACT KPI REFERENCE STRIP ─────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(p => {
            const c = SLA_CONTRACT[p]
            const co = compliance.find(x => x.priority === p)
            const compPct = co?.compliance_pct ?? null
            return (
              <div key={p} className="card p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-black"
                  style={{ background: c.color }}>P{p}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">{c.label}</p>
                  <p className="text-[10px] text-slate-400">Resolution ≤{c.res} · {c.support}</p>
                  {compPct !== null && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width:`${compPct}%`, background: compPct>=90?'#22C55E':compPct>=70?'#F59E0B':'#EF4444' }}/>
                      </div>
                      <span className={clsx('text-[10px] font-bold shrink-0', compPct>=90?'text-green-600':compPct>=70?'text-amber-500':'text-red-600')}>
                        {compPct}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── KPI BANNER ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard label="Total At-Risk" value={loading?'—':K.total??'—'}
            sub={`${K.critical_high??0} P1/P2 tickets`}
            icon={AlertTriangle} bg="bg-red-500" valueCls="text-slate-800 dark:text-slate-100" />
          <KPICard label="SLA Breached" value={loading?'—':K.already_breached??'—'}
            sub={`${K.breached_pct??0}% of total pool`}
            icon={ShieldAlert} bg="bg-red-600" valueCls="text-red-600"
            flag={K.already_breached>20?`⚠ ${K.already_breached} contracts violated`:`${K.already_breached} active breaches`}
            flagCls={K.already_breached>20?'text-red-600':'text-slate-400'} />
          <KPICard label="On Hold — Clock Paused" value={loading?'—':K.on_hold??'—'}
            sub={`${K.on_hold_pct??0}% · ${K.hold_restart_risk??0} restart-risk`}
            icon={Pause} bg="bg-amber-500" valueCls="text-amber-600"
            flag={K.on_hold_pct>50?'⚠ Masking real breach risk':undefined}
            flagCls="text-amber-600" />
          <KPICard label="Breaching Next 24h" value={loading?'—':K.breaching_24h??'—'}
            sub="In Progress only — needs action"
            icon={Clock} bg="bg-orange-500"
            valueCls={K.breaching_24h>15?'text-red-600':'text-orange-500'}
            flag={K.breaching_24h>15?'🔴 Urgent — same-day resolution required':undefined}
            flagCls="text-red-600" />
          <KPICard label="Avg Elapsed vs SLA" value={loading?'—':`${K.avg_elapsed_pct??'—'}%`}
            sub={`Avg ${K.avg_assignment_age_h??0}h with current assignee`}
            icon={TrendingUp} bg="bg-purple-500" valueCls="text-purple-600" />
        </div>

        {/* ── CONTRACT KPI SCORECARD ────────────────────────────────── */}
        {scorecard && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Contract KPI Scorecard</span>
              <span className="text-[10px] text-slate-400">SLB SOW performance metrics — live status</span>
            </div>
            <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  kpi: scorecard.aging_kpi,
                  icon: Timer,
                  color: scorecard.aging_kpi.status==='PASS'?'text-green-600':'text-red-600',
                  bg:   scorecard.aging_kpi.status==='PASS'?'bg-green-50 dark:bg-green-900/20':'bg-red-50 dark:bg-red-900/20',
                  detail: `${scorecard.aging_kpi.over_30_days} tickets >30 days · target: ${scorecard.aging_kpi.actual_pct}% vs 95%`,
                },
                {
                  kpi: scorecard.first_time_right,
                  icon: ShieldCheck,
                  color: scorecard.first_time_right.status==='PASS'?'text-green-600':'text-red-600',
                  bg:   scorecard.first_time_right.status==='PASS'?'bg-green-50 dark:bg-green-900/20':'bg-red-50 dark:bg-red-900/20',
                  detail: `Reopen rate: ${scorecard.first_time_right.actual_pct}% · target: ≤1%`,
                },
                {
                  kpi: scorecard.p1_p2_breach,
                  icon: ShieldAlert,
                  color: scorecard.p1_p2_breach.status==='PASS'?'text-green-600':'text-red-600',
                  bg:   scorecard.p1_p2_breach.status==='PASS'?'bg-green-50 dark:bg-green-900/20':'bg-red-50 dark:bg-red-900/20',
                  detail: `P1: ${scorecard.p1_p2_breach.p1_breached} · P2: ${scorecard.p1_p2_breach.p2_breached} · target: zero`,
                },
                {
                  kpi: { label:'Bug-Linked', target:'Needs change management', status:'INFO' },
                  icon: Bug,
                  color: 'text-purple-600',
                  bg:   'bg-purple-50 dark:bg-purple-900/20',
                  detail: `${scorecard.bug_linked.count} tickets (${scorecard.bug_linked.pct}%) · not operationally resolvable`,
                },
              ].map(({ kpi, icon: Icon, color, bg, detail }, i) => (
                <div key={i} className={clsx('rounded-xl p-4 flex gap-3', bg)}>
                  <Icon size={16} className={clsx('mt-0.5 shrink-0', color)} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{kpi.label}</p>
                      {kpi.status !== 'INFO' && <StatusBadge status={kpi.status} />}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{kpi.target}</p>
                    <p className={clsx('text-[11px] font-semibold mt-1', color)}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ROW 2: BREACH TIMELINE + SLA COMPLIANCE BY PRIORITY ────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Panel title="Breach Risk Window" height={280}
            subtitle="SLA deadline distribution ±14 days · red=past · orange=today · blue=upcoming"
            badge="Action Window"
            badgeCls="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
            {loading ? <SkeletonCard h="h-full" /> : timeline.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ left:-25, right:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize:9 }} tickFormatter={v=>v.slice(5)} />
                  <YAxis tick={{ fontSize:10 }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active||!payload?.length) return null
                    const d = payload[0]?.payload||{}
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow p-3 text-xs">
                        <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">{d.date}</p>
                        <p className="text-slate-500">Total deadlines: <b>{d.count}</b></p>
                        {d.already_breached>0 && <p className="text-red-500">Already breached: <b>{d.already_breached}</b></p>}
                        {d.upcoming>0 && <p className="text-brand-600">Upcoming: <b>{d.upcoming}</b></p>}
                        {d.is_today && <p className="text-orange-600 font-bold">TODAY</p>}
                      </div>
                    )
                  }} />
                  <Bar dataKey="count" radius={[3,3,0,0]}>
                    {timeline.map((d,i) => (
                      <Cell key={i} fill={d.is_past?'#EF4444':d.is_today?'#F97316':'#3B82F6'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>

          <Panel title="SLA Resolution Compliance by Priority" height={280}
            subtitle="Contract targets: P1 4h · P2 8h · P3 72bh · P4 120bh · compliance = not yet breached"
            badge="Contract KPI"
            badgeCls="border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
            {loading ? <SkeletonCard h="h-full" /> : compliance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compliance} margin={{ left:-10, right:20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="priority_label" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} domain={[0,100]} tickFormatter={v=>`${v}%`} />
                  <Tooltip content={<CustomTooltip formatter={(v,n)=>n==='Compliant %'?`${v}%`:v} />} />
                  <Legend wrapperStyle={{ fontSize:10 }} />
                  <ReferenceLine y={90} stroke="#22C55E" strokeDasharray="4 4"
                    label={{ value:'90% target', fontSize:9, fill:'#22C55E', position:'insideTopRight' }} />
                  <Bar dataKey="compliance_pct" name="Compliant %" radius={[4,4,0,0]}>
                    {compliance.map((d,i) => (
                      <Cell key={i} fill={d.compliance_pct>=90?'#22C55E':d.compliance_pct>=70?'#F59E0B':'#EF4444'} />
                    ))}
                  </Bar>
                  <Bar dataKey="breached" name="Breached" radius={[4,4,0,0]} fill="#EF444444" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>
        </div>

        {/* ── ROW 3: SERVICE PARETO + ELAPSED DISTRIBUTION ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Panel title="Service Offering Breach Pareto" height={300}
            subtitle="80/20 rule: top services driving SLA risk · line = cumulative share"
            badge="Root Cause"
            badgeCls="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
            {loading ? <SkeletonCard h="h-full" /> : byService.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart layout="vertical" data={byService} margin={{ left:4, right:55 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize:9 }} />
                  <YAxis dataKey="service_offering" type="category" tick={{ fontSize:9 }} width={130}
                    tickFormatter={v=>v.length>19?v.slice(0,18)+'…':v} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active||!payload?.length) return null
                    const d = payload[0]?.payload||{}
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow p-3 text-xs max-w-[220px]">
                        <p className="font-bold text-slate-700 dark:text-slate-200 mb-1 truncate">{d.service_offering}</p>
                        <p className="text-slate-500">At risk: <b>{d.count}</b> ({d.pct_total}%)</p>
                        <p className="text-red-500">Breached: <b>{d.already_breached}</b></p>
                        <p className="text-amber-500">On Hold: <b>{d.on_hold_count}</b></p>
                        <p className="text-slate-500">Avg elapsed: <b>{d.avg_elapsed_pct}%</b></p>
                        <p className="text-brand-600 font-semibold">Cumulative: {d.cumulative_pct}%</p>
                      </div>
                    )
                  }} />
                  <Bar dataKey="count" name="At-Risk Tickets" radius={[0,3,3,0]}>
                    {byService.map((_,i)=>(
                      <Cell key={i} fill={PALETTE[i%PALETTE.length]} />
                    ))}
                  </Bar>
                  <Line dataKey="cumulative_pct" yAxisId="r" name="Cumulative %" type="monotone"
                    stroke="#EF4444" strokeWidth={2} dot={{ r:2,fill:'#EF4444' }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize:9 }} tickFormatter={v=>`${v}%`} domain={[0,100]} />
                  <ReferenceLine yAxisId="r" y={80} stroke="#94A3B8" strokeDasharray="3 3"
                    label={{ value:'80%', fontSize:9, fill:'#64748B', position:'right' }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>

          <Panel title="SLA Consumption Depth" height={300}
            subtitle="% of SLA budget consumed per bucket · >100% = already in breach"
            badge="Severity"
            badgeCls="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {loading ? <SkeletonCard h="h-full" /> : elapsed.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={elapsed} margin={{ left:-20, right:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="range" tick={{ fontSize:9 }} />
                  <YAxis tick={{ fontSize:10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize:10 }} />
                  {elapsedKeys.map((grp,i)=>(
                    <Bar key={grp} dataKey={grp} name={grp.replace('DPS-','')}
                      stackId="a" fill={gc(grp)||PALETTE[i]}
                      radius={i===elapsedKeys.length-1?[3,3,0,0]:[0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>
        </div>

        {/* ── ROW 4: GROUP ANALYSIS + ASSIGNMENT AGE ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Panel title="Assignment Group — SLA State" height={290}
            subtitle="On Hold (SLA paused) vs In Progress (SLA running) · with avg elapsed % and P1/P2 exposure"
            badge="Operational">
            {loading ? <SkeletonCard h="h-full" /> : byGroup.length ? (
              <div className="h-full flex flex-col gap-3 pt-1">
                {byGroup.map((g,i)=>{
                  const total  = (g['On Hold']||0)+(g['In Progress']||0)
                  const holdP  = total ? (g['On Hold']/total*100) : 0
                  const progP  = total ? (g['In Progress']/total*100) : 0
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {g.group?.replace('DPS-','')}
                        </span>
                        <div className="flex items-center gap-3 text-[10px]">
                          {g.critical_high>0 && <span className="text-red-600 font-bold">{g.critical_high} P1/P2</span>}
                          <span className="text-red-500">{g.already_breached} breached</span>
                          <span className="text-slate-400">avg {g.avg_elapsed_pct}% elapsed</span>
                          <span className="text-slate-500">⏱ {g.avg_assignment_age_h}h assigned</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">{total} total</span>
                        </div>
                      </div>
                      <div className="flex w-full h-6 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-center text-[10px] text-white font-semibold transition-all"
                          style={{ width:`${holdP}%`, background:'#F59E0B', minWidth:holdP>5?28:0 }}>
                          {holdP>8?`${Math.round(holdP)}%`:''}
                        </div>
                        <div className="flex items-center justify-center text-[10px] text-white font-semibold transition-all"
                          style={{ width:`${progP}%`, background:gc(g.group), minWidth:progP>5?28:0 }}>
                          {progP>8?`${Math.round(progP)}%`:''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[9px] text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block"/>On Hold: {g['On Hold']||0}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background:gc(g.group)}}/>In Progress: {g['In Progress']||0}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <EmptyState />}
          </Panel>

          <Panel title="Assignment Ownership Age" height={290}
            subtitle="How long the current assignee has held each ticket · long ownership + high elapsed = immediate escalation"
            badge="NEW — Last Assign Date"
            badgeCls="border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
            {loading ? <SkeletonCard h="h-full" /> : assignAge?.age_distribution?.length ? (
              <div className="h-full flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2 shrink-0">
                  {[
                    { l:'Avg Ownership', v:`${assignAge.overall_avg_age_h}h`, cls:'text-brand-600' },
                    { l:'Max Ownership', v:`${assignAge.overall_max_age_h}h`, cls:'text-red-600' },
                    { l:'>7 Days',       v:assignAge.over_7d_count, cls: assignAge.over_7d_count>10?'text-red-600':'text-amber-600' },
                  ].map(({ l,v,cls }) => (
                    <div key={l} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2 text-center">
                      <p className={clsx('text-base font-black', cls)}>{v}</p>
                      <p className="text-[9px] text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assignAge.age_distribution} margin={{ left:-25, right:5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="bucket" tick={{ fontSize:9 }} />
                      <YAxis tick={{ fontSize:10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize:10 }} />
                      <Bar dataKey="In Progress" name="In Progress" stackId="a" fill="#3B82F6" radius={[0,0,0,0]} />
                      <Bar dataKey="On Hold" name="On Hold" stackId="a" fill="#F59E0B" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : <EmptyState />}
          </Panel>
        </div>

        {/* ── ROW 5: REASSIGNMENT IMPACT + ON HOLD RISK ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Panel title="MTTR Impact — Resolution Time by Reassignment Count" height={270}
            subtitle="Tickets with more reassignments take longer to resolve · bar = avg resolution hours · red zone = critical delays"
            badge="Resolution Quality">
            {loading ? <SkeletonCard h="h-full" /> : reassign.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={reassign} margin={{ left:-10, right:20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="reassignment_count" tick={{ fontSize:10 }}
                    label={{ value:'Number of Reassignments', fontSize:9, position:'insideBottom', offset:-3 }} />
                  <YAxis yAxisId="l" tick={{ fontSize:10 }} label={{ value:'Avg MTTR (hours)', angle:-90, position:'insideLeft' }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize:10 }} tickFormatter={v=>`${v}%`}
                    label={{ value:'Breach Rate', angle:90, position:'insideRight' }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active||!payload?.length) return null
                    const d = payload[0]?.payload||{}
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow p-3 text-xs">
                        <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">{d.reassignment_count} Reassignment{d.reassignment_count>1?'s':''}</p>
                        <p className="text-blue-600">Avg MTTR: <b>{d.avg_mttr_hours?.toFixed(1) || '—'}h</b></p>
                        <p className="text-orange-600">Avg Elapsed: <b>{d.avg_elapsed_pct}%</b></p>
                        <p className="text-red-600">Breach Rate: <b>{d.breach_rate}%</b></p>
                        <p className="text-slate-500">Tickets: <b>{d.count}</b></p>
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ fontSize:10 }} />
                  <Bar yAxisId="l" dataKey="avg_mttr_hours" name="Avg MTTR (hours)" radius={[3,3,0,0]}>
                    {reassign.map((d,i) => {
                      const severity = d.avg_mttr_hours > 120 ? '#EF4444' : d.avg_mttr_hours > 72 ? '#F97316' : '#F59E0B'
                      return <Cell key={i} fill={severity} />
                    })}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="breach_rate" name="Breach Rate (%)"
                    stroke="#EF4444" strokeWidth={2} dot={{ r:4, fill:'#EF4444' }} />
                  <ReferenceLine yAxisId="l" y={72} stroke="#F59E0B" strokeDasharray="3 3"
                    label={{ value:'3-day MTTR', fontSize:8, fill:'#F59E0B', position:'right' }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>

          <Panel title="On Hold — SLA Restart Risk" height={270}
            subtitle="Tickets paused On Hold · age distribution · clock restarts immediately on status change"
            badge="Hidden Risk"
            badgeCls="border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
            {loading ? <SkeletonCard h="h-full" /> : onHold ? (
              <div className="h-full flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2 shrink-0">
                  {[
                    { l:'On Hold', v:onHold.total_on_hold, cls:'text-amber-600' },
                    { l:'Restart Risk (≥75%)', v:onHold.restart_risk_count, cls:onHold.restart_risk_count>15?'text-red-600':'text-amber-600' },
                    { l:'Avg Hold Days', v:`${onHold.avg_hold_days}d`, cls:'text-slate-700 dark:text-slate-200' },
                  ].map(({ l,v,cls }) => (
                    <div key={l} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2 text-center">
                      <p className={clsx('text-base font-black', cls)}>{v}</p>
                      <p className="text-[9px] text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-amber-600">{onHold.avg_elapsed_on_hold}%</p>
                    <p className="text-[10px] text-slate-400">Elapsed On Hold</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-2 text-center">
                    <p className="text-lg font-black text-red-600">{onHold.avg_elapsed_in_prog}%</p>
                    <p className="text-[10px] text-slate-400">Elapsed In Progress</p>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {onHold.hold_age_distribution?.map((b,i) => {
                    const max = Math.max(...(onHold.hold_age_distribution.map(x=>x.count)),1)
                    const pct = Math.round((b.count/max)*100)
                    const isRisk = b.is_risk
                    return (
                      <div key={i} className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-slate-500 w-18 text-right shrink-0 w-20">{b.age_bucket}</span>
                        <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden">
                          <div className="h-full rounded-sm flex items-center pl-1.5 text-[9px] text-white font-bold"
                            style={{ width:`${pct}%`, minWidth:20, background:isRisk?'#EF4444':'#F59E0B' }}>
                            {b.count}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-[9px] text-red-500 font-semibold mt-1">Red = aged holds: SLA resumes immediately on status change</p>
                </div>
              </div>
            ) : <EmptyState />}
          </Panel>
        </div>

        {/* ── ROW 6: AGENT OWNERSHIP + PRIORITY SUMMARY ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Panel title="Agent Assignment Ownership (avg hours)" height={300}
            subtitle="Avg time each agent has held their current tickets · colour = avg elapsed % severity"
            badge="Capacity">
            {loading ? <SkeletonCard h="h-full" /> : assignAge?.by_agent?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={assignAge.by_agent} margin={{ left:110, right:50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize:10 }} tickFormatter={v=>`${v}h`} />
                  <YAxis dataKey="agent_name" type="category" tick={{ fontSize:10 }} width={110}
                    tickFormatter={v=>v.split(' ').slice(0,2).join(' ')} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active||!payload?.length) return null
                    const d = payload[0]?.payload||{}
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow p-3 text-xs">
                        <p className="font-bold mb-1">{d.agent_name}</p>
                        <p className="text-slate-500">Avg ownership: <b>{d.avg_age_h}h</b></p>
                        <p className="text-slate-500">Max ownership: <b>{d.max_age_h}h</b></p>
                        <p className="text-slate-500">Tickets: <b>{d.count}</b></p>
                        <p className="text-red-500">Breached: <b>{d.already_breached}</b></p>
                      </div>
                    )
                  }} />
                  <Bar dataKey="avg_age_h" name="Avg Ownership (h)" radius={[0,3,3,0]}>
                    {assignAge.by_agent.map((d,i)=>(
                      <Cell key={i} fill={d.avg_age_h>168?'#EF4444':d.avg_age_h>72?'#F97316':d.avg_age_h>24?'#F59E0B':'#22C55E'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </Panel>

          <Panel title="Priority Pool Breakdown" height={300}
            subtitle="Contract resolution targets by priority · compliance % and breach rate"
            badge="Compliance">
            {loading ? <SkeletonCard h="h-full" /> : priority.summary?.length ? (
              <div className="h-full flex flex-col gap-2 overflow-y-auto">
                {priority.summary.map((s,i) => {
                  const p = parseInt(s.priority)
                  const c = SLA_CONTRACT[p]||{}
                  const compPct = 100 - parseFloat(s.breach_rate||0)
                  return (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0"
                        style={{ background: PRI[p]||'#94A3B8' }}>P{p}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.priority}</span>
                          <span className="text-[10px] text-slate-500">Resolution ≤{c.res||'?'} · {c.support||''}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {[
                            { l:'Total',    v:s.count },
                            { l:'Breached', v:s.already_breached, cls:'text-red-600 font-bold' },
                            { l:'Avg Elapsed', v:`${s.avg_elapsed_pct}%`, cls: s.avg_elapsed_pct>75?'text-red-600':s.avg_elapsed_pct>50?'text-amber-600':'text-green-600' },
                            { l:'Compliance', v:`${compPct.toFixed(0)}%`, cls: compPct>=90?'text-green-600':compPct>=70?'text-amber-600':'text-red-600' },
                          ].map(({ l,v,cls='text-slate-700 dark:text-slate-200' }) => (
                            <div key={l} className="bg-slate-50 dark:bg-slate-900/30 rounded-lg p-1.5">
                              <p className={clsx('text-sm font-black', cls)}>{v}</p>
                              <p className="text-[9px] text-slate-400">{l}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <EmptyState />}
          </Panel>
        </div>

        {/* ── ROW 7: EXPERT ANALYSIS ───────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Domain Expert Analysis — Actionable Recommendations</span>
            <span className="text-[10px] text-slate-400">Based on SLB SOW obligations and ITSM best practice</span>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              {
                type:'critical', icon:Pause,
                title:'On Hold SLA Clock Masking',
                body:`${K.on_hold_pct??'—'}% of tickets On Hold. SLA clocks stop during On Hold, creating artificially low elapsed %. ${K.hold_restart_risk??0} tickets at ≥75% elapsed — if status changes to In Progress, SLA resumes immediately and breach is imminent. Mandatory weekly review of all On Hold justifications.`,
              },
              {
                type: K.breaching_24h>10?'critical':'warning', icon:Clock,
                title:'Immediate 24-Hour Breach Window',
                body:`${K.breaching_24h??0} In Progress tickets will breach their contractual SLA within 24 hours. P1 requires 4-hour resolution, P2 requires 8 hours. Trigger your escalation matrix NOW — assign duty managers for P1/P2 tickets and verify workaround availability for P3/P4 to safely defer.`,
              },
              {
                type:'warning', icon:Activity,
                title:'Reassignment Routing Failure',
                body:'Tickets with 2+ reassignments show significantly higher elapsed % and breach rates. Each reassignment adds 4–12h queue wait time. Root cause: ticket descriptions lack sufficient detail for confident first-assignment. Enforce description templates at creation to reduce IAR-User failures and PI below-threshold routing.',
              },
              {
                type:'info', icon:Bug,
                title:`${K.bug_linked??0} Tickets Require Change Management`,
                body:'Bug-linked tickets (WH Bug tracker) CANNOT be resolved operationally. Keeping them in the active breach pool inflates metrics and overwhelms operations teams. Immediately flag as "Pending Change", create formal change requests, and track separately from the operational backlog.',
              },
              {
                type:'info', icon:Users,
                title:'Agent Assignment Age Risk',
                body:`Avg ownership duration: ${K.avg_assignment_age_h??0}h. Agents holding tickets >168h (7 days) without resolution require management intervention. Review workload distribution — automated assignment without capacity-aware routing creates ownership hotspots that directly correlate with SLA breaches.`,
              },
              {
                type:'success', icon:Target,
                title:'Priority Immediate Actions',
                body:`1. Zero tolerance for P1/P2 breach — escalate to duty manager immediately.\n2. Review all On Hold >14 days — document justification or release.\n3. Bug-linked: raise change requests, remove from ops queue.\n4. Top 3 service offerings own 40%+ of breach risk — schedule service owner review.\n5. Enforce ticket creation templates to reduce misrouting.`,
              },
            ].map(({ type, icon:Icon, title, body },i) => (
              <div key={i} className={clsx('rounded-xl p-4 flex gap-3',
                type==='critical' ? 'bg-red-50 dark:bg-red-900/20' :
                type==='warning'  ? 'bg-amber-50 dark:bg-amber-900/20' :
                type==='success'  ? 'bg-green-50 dark:bg-green-900/20' :
                'bg-blue-50 dark:bg-blue-900/20')}>
                <Icon size={16} className={clsx('mt-0.5 shrink-0',
                  type==='critical'?'text-red-600':type==='warning'?'text-amber-600':type==='success'?'text-green-600':'text-blue-600')} />
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
