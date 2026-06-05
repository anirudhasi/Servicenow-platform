import axios from 'axios'

const BASE = '/api'

const api = axios.create({ baseURL: BASE, timeout: 60000 })

// ── M1 Monitoring ─────────────────────────────────────────────────────────────
export const monitoring = {
  filters:        (p = {}) => api.get('/monitoring/filters',         { params: p }),
  kpis:           (p = {}) => api.get('/monitoring/kpis',            { params: p }),
  byGroup:        (p = {}) => api.get('/monitoring/by-group',        { params: p }),
  byCategory:     (p = {}) => api.get('/monitoring/by-category',     { params: p }),
  slaKpi:         (p = {}) => api.get('/monitoring/sla-kpi',         { params: p }),
  priorityHeatmap:(p = {}) => api.get('/monitoring/priority-heatmap',{ params: p }),
  reopenTracker:  (p = {}) => api.get('/monitoring/reopen-tracker',  { params: p }),
  incidents:      (p = {}) => api.get('/monitoring/incidents',       { params: p }),
  lastUpdated:    (p = {}) => api.get('/monitoring/last-updated',    { params: p }),
  topServices:    (p = {}) => api.get('/monitoring/top-services',    { params: p }),
  resolutionCodes:(p = {}) => api.get('/monitoring/resolution-codes',{ params: p }),
  monthlyVolume:  (p = {}) => api.get('/monitoring/monthly-volume',  { params: p }),
}

// ── M2 Trends ─────────────────────────────────────────────────────────────────
export const trends = {
  volume:           (p = {}) => api.get('/trends/volume',              { params: p }),
  mttr:             (p = {}) => api.get('/trends/mttr',                { params: p }),
  categoryDist:     (p = {}) => api.get('/trends/category-distribution',{ params: p }),
  slaCompliance:    (p = {}) => api.get('/trends/sla-compliance',      { params: p }),
  priorityTrend:    (p = {}) => api.get('/trends/priority-trend',      { params: p }),
  resolutionHeatmap:(p = {}) => api.get('/trends/resolution-heatmap',  { params: p }),
  reassignment:     (p = {}) => api.get('/trends/reassignment-analysis',{ params: p }),
  forecast:         (p = {}) => api.get('/trends/forecast',            { params: p }),
  rootCause:        (p = {}) => api.get('/trends/root-cause',          { params: p }),
}

// ── Insights ──────────────────────────────────────────────────────────────────
export const insights = {
  monitoring: (p = {}) => api.get('/insights/monitoring', { params: p }),
  trends:     (p = {}) => api.get('/insights/trends',     { params: p }),
}

// ── M3 Smart Triage ───────────────────────────────────────────────────────────
export const triage = {
  predict:              (body)      => api.post('/triage/predict', body),
  modelStats:           ()          => api.get('/triage/model-stats'),
  priorityAudit:        (max = 20)  => api.post(`/triage/priority-audit?max_incidents=${max}`),
  priorityDefinitions:  ()          => api.get('/triage/priority-definitions'),
}

// ── M4 Intelligent Routing ────────────────────────────────────────────────────
export const routing = {
  predict: (body) => api.post('/routing/predict', body),
  groups:  ()     => api.get('/routing/groups'),
}

// ── M5 NL Chatbot ─────────────────────────────────────────────────────────────
export const chatbot = {
  message:      (body)      => api.post('/chatbot/message', body),
  status:       ()          => api.get('/chatbot/status'),
  suggestions:  ()          => api.get('/chatbot/suggestions'),
  clearSession: (sessionId) => api.delete(`/chatbot/session/${sessionId}`),
}

// ── M7 Data Upload ────────────────────────────────────────────────────────────
export const upload = {
  schema:        ()          => api.get('/upload/schema'),
  preview:       (formData)  => api.post('/upload/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  commit:        (body)      => api.post('/upload/commit', body),
  cancelSession: (sessionId) => api.delete(`/upload/session/${sessionId}`),
}

// ── M6 SDM Scorecard ──────────────────────────────────────────────────────────
export const scorecard = {
  summary:  (p = {}) => api.get('/scorecard/summary',  { params: p }),
  byAgent:  (p = {}) => api.get('/scorecard/by-agent', { params: p }),
  monthly:  (p = {}) => api.get('/scorecard/monthly',  { params: p }),
}

// ── SLA Breach Intelligence ───────────────────────────────────────────────────
export const breach = {
  kpis:                () => api.get('/breach/kpis'),
  timeline:            () => api.get('/breach/timeline'),
  slaCompliance:       () => api.get('/breach/sla-compliance'),
  byService:           () => api.get('/breach/by-service'),
  byGroup:             () => api.get('/breach/by-group'),
  elapsedDistribution: () => api.get('/breach/elapsed-distribution'),
  assignmentAge:       () => api.get('/breach/assignment-age'),
  reassignmentImpact:  () => api.get('/breach/reassignment-impact'),
  priorityBreakdown:   () => api.get('/breach/priority-breakdown'),
  onHoldAnalysis:      () => api.get('/breach/on-hold-analysis'),
  kpiScorecard:        () => api.get('/breach/kpi-scorecard'),
}

// ── Data Management ──────────────────────────────────────────────────────────
export const data = {
  importData: (formData, onProgress) => api.post('/data/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
    onUploadProgress: (evt) => {
      const progress = Math.round((evt.loaded * 100) / evt.total)
      onProgress?.(progress)
    },
  }),
  sources: () => api.get('/data/sources'),
  reload:   () => api.post('/data/reload'),
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function buildParams(filters) {
  const p = {}
  if (filters.dateFrom)            p.date_from   = filters.dateFrom
  if (filters.dateTo)              p.date_to     = filters.dateTo
  if (filters.groups?.length)      p.groups      = filters.groups
  if (filters.priorities?.length)  p.priorities  = filters.priorities
  if (filters.categories?.length)  p.categories  = filters.categories
  if (filters.states?.length)      p.states      = filters.states
  if (filters.sla)                 p.sla         = filters.sla
  if (filters.granularity)         p.granularity = filters.granularity
  return p
}
