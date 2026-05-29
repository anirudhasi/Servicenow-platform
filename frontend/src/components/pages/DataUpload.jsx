import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Loader2, Trash2, Database,
  Plus, Minus, ArrowRight, RotateCcw, FileSpreadsheet,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { upload as uploadApi } from '../../services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => (n ?? 0).toLocaleString()
const ACCEPTED = '.csv,.xlsx,.xls,.xlsm'

function Badge({ count, color, label }) {
  if (!count) return null
  const cls = {
    green:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    red:    'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400',
    amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue:   'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-400',
    slate:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  }[color] || 'bg-slate-100 text-slate-600'
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold', cls)}>
      {count} {label}
    </span>
  )
}

function ColTag({ col, type }) {
  const cfg = {
    kept:    { cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', icon: null },
    added:   { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: Plus },
    dropped: { cls: 'bg-red-100   dark:bg-red-900/30   text-red-700   dark:text-red-400',   icon: Minus },
  }[type]
  const Icon = cfg?.icon
  return (
    <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold', cfg?.cls)}>
      {Icon && <Icon size={8} />}{col}
    </span>
  )
}

// ── File card (pre-upload) ────────────────────────────────────────────────────
function FilePill({ file, onRemove }) {
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(file.name)
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      {isExcel
        ? <FileSpreadsheet size={16} className="text-green-600 shrink-0" />
        : <FileText       size={16} className="text-blue-600  shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
        <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
      </div>
      <button onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
        <XCircle size={15} />
      </button>
    </div>
  )
}

// ── Per-file result card ──────────────────────────────────────────────────────
function FileResult({ detail }) {
  const [open, setOpen] = useState(true)
  if (detail.error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20">
          <XCircle size={16} className="text-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-300 flex-1">{detail.filename}</span>
          <span className="text-xs text-red-500">{detail.error}</span>
        </div>
      </div>
    )
  }

  const hasIssues = detail.columns_added?.length || detail.columns_dropped?.length ||
                    detail.warnings?.length || detail.internal_duplicates?.length ||
                    detail.existing_duplicates?.length

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden',
      hasIssues
        ? 'border-amber-200 dark:border-amber-700'
        : 'border-green-200 dark:border-green-800'
    )}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          hasIssues
            ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30'
            : 'bg-green-50  dark:bg-green-900/20  hover:bg-green-100/60  dark:hover:bg-green-900/30'
        )}
      >
        {hasIssues
          ? <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          : <CheckCircle2  size={15} className="text-green-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{detail.filename}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge count={detail.rows_in_file}             color="blue"  label="rows read" />
            <Badge count={detail.columns_added?.length}    color="amber" label="cols added" />
            <Badge count={detail.columns_dropped?.length}  color="red"   label="cols dropped" />
            <Badge count={detail.internal_duplicates?.length} color="red" label="internal dupes" />
            <Badge count={detail.existing_duplicates?.length} color="amber" label="already in DB" />
            <Badge count={detail.net_new_rows}             color="green" label="net new rows" />
          </div>
        </div>
        {open ? <ChevronUp size={14} className="shrink-0 text-slate-400" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 py-4 space-y-4 border-t border-slate-200 dark:border-slate-700">

          {/* Column audit */}
          {(detail.columns_added?.length > 0 || detail.columns_dropped?.length > 0 || detail.columns_kept?.length > 0) && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Column Audit</p>
              <div className="space-y-2">
                {detail.columns_kept?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">Kept ({detail.columns_kept.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.columns_kept.map(c => <ColTag key={c} col={c} type="kept" />)}
                    </div>
                  </div>
                )}
                {detail.columns_added?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-amber-500 font-semibold mb-1">Added with defaults ({detail.columns_added.length}) — these were missing in your file</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.columns_added.map(c => <ColTag key={c} col={c} type="added" />)}
                    </div>
                  </div>
                )}
                {detail.columns_dropped?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-red-500 font-semibold mb-1">Dropped ({detail.columns_dropped.length}) — not in canonical schema</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.columns_dropped.map(c => <ColTag key={c} col={c} type="dropped" />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warnings */}
          {detail.warnings?.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 px-3 py-2.5 space-y-1">
              <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-1">Data Warnings</p>
              {detail.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />{w}
                </p>
              ))}
            </div>
          )}

          {/* Deduplication */}
          {(detail.internal_duplicates?.length > 0 || detail.existing_duplicates?.length > 0) && (
            <div className="space-y-2">
              {detail.internal_duplicates?.length > 0 && (
                <div>
                  <p className="text-[10px] text-red-500 font-semibold mb-1">
                    {detail.internal_duplicates.length} duplicate(s) within this file — only the last occurrence kept
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detail.internal_duplicates.slice(0, 20).map(n => (
                      <span key={n} className="font-mono text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">{n}</span>
                    ))}
                    {detail.internal_duplicates.length > 20 && (
                      <span className="text-[10px] text-slate-400 self-center">+{detail.internal_duplicates.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
              {detail.existing_duplicates?.length > 0 && (
                <div>
                  <p className="text-[10px] text-amber-600 font-semibold mb-1">
                    {detail.existing_duplicates.length} row(s) already in the database — will be skipped
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detail.existing_duplicates.slice(0, 20).map(n => (
                      <span key={n} className="font-mono text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">{n}</span>
                    ))}
                    {detail.existing_duplicates.length > 20 && (
                      <span className="text-[10px] text-slate-400 self-center">+{detail.existing_duplicates.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Preview table ─────────────────────────────────────────────────────────────
function PreviewTable({ rows }) {
  if (!rows?.length) return null
  const cols = Object.keys(rows[0]).slice(0, 8)  // first 8 columns to keep table readable
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            {cols.map(c => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{c}</th>
            ))}
            {Object.keys(rows[0]).length > 8 && (
              <th className="px-3 py-2 text-slate-400 text-left">+{Object.keys(rows[0]).length - 8} more cols</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
              {cols.map(c => (
                <td key={c} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[180px] truncate" title={String(row[c] ?? '')}>
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const STEP = { idle: 0, previewing: 1, reviewed: 2, committing: 3, done: 4 }

export default function DataUpload() {
  const [files, setFiles]         = useState([])
  const [step, setStep]           = useState(STEP.idle)
  const [preview, setPreview]     = useState(null)
  const [error, setError]         = useState(null)
  const [committed, setCommitted] = useState(null)
  const [dragging, setDragging]   = useState(false)
  const inputRef = useRef(null)

  // ── File management ─────────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles) => {
    const allowed = ['csv','xlsx','xls','xlsm']
    const valid   = Array.from(newFiles).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase()
      return allowed.includes(ext)
    })
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !names.has(f.name))]
    })
    setStep(STEP.idle)
    setPreview(null)
    setError(null)
  }, [])

  const removeFile = (name) => setFiles(fs => fs.filter(f => f.name !== name))

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  // ── Preview ─────────────────────────────────────────────────────────────────
  const runPreview = async () => {
    if (!files.length) return
    setStep(STEP.previewing)
    setError(null)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const res = await uploadApi.preview(fd)
      setPreview(res.data)
      setStep(STEP.reviewed)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Preview failed.')
      setStep(STEP.idle)
    }
  }

  // ── Commit ──────────────────────────────────────────────────────────────────
  const runCommit = async () => {
    if (!preview?.session_id) return
    setStep(STEP.committing)
    try {
      const res = await uploadApi.commit({ session_id: preview.session_id })
      setCommitted(res.data)
      setStep(STEP.done)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Commit failed.')
      setStep(STEP.reviewed)
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    if (preview?.session_id) {
      uploadApi.cancelSession(preview.session_id).catch(() => {})
    }
    setFiles([]); setStep(STEP.idle); setPreview(null)
    setError(null); setCommitted(null)
  }

  const isLoading = step === STEP.previewing || step === STEP.committing

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M7 Data Upload"
        subtitle="Upload CSV or Excel incident files — sanitise, deduplicate, and merge into the knowledge base"
        loading={isLoading}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">

        {/* ── Step indicator ────────────────────────────────────────────── */}
        <div className="flex items-center gap-0">
          {['Select Files', 'Preview & Audit', 'Confirm Merge'].map((label, i) => {
            const active  = i === 0 ? step < STEP.reviewed : i === 1 ? step === STEP.reviewed : step >= STEP.done
            const past    = i === 0 ? step >= STEP.reviewed : i === 1 ? step >= STEP.done : false
            return (
              <div key={label} className="flex items-center flex-1">
                <div className={clsx('flex items-center gap-2',
                  i > 0 && 'flex-1 justify-center',
                  i === 2 && 'justify-end',
                )}>
                  {i > 0 && <div className={clsx('h-px flex-1', past || active ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700')} />}
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                    past   ? 'bg-green-500 text-white' :
                    active ? 'bg-brand-600 text-white' :
                             'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  )}>
                    {past ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={clsx('text-xs font-semibold hidden sm:block ml-1',
                    active ? 'text-brand-600' : past ? 'text-green-600' : 'text-slate-400'
                  )}>{label}</span>
                  {i < 2 && <div className={clsx('h-px flex-1 ml-2', past ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700')} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Done banner ───────────────────────────────────────────────── */}
        {step === STEP.done && committed && (
          <div className="card p-6 border-l-4 border-green-500 bg-gradient-to-r from-green-50 to-transparent dark:from-green-950/30 dark:to-transparent">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 size={22} className="text-green-500" />
              <h3 className="text-base font-bold text-green-700 dark:text-green-300">Upload Successful</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>{fmt(committed.rows_written)}</strong> new incidents have been merged into the database.
              The ML models are retraining in the background.
            </p>
            <button onClick={reset} className="mt-4 btn-primary flex items-center gap-2">
              <RotateCcw size={13} /> Upload More Files
            </button>
          </div>
        )}

        {/* ── File drop zone ────────────────────────────────────────────── */}
        {step < STEP.done && (
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Upload size={15} className="text-brand-600" />
                <span className="card-title">Select Incident Files</span>
              </div>
              <span className="text-xs text-slate-400">CSV or Excel (.xlsx / .xls) · up to 10 files at once</span>
            </div>

            {/* Drop target */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'mx-5 mb-5 border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors',
                dragging
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/40 dark:to-brand-800/40 flex items-center justify-center mb-4">
                <Upload size={24} className="text-brand-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {dragging ? 'Release to add files' : 'Drag & drop files here'}
              </p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              <p className="text-[10px] text-slate-400 mt-3">Supported: CSV, XLSX, XLS — max 10 files per session</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mx-5 mb-5 space-y-2">
                {files.map(f => (
                  <FilePill key={f.name} file={f} onRemove={() => removeFile(f.name)} />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 mb-5 flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="px-5 pb-5 flex items-center justify-between">
              {files.length > 0 && (
                <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1.5 text-slate-500">
                  <Trash2 size={12} /> Clear all
                </button>
              )}
              <button
                onClick={runPreview}
                disabled={!files.length || isLoading}
                className="ml-auto btn-primary flex items-center gap-2"
              >
                {step === STEP.previewing
                  ? <><Loader2 size={13} className="animate-spin" /> Analysing…</>
                  : <><Database size={13} /> Preview &amp; Audit</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Audit results ─────────────────────────────────────────────── */}
        {preview && step >= STEP.reviewed && step < STEP.done && (
          <div className="space-y-5">

            {/* Combined summary banner */}
            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Database size={15} className="text-brand-600" />
                Combined Upload Summary — {preview.files_processed} file(s) processed
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Rows Received',   value: fmt(preview.total_rows_received), color: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Internal Dupes',  value: fmt(preview.internal_duplicates),  color: 'text-red-600',   bg: 'bg-red-50   dark:bg-red-900/20'  },
                  { label: 'Already in DB',   value: fmt(preview.existing_duplicates),  color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20'},
                  { label: 'Cross-File Dupes',value: fmt(preview.cross_file_duplicates),color: 'text-orange-600',bg: 'bg-orange-50 dark:bg-orange-900/20'},
                  { label: 'Net New Rows',    value: fmt(preview.net_new_rows),         color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20'},
                  { label: 'Files Errored',   value: fmt(preview.files_errored),        color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800'  },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={clsx('rounded-xl p-3 text-center', bg)}>
                    <p className={clsx('text-2xl font-black', color)}>{value}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-file detail */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Per-File Audit</h3>
              {preview.file_details?.map((d, i) => <FileResult key={i} detail={d} />)}
            </div>

            {/* Preview table */}
            {preview.preview_rows?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 mb-2">
                  Sanitised Data Preview — first {preview.preview_rows.length} rows (after all cleaning)
                </h3>
                <PreviewTable rows={preview.preview_rows} />
              </div>
            )}

            {/* Commit / cancel bar */}
            <div className={clsx(
              'card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
              preview.net_new_rows === 0
                ? 'border-slate-200 dark:border-slate-700'
                : 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10'
            )}>
              <div>
                {preview.net_new_rows > 0 ? (
                  <>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Ready to merge <span className="text-green-600">{fmt(preview.net_new_rows)} new rows</span> into the database
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Existing records will not be modified. ML models will retrain automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No new rows to add</p>
                    <p className="text-xs text-slate-400 mt-0.5">All uploaded incidents are already in the database.</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1.5">
                  <RotateCcw size={12} /> Start Over
                </button>
                {preview.net_new_rows > 0 && (
                  <button
                    onClick={runCommit}
                    disabled={step === STEP.committing}
                    className="btn-primary flex items-center gap-2"
                  >
                    {step === STEP.committing
                      ? <><Loader2 size={13} className="animate-spin" /> Merging…</>
                      : <><ArrowRight size={13} /> Confirm &amp; Merge</>
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Schema reference ──────────────────────────────────────────── */}
        {step === STEP.idle && files.length === 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Expected Column Schema</span>
              <span className="text-xs text-slate-400">Your file must contain these columns (extra ones are dropped)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {['Column Name','Required','Default','Description'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {SCHEMA_REF.map(row => (
                    <tr key={row.col} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-3 py-2 font-mono font-semibold text-brand-600 dark:text-brand-400 whitespace-nowrap">{row.col}</td>
                      <td className="px-3 py-2">
                        {row.req
                          ? <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded">Required</span>
                          : <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Optional</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{row.def || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-700">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-slate-600 dark:text-slate-300">Date format:</strong> DD-MM-YYYY HH:MM &nbsp;|&nbsp;
                <strong className="text-slate-600 dark:text-slate-300">Priority:</strong> "4 - Standard" / "3 - Moderate" / "2 - High" / "1 - Critical" &nbsp;|&nbsp;
                <strong className="text-slate-600 dark:text-slate-300">Dedup key:</strong> number (first column) &nbsp;|&nbsp;
                <strong className="text-slate-600 dark:text-slate-300">Column names</strong> are case-insensitive and spaces/dashes are normalised automatically.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Static schema reference (for idle state table) ────────────────────────────
const SCHEMA_REF = [
  { col: 'number',                 req: true,  def: '',              desc: 'Incident number — INC0XXXXXXXXX (deduplication key)' },
  { col: 'created',                req: true,  def: '',              desc: 'Created date DD-MM-YYYY HH:MM' },
  { col: 'first_assignment_group', req: true,  def: '',              desc: 'Primary assignment group name' },
  { col: 'priority',               req: true,  def: '4 - Standard',  desc: '1-Critical / 2-High / 3-Moderate / 4-Standard' },
  { col: 'state',                  req: true,  def: 'Open',          desc: 'Open / In Progress / On Hold / Resolved / Closed' },
  { col: 'impact_user',            req: false, def: '',              desc: 'Impacted user name or email' },
  { col: 'assignment_group',       req: false, def: '',              desc: 'L2 / escalation assignment group' },
  { col: 'service_offering',       req: false, def: '',              desc: 'Application / service name' },
  { col: 'urgency',                req: false, def: '3 - Low',       desc: '1-High / 2-Medium / 3-Low' },
  { col: 'hold_reason',            req: false, def: '',              desc: 'On-hold reason (if applicable)' },
  { col: 'assigned_to',            req: false, def: '',              desc: 'Agent name — powers M6 Agent Scorecard' },
  { col: 'short_description',      req: false, def: '',              desc: 'Incident description text' },
  { col: 'category',               req: false, def: 'auto-derived',  desc: 'Category — auto-derived from description if blank' },
  { col: 'subcategory',            req: false, def: '',              desc: 'Sub-category' },
  { col: 'tags',                   req: false, def: '',              desc: 'Comma-separated tags' },
  { col: 'updated',                req: false, def: '',              desc: 'Last updated date DD-MM-YYYY HH:MM' },
  { col: 'updated_by',             req: false, def: '',              desc: 'Updated by (name / email)' },
  { col: 'made_sla',               req: false, def: 'FALSE',         desc: 'TRUE or FALSE — was SLA met?' },
  { col: 'sla_due',                req: false, def: '',              desc: 'SLA due date' },
  { col: 'resolution_code',        req: false, def: '',              desc: 'Resolution code / category' },
  { col: 'resolved',               req: false, def: '',              desc: 'Resolution date DD-MM-YYYY HH:MM' },
  { col: 'reopen_count',           req: false, def: '0',             desc: 'Times the ticket was reopened (integer)' },
  { col: 'reassignment_count',     req: false, def: '0',             desc: 'Number of reassignments (integer)' },
  { col: 'business_duration',      req: false, def: '0',             desc: 'Business duration in seconds (integer)' },
  { col: 'last_assignment_date',   req: false, def: '',              desc: 'Date of last reassignment' },
  { col: 'resolution_notes',       req: false, def: '',              desc: 'Resolution / close notes (free text)' },
]
