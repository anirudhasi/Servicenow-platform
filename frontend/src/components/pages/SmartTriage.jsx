import { useState, useEffect, useCallback } from 'react'
import {
  Zap, AlertCircle, Tag, BarChart2, Lightbulb,
  Loader2, Info, CheckCircle, Clock, RotateCcw,
  ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Play,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { triage as triageApi } from '../../services/api'
import { usePageMemory } from '../../hooks/usePageMemory'

const DEFAULTS = {
  form: { short_description: '', service_offering: '', priority_hint: '', use_llm: true },
  result: null,
}

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
  const [mem, setMem, clearMemory] = usePageMemory('triage', DEFAULTS)
  const form   = mem.form
  const result = mem.result
  const setForm   = (v) => setMem({ form: typeof v === 'function' ? v(mem.form) : v })
  const setResult = (v) => setMem({ result: v })

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
              {result && (
                <button onClick={() => { clearMemory(); setError(null) }}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors ml-2 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 hover:border-red-300"
                  title="Clear results and start a new search">
                  <RotateCcw size={10} /> New Search
                </button>
              )}
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

        {/* ── P1/P2 Priority Integrity Audit ───────────────────────── */}
        <PriorityAuditPanel />

      </div>
    </div>
  )
}

// ── P1/P2 Priority Integrity Audit Panel ──────────────────────────────────────
const VERDICT_CONFIG = {
  CORRECT:    { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',  icon: ShieldCheck, label: 'Correct' },
  RECLASSIFY: { badge: 'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300', icon: ShieldAlert, label: 'Reclassify' },
}
const P_COLOR_CLS = { 1:'text-red-600 font-black', 2:'text-orange-500 font-bold', 3:'text-amber-600 font-semibold', 4:'text-green-600' }

function PriorityAuditPanel() {
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [audit,    setAudit]    = useState(null)
  const [error,    setError]    = useState(null)
  const [defs,     setDefs]     = useState(null)
  const [showDefs, setShowDefs] = useState(false)

  useEffect(() => {
    triageApi.priorityDefinitions()
      .then(r => setDefs(r.data))
      .catch(() => {})
  }, [])

  const [auditProgress, setAuditProgress] = useState(0)

  const runAudit = async () => {
    setLoading(true); setError(null); setAuditProgress(0)

    // Simulate progress
    const progressInterval = setInterval(() => {
      setAuditProgress(p => Math.min(p + Math.random() * 20, 90))
    }, 200)

    try {
      const r = await triageApi.priorityAudit(20)
      clearInterval(progressInterval)
      setAuditProgress(100)
      setAudit(r.data)
      setTimeout(() => setAuditProgress(0), 500)
    } catch (e) {
      clearInterval(progressInterval)
      setError(e.response?.data?.detail || e.message || 'Audit failed')
      setAuditProgress(0)
    } finally {
      setLoading(false)
    }
  }

  const correctPct     = audit ? Math.round((audit.correctly_classified / audit.total_audited) * 100) : 0
  const reclassifyPct  = audit ? (100 - correctPct) : 0

  return (
    <div className="card">
      <div className="card-header cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-amber-600" />
          <span className="card-title">P1/P2 Priority Integrity Audit</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-semibold">
            SLB SOW compliance
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 hidden md:block">Verify P1/P2 against contractual criteria · LLM-powered</span>
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="p-5 space-y-5 border-t border-slate-100 dark:border-slate-700">

          {/* Contract definitions */}
          <div>
            <button onClick={() => setShowDefs(d => !d)}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              {showDefs ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
              {showDefs ? 'Hide' : 'View'} contractual P1/P2 definitions (SLB SOW)
            </button>
            {showDefs && defs && (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[1,2].map(p => (
                  <div key={p} className={clsx('rounded-xl p-4 border text-xs',
                    p===1 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                           : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20')}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={clsx('text-sm', P_COLOR_CLS[p])}>P{p}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{defs[p]?.label}</span>
                      <span className="ml-auto text-slate-500 text-[10px]">{defs[p]?.response_sla} · {defs[p]?.resolution_sla}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{defs[p]?.criteria}</p>
                    {defs[p]?.disqualifiers?.length > 0 && (
                      <div>
                        <p className="font-semibold text-red-600 dark:text-red-400 mb-1 text-[11px]">Disqualifiers (NOT P{p} if):</p>
                        <ul className="space-y-0.5">
                          {defs[p].disqualifiers.map((d, i) => (
                            <li key={i} className="flex items-start gap-1 text-slate-500 dark:text-slate-400 text-[11px]">
                              <span className="text-red-400 shrink-0">✗</span>{d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run button */}
          <div className="space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={runAudit} disabled={loading} className="btn-primary flex items-center gap-2 shrink-0">
                {loading
                  ? <><Loader2 size={13} className="animate-spin"/> Auditing…</>
                  : <><Play size={13}/> Run Priority Audit (top 20 P1/P2)</>}
              </button>
              <p className="text-xs text-slate-400">
                Samples up to 20 P1/P2 incidents · evaluates against SLB contract criteria
                {audit && <span className="ml-1 font-semibold">{audit.method === 'llm' ? '· LLM verified' : '· Rule-based fallback'}</span>}
              </p>
            </div>

            {/* Progress indicator */}
            {loading && (
              <div className="space-y-2 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Audit Progress</span>
                  <span className="text-xs font-bold text-brand-600">{Math.round(auditProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all"
                    style={{ width: `${auditProgress}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <Loader2 size={10} className="animate-spin" />
                  Evaluating incidents against SLB contract criteria...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</div>
          )}

          {audit && (
            <div className="space-y-4 animate-fade-in">
              {/* Summary stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { l:'Audited',             v: audit.total_audited,                                         cls:'text-slate-800 dark:text-slate-100' },
                  { l:'P1 Reviewed',          v: audit.p1_count,                                              cls:'text-red-600' },
                  { l:'P2 Reviewed',          v: audit.p2_count,                                              cls:'text-orange-500' },
                  { l:'✓ Correct',            v: `${audit.correctly_classified} (${correctPct}%)`,            cls:'text-green-600' },
                  { l:'⚠ Reclassify',        v: `${audit.total_audited-audit.correctly_classified} (${reclassifyPct}%)`, cls: reclassifyPct>30?'text-red-600':'text-amber-600' },
                ].map(({ l, v, cls }) => (
                  <div key={l} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
                    <p className={clsx('text-lg font-black leading-tight', cls)}>{v}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{l}</p>
                  </div>
                ))}
              </div>

              {/* Compliance bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-green-600 font-semibold">{correctPct}% Correctly Classified</span>
                  <span className={clsx('font-semibold', reclassifyPct>30?'text-red-600':'text-amber-600')}>
                    {reclassifyPct}% Reclassification Recommended
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-500 rounded-l-full" style={{ width:`${correctPct}%` }}/>
                  <div className={clsx('h-full rounded-r-full', reclassifyPct>30?'bg-red-500':'bg-amber-500')}
                    style={{ width:`${reclassifyPct}%` }}/>
                </div>
                {reclassifyPct > 30 && (
                  <p className="text-[10px] text-red-600 font-semibold mt-1">
                    ⚠ High reclassification rate detected — over-prioritisation inflates 24×7 support costs and erodes SLA credibility.
                  </p>
                )}
              </div>

              {/* Results table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60">
                    <tr>
                      {['Incident','Description','Current P','Suggested P','Change','Confidence','Verdict','Reasoning'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {audit.audit_results.map((r, i) => {
                      const cfg = VERDICT_CONFIG[r.verdict] || VERDICT_CONFIG.CORRECT
                      const Icon = cfg.icon
                      return (
                        <tr key={i} className={clsx(
                          'transition-colors',
                          r.verdict !== 'CORRECT' ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                        )}>
                          <td className="px-3 py-2 font-mono text-brand-600 dark:text-brand-400 whitespace-nowrap">{r.number}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[180px]">
                            <span className="truncate block" title={r.short_description}>{r.short_description}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={clsx('text-sm', P_COLOR_CLS[r.current_priority])}>P{r.current_priority}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={clsx('text-sm', P_COLOR_CLS[r.suggested_priority])}>P{r.suggested_priority}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded',
                              r.delta < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              r.delta > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400')}>
                              {r.delta < 0 ? `↑${Math.abs(r.delta)} Escalate` : r.delta > 0 ? `↓${r.delta} Downgrade` : '= Correct'}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 rounded-full"
                                  style={{ width:`${Math.round(r.confidence*100)}%` }}/>
                              </div>
                              <span className="text-[10px] text-slate-500">{Math.round(r.confidence*100)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', cfg.badge)}>
                              <Icon size={10}/>{cfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[220px]">
                            <span className="leading-relaxed block text-[11px]">{r.reasoning}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
