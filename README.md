# ServiceNow AI Intelligence Platform

**Enterprise-grade incident analytics — M1 Monitoring Dashboard + M2 Trend Analysis Engine**

Built by Capgemini Technology Services · AI & Data Practice

---

## Quick Start (Local Dev — 5 minutes)

### Prerequisites
| Tool | Version | Check |
|------|---------|-------|
| Python | ≥ 3.10 | `python --version` |
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |

### 1 — Clone / extract the project
```bash
# If you received a zip:
unzip servicenow-intelligence-platform.zip
cd servicenow-platform
```

### 2 — Backend setup
```bash
cd backend

# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Generate sample data (creates backend/data/incidents.csv)
python data/generate_data.py

# Copy env template
cp ../.env.example .env             # Edit if needed

# Start backend
uvicorn main:app --reload --port 8000
```
Backend health check: http://localhost:8000/api/health

### 3 — Frontend setup (new terminal)
```bash
cd frontend
npm install
npm run dev
```
Open: **http://localhost:5173**

---

## Using Your Real ServiceNow Data

### Option A — CSV Drop-in
1. Export incidents from ServiceNow → Save as `incidents.csv`
2. Rename columns to match the schema below
3. Copy to `backend/data/incidents.csv`
4. Hit `GET http://localhost:8000/api/reload` to refresh

**Required CSV columns** (exact names, lowercase with underscores):
```
number, created, impact_user, first_assignment_group, assignment_group,
service_offering, priority, urgency, state, hold_reason, assigned_to,
short_description, category, subcategory, tags, updated, updated_by,
made_sla, sla_due, resolution_code, resolved, reopen_count,
reassignment_count, business_duration, last_assignment_date, resolution_notes
```

### Option B — Live ServiceNow API
1. Edit `.env`:
   ```
   DATA_SOURCE=servicenow_api
   SERVICENOW_INSTANCE=your-instance.service-now.com
   SERVICENOW_USERNAME=your-user
   SERVICENOW_PASSWORD=your-password
   ```
2. Implement `_load_servicenow()` in `backend/app/data_loader.py`
3. Restart backend

---

## How Category Is Determined

Category is set one of two ways, tried in order:

### Path 1 — Column already present in CSV
If the exported CSV contains a `category` column with values, those values are used **as-is**. No keyword matching occurs.

### Path 2 — Auto-derived from text (no `category` column)
When the `category` column is absent or entirely blank, the system **automatically classifies** each incident by counting keyword hits across the combined `short_description + service_offering` text (case-insensitive). The category with the **most keyword matches wins**. If no keywords match, the incident is labelled **General**.

| Category | Keywords that trigger it |
|----------|--------------------------|
| **Application Access** | access, permission, login, sso, eptw, certif, approve buddy, approvebuddy, account lock, badge, access now, epermit, role, authoris, unauthor |
| **Application Error** | error, not working, crash, issue, problem, bug, giving an error, went wrong, failed, failure, cannot, can't, unable, not running, not able |
| **Data & Reporting** | report, data fetch, letter generation, ksahr, validation, document, upload, download, export, eclaim, eclaims, mdbr, cycle count |
| **User Account** | new user, onboard, leaver, deactivat, profile, user setup, joiner, hrc, icharge |
| **Network** | vpn, wifi, network, internet, connect, dns, bandwidth, proxy, connectivity |
| **Hardware** | laptop, desktop, printer, monitor, mobile, device, hardware, screen, docking |
| **Software & Tools** | install, software, upgrade, patch, license, version, update, app update, blueworld, bluemm, blue mm, slb ride, slbride, gt mobile, iworkplace, workday, sap, sharepoint, tep, gbs ci tracker |
| **Infrastructure** | server, storage, backup, database, infrastructure, cpu, memory, disk, vm, virtual |
| **Change Request** | change request, enhancement, change/enhancement, product backlog, feature request |
| **Service Request** | request, provision, setup, new, require, materials management, mct, generic technical |
| **General** | *(fallback — no keywords matched)* |

> **Tip:** To use your real ServiceNow categories, include a `Category` column in your CSV export. The auto-derivation above is only a fallback for exports that omit it.
>
> **Customising rules:** Edit `CATEGORY_RULES` in `backend/app/data_loader.py` to add, remove, or rename categories and their trigger keywords.

---

## Docker (Team / Production)

### Prerequisites
- Docker Desktop (or Docker Engine + Compose plugin)

### Run entire stack
```bash
# From project root
cp .env.example .env      # edit as needed
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Stop
```bash
docker compose down
```

---

## Development Workflow (Multi-Developer Team)

### Recommended setup
```
servicenow-platform/
├── .git/           ← shared via GitHub / Azure DevOps
├── backend/        ← Python dev on VSCode/PyCharm
└── frontend/       ← React dev on VSCode
```

### Branch strategy
```
main          ← stable, always deployable
develop       ← integration branch
feature/M3-*  ← new modules
fix/*         ← bug fixes
```

### Running tests (when added)
```bash
# Backend
cd backend && pytest tests/

# Frontend
cd frontend && npm test
```

### Linting
```bash
# Backend
pip install ruff && ruff check .

# Frontend
npm run lint
```

---

## Refreshing Data Without Restart
```bash
# Hot-reload: swap CSV and call:
curl http://localhost:8000/api/reload
```

---

## API Reference
Interactive docs available at: http://localhost:8000/docs

Key endpoints:
```
GET /api/health                        → Platform health check
GET /api/monitoring/kpis               → Live KPI metrics
GET /api/monitoring/incidents          → Paginated incident table
GET /api/trends/forecast?periods=6     → 6-period volume forecast
GET /api/insights/monitoring           → AI-generated insights
GET /api/insights/trends               → Trend insights
```

---

## Project Structure
See `CLAUDE.md` for the full file map and architectural decisions.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CORS error` in browser | Add your frontend URL to `ALLOWED_ORIGINS` in `.env` |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` in venv |
| `npm install` fails | Ensure Node ≥ 18: `node --version` |
| Charts show "No data" | Check backend is running: `curl localhost:8000/api/health` |
| CSV not loading | Check `CSV_PATH` in `.env` is correct |
| Slow on first load | Backend is preloading 1800+ rows — normal, takes ~2s |

---

## Future Scope & Strategic Roadmap

This platform is built to scale from M1–M2 (current) through M3–M5 and beyond. The strategic roadmap below prioritizes by business impact and effort, organized in phases.

### Phase 3: Advanced Analytics & Insights (High Impact, Medium Effort)

#### 1. **Burndown vs Capacity Heatmap** 🔥
Weekly incident burn rate vs team capacity; identifies resource bottlenecks in real-time.
- **Data**: Weekly creation_count vs resolution_count by tower/sdm
- **Visualization**: Stacked area (creation vs resolution over time)
- **Actionable**: Flags teams with >10% backlog growth week-over-week
- **Effort**: Medium | **Impact**: High

#### 2. **Reassignment Impact Analyzer** 📊
Root cause analysis of why tickets get reassigned (wrong group, skill mismatch, queue delays).
- **Improve**: First-Assignment-Right (FAR) metric (target: >95%)
- **Impact**: Each reassignment adds 4–12h to MTTR
- **Approach**: Segment by group → reassignment_count → root cause keyword analysis
- **Effort**: Medium | **Impact**: High

#### 3. **SLA Aging Alert System** ⏰
Proactive real-time alerts for tickets approaching SLA breach thresholds.
- **Severity Levels**: Green (<25%), Yellow (25–75%), Red (75–95%), Critical (>95%)
- **Integration**: Dashboard banner + Slack/Teams webhook
- **Effort**: Low | **Impact**: Very High

---

### Phase 4: Predictive & ML Features (Strategic, High Complexity)

#### 4. **Priority Misclassification Detector** 🤖
ML model to flag likely mis-prioritized tickets across all priorities (P1–P4).
- **Model**: Random Forest or Gradient Boosting on incident text + metadata
- **Training Data**: Use audit results + historical SLA compliance as labels
- **Impact**: Reduce over-prioritization cost, improve compliance
- **Effort**: Very High | **Impact**: High

#### 5. **MTTR Prediction Engine** 📈
Predict resolution time when ticket is created (regression model).
- **Features**: Tower, SDM, assignment_group, category, priority, reassignment history
- **Output**: 50th percentile estimate + 95th percentile confidence band
- **Use**: SLA risk prediction, capacity planning, team workload balancing
- **Effort**: Very High | **Impact**: High

#### 6. **Smart Assignment Optimizer** 🎯
Recommend best assignment group based on current queue, historical MTTR, SDM workload.
- **Algorithm**: Multi-armed bandit or decision tree
- **Input**: Incoming ticket (category, service, priority) + real-time queue state
- **Output**: Recommended group + confidence score
- **Impact**: Reduce reassignments, improve FAR, balance load
- **Effort**: Very High | **Impact**: Very High

---

### Phase 5: Operational Excellence (Process-Focused)

#### 7. **Tower/SDM Scorecard with Trends** 📋
Monthly performance card for each tower/SDM showing 5-metric comparison.
- **Metrics**: SLA %, FAR %, MTTR, customer satisfaction, resolution rate
- **Visualization**: Radar chart (5 dimensions), trend lines (6-month history)
- **Integration**: Existing SdmScorecard.jsx, make tower-aware
- **Effort**: Medium | **Impact**: Medium

#### 8. **Incident Routing Simulator** 🔄
"What-if" tool to test routing policy changes without live impact.
- **Use Cases**: Test reassignment rule changes, group consolidations, priority recalibration
- **Approach**: Replay historical incidents with new routing logic, measure impact
- **Output**: Projected SLA compliance, MTTR, FAR under new rules
- **Effort**: Medium–High | **Impact**: High

#### 9. **Service-to-Group Affinity Matrix** 🔗
Show which groups resolve which services best (success rate, speed, quality).
- **Visualization**: Heatmap (service × group, color = success rate)
- **Integration**: Add to Comparison page
- **Impact**: Better first-assignment routing, identify service specialists
- **Effort**: Low | **Impact**: Medium

---

### Phase 6: Integration & Collaboration (Cross-Functional)

#### 10. **Incident Ownership Dashboard** 👥
Per-agent view of current assignments, resolution history, peer performance.
- **Sections**: Active assignments (with remaining SLA), recent wins, performance vs peers
- **Use**: Agent development, identifying training needs, workload visibility
- **Integration**: New page (navigate from agent heatmap)
- **Effort**: Low | **Impact**: Medium

#### 11. **Slack/Teams Integration** 💬
Real-time alerts to SDM channels for critical events.
- **Alert Types**:
  - P1 breach → #sla-critical
  - Group queue >20 incidents → capacity alert
  - Agent overdue assignments → escalation flag
- **Integration**: Webhook from breach detection logic
- **Effort**: High | **Impact**: Very High

#### 12. **SLA Variance Report** 📉
Monthly business report (export-ready, executive-friendly).
- **Sections**: Performance vs contract, variance analysis, recommendations
- **Output**: PDF/Excel with charts, summarized findings
- **Audience**: Executives, business stakeholders
- **Effort**: Medium | **Impact**: Medium

---

### Phase 7: Intelligence Layer (Advanced Analytics)

#### 13. **Automated Root Cause Categorization** 🔍
NLP on resolution notes to categorize: process issue, missing knowledge, tool failure, user error.
- **Model**: BERT fine-tuned on your resolution notes (or DistilBERT for speed)
- **Output**: Root cause distribution, trend over time
- **Impact**: Identify systemic vs one-off problems; guide training/tool investment
- **Effort**: Very High | **Impact**: High

#### 14. **Knowledge Base Recommender** 📚
Suggest KB articles when tickets are created (reduce P4 volume via self-service).
- **Data**: Parse KB category from ServiceNow, link to historical incidents
- **Algorithm**: TF-IDF or semantic similarity (embeddings)
- **Impact**: Reduce P4 volume, improve FAR, agent knowledge
- **Effort**: Very High | **Impact**: Medium–High

#### 15. **Cost Impact Dashboard** 💰
Calculate cost-per-incident by priority/group (tie operational metrics to business value).
- **Inputs**: Support model cost (24×7 vs 24×5), avg MTTR, tools/systems per group
- **Output**: Cost breakdown, ROI of improvements (e.g., "Reducing MTTR by 2h saves $X per incident")
- **Effort**: Medium | **Impact**: High

---

## Recommended Quick Wins (3-Week Roadmap)

**Week 1**:
- ✅ **#3: SLA Aging Alert System** (easy, high-value)
- ✅ **#9: Service-to-Group Affinity Matrix** (adds to Comparison page)

**Week 2**:
- ✅ **#7: Tower/SDM Scorecard with Trends** (update existing component)
- ✅ **#10: Incident Ownership Dashboard** (new page, quick win)

**Week 3**:
- ✅ **#12: SLA Variance Report** (export feature)
- ✅ **#1: Burndown vs Capacity Heatmap** (adds to Comparison)

**Delivers**:
- 📈 Business value: Cost visibility + SLA tracking
- 👥 Team value: Ownership transparency + performance fairness
- 🔧 Operational value: Proactive alerts + route optimization

---

## Current Data Scale

**Production Dataset**:
| Metric | Value |
|--------|-------|
| Total Incidents | 5,000+ |
| Date Range | Nov 2025 – Apr 2026 (6 months) |
| Assignment Groups | 96 |
| Towers | 4 (A&I, D&A, DES, SAP) |
| Service Delivery Managers | 8 |
| Categories | 10+ |
| Update Frequency | Real-time (via API) |

---

## Support & Documentation

- **API Docs**: http://localhost:8000/docs (interactive SwaggerUI)
- **Jupyter Notebooks**: `/notebooks/` directory
  - `M1_Monitoring_Dashboard.ipynb` — KPI methodology
  - `M2_Trend_Analysis.ipynb` — Time series & forecasting
  - `M3_Smart_Triage.ipynb` — Priority classification & audit
  - `M6_SLA_Breach_Analysis.ipynb` — Contract compliance & aging
  - `Tower_SDM_Analytics.ipynb` — Benchmarking methodology
- **Architecture**: See `CLAUDE.md` for file map and design decisions
- **Issues**: https://github.com/anirudhasi/Servicenow-platform/issues
