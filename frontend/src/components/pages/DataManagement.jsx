/**
 * Data Management — Import & Merge External Data
 *
 * Supports:
 *   - Additional incident data (CSV/Excel append)
 *   - External data sources (surveys, metrics, custom fields)
 *   - Data reconciliation and deduplication
 */
import { useState, useCallback, useEffect } from 'react'
import { Upload, X, Check, AlertCircle, FileText, Database, TrendingUp, ShieldAlert, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { data as dataApi } from '../../services/api'

function ImportCard({ title, description, icon: Icon, accept, onFileSelect, disabled }) {
  return (
    <label className={clsx(
      'card p-6 cursor-pointer transition-all border-2 border-dashed',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/20'
    )}>
      <input type="file" hidden accept={accept} onChange={onFileSelect} disabled={disabled} />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon size={20} className="text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
      </div>
    </label>
  )
}

function UploadStatus({ file, status, progress, error, result }) {
  return (
    <div className="card p-4 border-l-4"
      style={{
        borderLeftColor: status === 'success' ? '#22C55E' : status === 'error' ? '#EF4444' : '#F59E0B'
      }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {status === 'loading' && <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />}
          {status === 'success' && <Check size={20} className="text-green-600" />}
          {status === 'error' && <AlertCircle size={20} className="text-red-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
          {status === 'loading' && (
            <>
              <p className="text-xs text-slate-500 mt-1">Uploading... {progress}%</p>
              <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
          {status === 'success' && result && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
              <p>✓ {result.records_imported} records imported</p>
              {result.records_merged > 0 && <p>• {result.records_merged} merged with existing data</p>}
              {result.duplicates_skipped > 0 && <p>• {result.duplicates_skipped} duplicates skipped</p>}
              {result.validation_warnings && <p className="text-amber-600">⚠ {result.validation_warnings} warnings</p>}
            </div>
          )}
          {status === 'error' && (
            <p className="text-xs text-red-600 mt-1">{error}</p>
          )}
        </div>
        {status !== 'loading' && (
          <button onClick={() => onRemove?.()} className="text-slate-400 hover:text-red-600 transition shrink-0">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

function DataSourceCard({ name, type, lastUpdated, recordCount, actions }) {
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Database size={18} className="text-slate-600 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{name}</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {type}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
          <span>Records: <b className="text-slate-700 dark:text-slate-200">{recordCount.toLocaleString()}</b></span>
          <span>Updated: <b className="text-slate-700 dark:text-slate-200">{lastUpdated}</b></span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
      </div>
    </div>
  )
}

export default function DataManagement() {
  const [uploads, setUploads] = useState([])
  const [dataSources, setDataSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingSources, setLoadingSources] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load data sources on mount
  useEffect(() => {
    const loadSources = async () => {
      try {
        const res = await dataApi.sources()
        setDataSources(res.data?.sources || [])
      } catch (err) {
        console.error('Failed to load data sources:', err)
      } finally {
        setLoadingSources(false)
      }
    }
    loadSources()
  }, [refreshKey])

  const handleFileSelect = useCallback(async (fileType, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const uploadId = `${Date.now()}-${Math.random()}`
    const newUpload = { id: uploadId, file, status: 'loading', progress: 0, fileType }

    setUploads(prev => [...prev, newUpload])

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('data_type', fileType)

      const res = await dataApi.importData(formData, (progress) => {
        setUploads(prev =>
          prev.map(u => u.id === uploadId ? { ...u, progress } : u)
        )
      })

      setUploads(prev =>
        prev.map(u => u.id === uploadId
          ? { ...u, status: 'success', result: res.data }
          : u
        )
      )
      setRefreshKey(k => k + 1)
    } catch (err) {
      setUploads(prev =>
        prev.map(u => u.id === uploadId
          ? { ...u, status: 'error', error: err.response?.data?.detail || err.message }
          : u
        )
      )
    }
  }, [])

  const handleRemoveUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Data Management"
        subtitle="Import & merge external data sources · incidents · surveys · metrics · custom fields"
        onRefresh={() => setRefreshKey(k => k + 1)}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-6">

        {/* ── IMPORT SECTION ──────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Import New Data</span>
            <span className="text-xs text-slate-400">Supported: CSV, Excel (.xlsx), JSON</span>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <ImportCard
              title="Incident Data"
              description="Append or merge additional incident records from ServiceNow export"
              icon={FileText}
              accept=".csv,.xlsx,.json"
              onFileSelect={(e) => handleFileSelect('incidents', e)}
            />
            <ImportCard
              title="Survey / CSAT Data"
              description="Customer satisfaction scores, feedback, or NPS data by incident"
              icon={TrendingUp}
              accept=".csv,.xlsx,.json"
              onFileSelect={(e) => handleFileSelect('surveys', e)}
            />
            <ImportCard
              title="SLA Breach Data"
              description="Pre-analyzed SLA breach records with assignment age & escalation metrics"
              icon={ShieldAlert}
              accept=".csv,.xlsx,.json"
              onFileSelect={(e) => handleFileSelect('sla_breach', e)}
            />
            <ImportCard
              title="Custom Metrics"
              description="KPIs, business metrics, or domain-specific data for enrichment"
              icon={Database}
              accept=".csv,.xlsx,.json"
              onFileSelect={(e) => handleFileSelect('metrics', e)}
            />
          </div>
        </div>

        {/* ── UPLOAD STATUS ───────────────────────────────────────── */}
        {uploads.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Uploads</span>
            </div>
            <div className="p-4 space-y-3">
              {uploads.map(u => (
                <UploadStatus
                  key={u.id}
                  file={u.file}
                  status={u.status}
                  progress={u.progress}
                  error={u.error}
                  result={u.result}
                  onRemove={() => handleRemoveUpload(u.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVE DATA SOURCES ─────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Data Sources</span>
            <button onClick={() => setRefreshKey(k => k + 1)} disabled={loadingSources} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition flex items-center gap-1">
              <RefreshCw size={12} className={loadingSources ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          <div className="p-4 space-y-3">
            {loadingSources ? (
              <div className="text-center py-6">
                <div className="inline-block w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 mt-2">Loading data sources...</p>
              </div>
            ) : dataSources.length > 0 ? (
              dataSources.map((source, i) => (
                <DataSourceCard
                  key={i}
                  name={source.name}
                  type={source.type}
                  lastUpdated={source.last_updated?.split('T')[0] || 'Unknown'}
                  recordCount={source.records}
                  actions={source.type === 'Primary' ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold">
                      Merged
                    </span>
                  )}
                />
              ))
            ) : (
              <div className="text-xs text-slate-400 text-center py-6">
                <p className="mb-2">Primary data source only (ServiceNow)</p>
                <p className="text-[11px] text-slate-500">Import additional data using the upload cards above</p>
              </div>
            )}
          </div>
        </div>

        {/* ── IMPORT GUIDE ────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Import Guide</span>
          </div>
          <div className="p-4 space-y-4 text-sm text-slate-600 dark:text-slate-400">
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">Incident Data</p>
              <p>Upload additional incident records to merge with existing ServiceNow data. Duplicates are automatically detected and skipped.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">Survey / CSAT Data</p>
              <p>Include a column matching incident number (INC*) to link CSAT scores and feedback. Available for M2 Trend Analysis charts.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">SLA Breach Data</p>
              <p>Pre-calculated SLA breach metrics with assignment age, hold times, and escalation risks. Directly enriches M6 SLA Risk Board with detailed breach analysis and ownership tracking.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">Custom Metrics</p>
              <p>Define custom dimensions or KPIs. Requires incident_number column to merge with existing incident pool.</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-800 dark:text-blue-300">
              <p className="font-semibold text-sm mb-1">💡 Tip</p>
              <p className="text-xs">All data sources are loaded into memory on first import. Use GET /api/data/reload to refresh without restarting.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
