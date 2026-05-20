# CLAUDE.md — ServiceNow Intelligence Platform
> **AI Context File** · Read this first in every new session before touching any code.
> Last updated: May 2026 · Owner: Ani (Senior Data Science Lead, Capgemini)

---

## 1. Project Identity

**Name:** ServiceNow AI-Powered Incident Intelligence Platform  
**Purpose:** Transform raw ServiceNow incident exports into actionable operational intelligence for enterprise IT teams.  
**Status:** M1 and M2 complete (CSV-backed). M3–M5 are upcoming modules.  
**Client context:** Internal Capgemini product, eventually used across multiple teams. Proposal doc is the source of truth for scope.

---

## 2. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  React 18 + Vite 5 + Tailwind 3 + Recharts 2                │
│  /monitoring  →  M1 Dashboard                               │
│  /trends      →  M2 Trend Analysis                          │
│  port 5173 (dev) | port 80 via nginx (prod)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ /api/* (proxied)
┌─────────────────────▼───────────────────────────────────────┐
│  FastAPI 0.111 + pandas 2.2 + numpy 1.26 + sklearn 1.5      │
│  port 8000                                                  │
│  Data Loader abstraction: CSV → ServiceNow API → SharePoint │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│  incidents.csv  (1,829 rows, 6 months Nov-2025→Apr-2026)    │
│  or  ServiceNow Table API  or  SharePoint file              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. File Map

```
servicenow-platform/
├── CLAUDE.md                        ← YOU ARE HERE
├── README.md                        ← Setup guide
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── backend/
│   ├── main.py                      ← FastAPI entry (uvicorn main:app)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── app/
│   │   ├── config.py                ← pydantic-settings, .env parsing
│   │   ├── data_loader.py           ← CSV / ServiceNow / SharePoint loader
│   │   └── routers/
│   │       ├── monitoring.py        ← M1 endpoints (/api/monitoring/*)
│   │       ├── trends.py            ← M2 endpoints (/api/trends/*)
│   │       └── insights.py          ← Insight engine (/api/insights/*)
│   └── data/
│       ├── generate_data.py         ← Standalone data generator
│       └── incidents.csv            ← Generated (or replace with real data)
│
└── frontend/
    ├── package.json
    ├── vite.config.js               ← Proxies /api → http://localhost:8000
    ├── tailwind.config.js
    ├── index.html
    ├── Dockerfile                   ← nginx multi-stage build
    ├── nginx.conf
    └── src/
        ├── main.jsx                 ← ReactDOM root
        ├── App.jsx                  ← BrowserRouter + Routes
        ├── index.css                ← Tailwind + custom classes
        ├── services/
        │   └── api.js               ← axios client, monitoring.*, trends.*, insights.*
        └── components/
            ├── layout/
            │   ├── Sidebar.jsx      ← Collapsible navy sidebar
            │   └── Header.jsx       ← Dark mode, refresh, clock
            ├── common/
            │   └── index.jsx        ← KPICard, InsightCard, FilterBar,
            │                           DrilldownModal, SkeletonCard, CustomTooltip
            └── pages/
                ├── MonitoringDashboard.jsx   ← M1 full page
                └── TrendAnalysis.jsx         ← M2 full page
```

---

## 4. Data Model

All incidents share these fields (matching ServiceNow export):

| Field | Type | Notes |
|-------|------|-------|
| number | str | INC012XXXXXX |
| created | datetime | Incident creation time |
| first_assignment_group | str | Primary group key |
| assignment_group | str | L2 group (escalation) |
| priority | int | 1=Critical, 2=High, 3=Medium, 4=Low |
| urgency | int | 1=High, 2=Medium, 3=Low |
| state | str | Open / In Progress / On Hold / Resolved / Closed |
| category | str | Application Access / Hardware / Network / etc |
| subcategory | str | Drill-down of category |
| made_sla | str | "TRUE" / "FALSE" |
| made_sla_bool | bool | Derived |
| mttr_hours | float | Derived: (resolved - created) in hours |
| reassignment_count | int | 0–4+ |
| reopen_count | int | 0–2 |
| business_duration | int | seconds |
| resolution_code | str | Resolution category |
| resolution_notes | str | Free text |

**Assignment groups in data:**
- DPS-McLean WEB (25%)
- DPS-Global Service Desk (30%)
- DPS-Materials WFR (20%)
- DPS-Network Operations (12%)
- DPS-Security Team (7%)
- DPS-Infrastructure (6%)

---

## 5. API Contract

### M1 Monitoring (`/api/monitoring/*`)
| Endpoint | Params | Returns |
|----------|--------|---------|
| GET /filters | — | All dropdown options |
| GET /kpis | date_from, date_to, groups[], priorities[] | 10 KPI metrics |
| GET /by-group | standard filters | Stacked state counts per group |
| GET /by-category | standard filters | Donut data |
| GET /sla-kpi | standard filters | SLA compliance + by-priority breakdown |
| GET /priority-heatmap | standard filters | P1–P4 per group matrix |
| GET /reopen-tracker | standard filters | Monthly reopen trend + top 10 |
| GET /incidents | standard filters + page, limit, search, sort | Paginated table |
| GET /last-updated | limit | Activity feed |

### M2 Trends (`/api/trends/*`)
| Endpoint | Params | Returns |
|----------|--------|---------|
| GET /volume | + granularity | By period + group |
| GET /mttr | + granularity | Avg MTTR per group per period |
| GET /category-distribution | + granularity | Stacked by category |
| GET /sla-compliance | + granularity | Met/breached/% per period |
| GET /priority-trend | + granularity | P1–P4 per period |
| GET /resolution-heatmap | standard | dow × hour count |
| GET /reassignment-analysis | standard | by_group + scatter data |
| GET /forecast | + periods | Historical + 6-period forecast |
| GET /root-cause | standard | Treemap: category → subcategory |

### Insights (`/api/insights/*`)
| Endpoint | Returns |
|----------|---------|
| GET /monitoring | 6 rule-based insights with severity |
| GET /trends | 5 trend insights |

---

## 6. Filter Convention

All endpoints accept these standard query params (built by `buildParams()` in `api.js`):

```
date_from  = "YYYY-MM-DD"
date_to    = "YYYY-MM-DD"
groups     = ["DPS-McLean WEB", ...]    (multi-value)
priorities = [1, 2, 3, 4]              (multi-value ints)
categories = ["Hardware", ...]          (multi-value)
states     = ["Open", "Resolved", ...]  (multi-value)
sla        = "met" | "breached" | ""
granularity= "day" | "week" | "month"
```

---

## 7. Switching to Real ServiceNow Data

1. Copy your real CSV export to `backend/data/incidents.csv`  
   OR set `DATA_SOURCE=servicenow_api` in `.env` and implement `_load_servicenow()` in `data_loader.py`

2. Column mapping: The CSV must have these exact column names (lowercase, underscored):
   `number, created, impact_user, first_assignment_group, assignment_group, service_offering, priority, urgency, state, hold_reason, assigned_to, short_description, category, subcategory, tags, updated, updated_by, made_sla, sla_due, resolution_code, resolved, reopen_count, reassignment_count, business_duration, last_assignment_date, resolution_notes`

3. Hit `GET /api/reload` to refresh the in-memory cache without restarting the server.

---

## 8. Upcoming Modules (M3–M5)

| Module | Description | Tech |
|--------|-------------|------|
| M3 Smart Triage | Auto-categorise incoming incidents using fine-tuned BERT | HuggingFace Transformers |
| M4 Intelligent Routing | Predict best assignment group from text | scikit-learn classifier |
| M5 NL Chatbot | Conversational Q&A over incident data | LangChain + RAG + GPT-4o |

---

## 9. Development Conventions

- **No inline style** (use Tailwind classes or `index.css` utilities)
- **All API calls** go through `src/services/api.js` — never call axios directly in components
- **Insights** are always generated server-side in `routers/insights.py` — not client-side
- **Dark mode** via Tailwind `class` strategy; state in `localStorage.theme`
- **Color palette**: brand-600 (#2563EB), navy (#1B3A6B), success green, amber warning, red critical
- **Chart library**: Recharts only (no other chart libs to avoid bundle bloat)
- **State management**: React useState + useCallback (no Redux needed at this scale)

---

## 10. Common Tasks for the Next Session

```bash
# Add a new M1 chart
# 1. Add endpoint in backend/app/routers/monitoring.py
# 2. Add function to frontend/src/services/api.js under monitoring.*
# 3. Add chart component in MonitoringDashboard.jsx
# 4. Add insight rule in routers/insights.py

# Swap to real ServiceNow data
cp /path/to/real_export.csv backend/data/incidents.csv
# Make sure column names match Section 7 above
curl http://localhost:8000/api/reload

# Add new insight rule
# Edit routers/insights.py → get_monitoring_insights() or get_trends_insights()
# Each insight: { id, title, message, severity: positive|warning|critical, metric, chart }
```
