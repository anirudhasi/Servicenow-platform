import { useState, useEffect, useCallback } from 'react'
import {
  Zap, AlertCircle, Tag, BarChart2, Lightbulb,
  Loader2, Info, CheckCircle, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { triage as triageApi } from '../../services/api'

// ── Priority config ───────────────────────────────────────────────────────────
const PRI = {
  1: { label: 'P1-Critical', barColor: 'bg-red-500',    badgeCls: 'badge-p1', ringCls: 'ring-red-300 dark:ring-red-800' },
  2: { label: 'P2-High',     barColor: 'bg-orange-500', badgeCls: 'badge-p2', ringCls: 'ring-orange-300 dark:ring-orange-800' },
  3: { label: 'P3-Moderate', barColor: 'bg-amber-500',  badgeCls: 'badge-p3', ringCls: 'ring-amber-300 dark:ring-amber-800' },
  4: { label: 'P4-Standard', barColor: 'bg-green-500',  badgeCls: 'badge-p4', ringCls: 'ring-green-300 dark:ring-green-800' },
}

const STATE_BADGE = {
  Open: 'badge-open', 'In Progress': 'badge-in-progress',
  'On Hold': 'badge-on-hold', Resolved: 'badge-resolved', Closed: 'badge-closed',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConfidenceBar({ value, colorClass = 'bg-brand-500' }) {
  const pct = Math.round((value || 0) * 100)
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
        <span>Model confidence</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ModelStatPill({ label, value, color }) {
  if (value == null) return null
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
      color
    )}>
      <CheckCircle size={10} />
      {label}: {Math.round(value * 100)}%
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SmartTriage() {
  const [form, setForm] = useState({
    short_description: '',
    service_offering: '',
    priority_hint: '',
    use_llm: true,
  })
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [modelStats, setModelStats] = useState(null)

  useEffect(() => {
    triageApi.modelStats()
      .then(r => setModelStats(r.data))
      .catch(() => {})
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!form.short_description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        short_description: form.short_description.trim(),
        service_offering:  form.service_offering.trim(),
        use_llm:           form.use_llm,
      }
      if (form.priority_hint) payload.priority_hint = parseInt(form.priority_hint)
      const r = await triageApi.predict(payload)
      setResult(r.data)
      if (r.data.ml_stats) setModelStats(r.data.ml_stats)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }, [form])

  const pri = result ? (PRI[result.priority_predicted] || PRI[3]) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M3 Smart Triage"
        subtitle="AI-powered incident auto-classification · ML + LLM"
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── Input form ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-brand-600" />
              <span className="card-title">Analyse Incoming Incident</span>
            </div>
            {modelStats?.status === 'ready' && (
              <div className="flex gap-2 flex-wrap">
                <ModelStatPill label="Category" value={modelStats.category_accuracy} color="bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" />
                <ModelStatPill label="Priority"  value={modelStats.priority_accuracy}  color="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" />
                <ModelStatPill label="Routing"   value={modelStats.group_accuracy}     color="bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" />
              </div>
            )}
            {modelStats?.status === 'training' && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Loader2 size={11} className="animate-spin" /> Training models …
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="form-label">Short Description *</label>
              <textarea
                rows={3}
                value={form.short_description}
                onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))}
                placeholder="e.g. User cannot login to SAP — getting 403 Forbidden error since this morning"
                className="input-field resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Service / Application (optional)</label>
                <input
                  type="text"
                  value={form.service_offering}
                  onChange={e => setForm(f => ({ ...f, service_offering: e.target.value }))}
                  placeholder="SAP, SharePoint, VPN …"
                  className="input-field"
                />
              </div>
              <div>
                <label className="form-label">Priority Hint (optional)</label>
                <select
                  value={form.priority_hint}
                  onChange={e => setForm(f => ({ ...f, priority_hint: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Let AI decide</option>
                  <option value="1">P1 — Critical</option>
                  <option value="2">P2 — High</option>
                  <option value="3">P3 — Moderate</option>
                  <option value="4">P4 — Standard</option>
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, use_llm: !f.use_llm }))}
                    className={clsx(
                      'relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0',
                      form.use_llm ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                    )}
                    aria-pressed={form.use_llm}
                  >
                    <span className={clsx(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                      form.use_llm ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </button>
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-tight">LLM Resolution Hint</p>
                    <p className="text-[10px] text-slate-400 leading-tight">Uses configured AI provider</p>
                  </div>
                </label>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                <Info size={11} />
                <span>
                  {modelStats?.total_incidents
                    ? `Trained on ${modelStats.total_incidents.toLocaleString()} incidents`
                    : 'Loading model info …'}
                </span>
              </div>
              <button
                type="submit"
                disabled={loading || !form.short_description.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Analysing …</>
                  : <><Zap size={13} /> Analyse Incident</>
                }
              </button>
            </div>
          </form>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-5 animate-fade-in">

            {/* Category + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category card */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Tag size={14} className="text-brand-600" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Category Prediction</span>
                </div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight mb-1">
                  {result.category}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Subcategory: <span className="font-semibold text-slate-700 dark:text-slate-200">{result.subcategory}</span>
                </p>
                <ConfidenceBar value={result.confidence_category} colorClass="bg-brand-500" />
              </div>

              {/* Priority card */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle size={14} className="text-slate-500" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Priority Prediction</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ring-4', pri.barColor.replace('bg-', 'bg-').replace('-500', '-100 dark:bg-').concat('dark:bg-opacity-20'), pri.ringCls)}>
                    <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      P{result.priority_predicted}
                    </span>
                  </div>
                  <div>
                    <p className={clsx('badge text-sm', pri.badgeCls)}>{pri.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {result.priority_predicted === 1 ? 'Immediate escalation required' :
                       result.priority_predicted === 2 ? 'High urgency — same-day resolution' :
                       result.priority_predicted === 3 ? 'Resolve within standard SLA' :
                       'Routine — schedule at convenience'}
                    </p>
                  </div>
                </div>
                <ConfidenceBar value={result.confidence_priority} colorClass={pri.barColor} />
              </div>
            </div>

            {/* LLM Resolution Hint */}
            {result.llm_resolution_hint && (
              <div className="card p-5 border-l-4 border-brand-500 bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-950/30 dark:to-transparent">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb size={14} className="text-brand-600" />
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wide">AI Resolution Recommendation</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {result.llm_resolution_hint}
                </p>
              </div>
            )}

            {/* Similar incidents */}
            {result.similar_incidents?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="flex items-center gap-2">
                    <BarChart2 size={14} className="text-slate-500" />
                    <span className="card-title">Similar Past Incidents</span>
                  </div>
                  <span className="text-xs text-slate-400">{result.similar_incidents.length} found via TF-IDF similarity</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60">
                        {['Incident', 'Description', 'Category', 'P', 'State', 'Group', 'MTTR', 'Match'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {result.similar_incidents.map((inc, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{inc.number || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-[220px]">
                            <span className="truncate block" title={inc.description}>{inc.description}</span>
                            {inc.resolution && (
                              <span className="truncate block text-[10px] text-green-600 dark:text-green-400 mt-0.5" title={inc.resolution}>
                                ✓ {inc.resolution}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{inc.category}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={clsx('badge', PRI[inc.priority]?.badgeCls || 'badge-p3')}>P{inc.priority}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={clsx('badge', STATE_BADGE[inc.state] || 'badge')}>{inc.state || '—'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[160px]">
                            <span className="truncate block" title={inc.group}>{inc.group}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {inc.mttr_hours != null ? `${inc.mttr_hours}h` : '—'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round(inc.similarity * 100)}%` }} />
                              </div>
                              <span className="text-[11px] text-slate-500">{Math.round(inc.similarity * 100)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="card p-12 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/40 dark:to-brand-800/40 flex items-center justify-center mb-5">
              <Zap size={32} className="text-brand-600" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-2">AI-Powered Incident Triage</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
              Enter a short description and click <strong>Analyse Incident</strong>. The ML models will
              predict category, subcategory, and priority — and surface the top 5 most similar past
              incidents with their resolutions to guide your team.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6 text-center">
              {[
                { icon: Tag,         label: 'Category',    sub: 'TF-IDF + LinearSVC' },
                { icon: AlertCircle, label: 'Priority',    sub: 'Risk classification' },
                { icon: Clock,       label: 'Similar',     sub: 'Cosine similarity' },
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
