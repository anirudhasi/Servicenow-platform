import { useState, useEffect, useCallback } from 'react'
import {
  Activity, AlertCircle, Users, Loader2, Info,
  TrendingUp, Clock, ShieldCheck, ArrowRight,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { routing as routingApi, monitoring as monitoringApi } from '../../services/api'

// ── Priority config ───────────────────────────────────────────────────────────
const PRI = {
  1: 'P1 — Critical', 2: 'P2 — High', 3: 'P3 — Moderate', 4: 'P4 — Standard',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConfidenceGauge({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color =
    pct >= 75 ? 'text-green-600 dark:text-green-400' :
    pct >= 50 ? 'text-amber-600 dark:text-amber-400' :
                'text-red-500 dark:text-red-400'
  const bar =
    pct >= 75 ? 'bg-green-500' :
    pct >= 50 ? 'bg-amber-500' :
                'bg-red-500'
  return (
    <div className="flex flex-col items-center">
      <span className={clsx('text-5xl font-black leading-none', color)}>{pct}%</span>
      <div className="w-28 h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-3">
        <div className={clsx('h-full rounded-full transition-all duration-700', bar)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
        {pct >= 75 ? 'High confidence' : pct >= 50 ? 'Moderate confidence' : 'Low confidence'}
      </span>
    </div>
  )
}

function AlternativeCard({ group, confidence, rank }) {
  const pct = Math.round(confidence * 100)
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-400 mb-0.5">Option #{rank}</p>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight truncate" title={group}>{group}</p>
        </div>
        <span className="text-sm font-black text-slate-600 dark:text-slate-300 shrink-0">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', pct >= 50 ? 'bg-brand-500' : 'bg-slate-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function StatCell({ label, value, icon: Icon, iconColor }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconColor)}>
        <Icon size={14} />
      </div>
      <div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function IntelligentRouting() {
  const [form, setForm] = useState({
    short_description: '',
    service_offering: '',
    category: '',
    priority: '3',
    use_llm: true,
  })
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [categories, setCategories] = useState([])

  // Load category list for dropdown
  useEffect(() => {
    monitoringApi.filters()
      .then(r => setCategories(r.data?.categories || []))
      .catch(() => {})
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!form.short_description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const r = await routingApi.predict({
        short_description: form.short_description.trim(),
        service_offering:  form.service_offering.trim(),
        category:          form.category,
        priority:          parseInt(form.priority),
        use_llm:           form.use_llm,
      })
      setResult(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Prediction failed.')
    } finally {
      setLoading(false)
    }
  }, [form])

  const perf = result?.group_performance || {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M4 Intelligent Routing"
        subtitle="Predict the best assignment group for incoming incidents"
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── Input form ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-brand-600" />
              <span className="card-title">Incident Routing Prediction</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="form-label">Short Description *</label>
              <textarea
                rows={3}
                value={form.short_description}
                onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))}
                placeholder="e.g. VPN client keeps disconnecting after Windows update — affects entire floor"
                className="input-field resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="form-label">Service / Application (optional)</label>
                <input
                  type="text"
                  value={form.service_offering}
                  onChange={e => setForm(f => ({ ...f, service_offering: e.target.value }))}
                  placeholder="Cisco AnyConnect, SAP, SharePoint …"
                  className="input-field"
                />
              </div>
              <div>
                <label className="form-label">Category (optional)</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Auto-detect</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="input-field"
                >
                  {Object.entries(PRI).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, use_llm: !f.use_llm }))}
                  className={clsx(
                    'relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0',
                    form.use_llm ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                    form.use_llm ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">LLM routing explanation</span>
              </label>

              <button
                type="submit"
                disabled={loading || !form.short_description.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Predicting …</>
                  : <><Activity size={13} /> Predict Routing</>
                }
              </button>
            </div>
          </form>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-5 animate-fade-in">

            {/* Primary recommendation */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users size={15} className="text-brand-600" />
                <span className="card-title">Recommended Assignment Group</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-8">
                {/* Group name + confidence */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Best match</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-tight break-words">
                    {result.recommended_group}
                  </p>
                  {result.model_stats?.group_accuracy && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <Info size={10} />
                      Routing model accuracy: {Math.round(result.ml_stats?.group_accuracy * 100)}%
                    </p>
                  )}
                </div>

                {/* Confidence gauge */}
                <div className="shrink-0">
                  <ConfidenceGauge value={result.confidence} />
                </div>

                {/* Group performance stats */}
                {Object.keys(perf).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    <StatCell
                      label="Total incidents" value={perf.total_incidents?.toLocaleString()}
                      icon={BarChart2Icon} iconColor="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    />
                    <StatCell
                      label="Active now" value={perf.active_incidents?.toLocaleString()}
                      icon={Activity} iconColor="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    />
                    <StatCell
                      label="Avg MTTR" value={perf.avg_mttr_hours != null ? `${perf.avg_mttr_hours}h` : null}
                      icon={Clock} iconColor="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    />
                    <StatCell
                      label="SLA compliance" value={perf.sla_compliance != null ? `${Math.round(perf.sla_compliance * 100)}%` : null}
                      icon={ShieldCheck} iconColor="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Alternatives */}
            {result.alternatives?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 px-1">Alternative Groups</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {result.alternatives.slice(0, 4).map((alt, i) => (
                    <AlternativeCard key={i} group={alt.group} confidence={alt.confidence} rank={i + 2} />
                  ))}
                </div>
              </div>
            )}

            {/* LLM Reasoning */}
            {result.reasoning && (
              <div className="card p-5 border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-transparent dark:from-purple-950/30 dark:to-transparent">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-purple-600" />
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">AI Routing Rationale</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{result.reasoning}</p>
              </div>
            )}

          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="card p-12 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40 flex items-center justify-center mb-5">
              <Activity size={32} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-2">Intelligent Incident Routing</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
              Enter an incident description and click <strong>Predict Routing</strong>. The ML model
              analyses the text and recommends the optimal assignment group based on patterns
              learned from thousands of past incidents.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6 text-center">
              {[
                { icon: Users,      label: 'Group Match',   sub: 'Probability ranked' },
                { icon: ShieldCheck,label: 'SLA Stats',     sub: 'Live performance' },
                { icon: ArrowRight, label: 'Reasoning',     sub: 'LLM explanation' },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Icon size={20} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                  <p className="text-[11px] text-slate-400">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Inline icon (BarChart2 not imported above) ────────────────────────────────
function BarChart2Icon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
      <line x1="2"  y1="20" x2="22" y2="20" />
    </svg>
  )
}
