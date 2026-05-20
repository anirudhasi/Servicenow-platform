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
