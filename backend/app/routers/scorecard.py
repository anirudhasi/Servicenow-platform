"""
M6 SDM Scorecard — Service Delivery Manager performance view.

Computes AM.01-AM.18 style SLA/KPI metrics across the incident dataset,
optionally broken down by assigned agent.

GET /api/scorecard/summary   → overall AM-metric compliance table
GET /api/scorecard/by-agent  → per-agent SLA breakdown
GET /api/scorecard/monthly   → month-by-month FTF + aging + SLA trend
"""
from __future__ import annotations

import numpy as np
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Query
from app.data_loader import get_dataframe, apply_filters

router = APIRouter(prefix="/scorecard", tags=["M6 SDM Scorecard"])

# ── AM metric definitions ─────────────────────────────────────────────────────
AM_METRICS = [
    {"id": "AM.01", "name": "P1 Incident Response",   "type": "SLA", "priority": 1,
     "target": 97.0, "threshold": 95.0, "window_h": 1,    "description": "P1 acknowledged within 1 hour [24×7]"},
    {"id": "AM.02", "name": "P2 Incident Response",   "type": "SLA", "priority": 2,
     "target": 95.0, "threshold": 90.0, "window_h": 4,    "description": "P2 acknowledged within 4 hours [24×7]"},
    {"id": "AM.03", "name": "P3 Incident Response",   "type": "SLA", "priority": 3,
     "target": 90.0, "threshold": 85.0, "window_h": 4,    "description": "P3 acknowledged within 4 business hours [24×5]"},
    {"id": "AM.04", "name": "P4 Incident Response",   "type": "SLA", "priority": 4,
     "target": 85.0, "threshold": 80.0, "window_h": 8,    "description": "P4 acknowledged within 8 business hours [24×5]"},
    {"id": "AM.05", "name": "P1 Incident Resolution", "type": "SLA", "priority": 1,
     "target": 95.0, "threshold": 90.0, "window_h": 24,   "description": "P1 resolved within 24 hours [24×7]"},
    {"id": "AM.06", "name": "P2 Incident Resolution", "type": "SLA", "priority": 2,
     "target": 95.0, "threshold": 90.0, "window_h": 8,    "description": "P2 resolved within 8 hours [24×7]"},
    {"id": "AM.07", "name": "P3 Incident Resolution", "type": "SLA", "priority": 3,
     "target": 95.0, "threshold": 90.0, "window_h": 12,   "description": "P3 resolved avg within 12 business hours"},
    {"id": "AM.08", "name": "P4 Incident Resolution", "type": "SLA", "priority": 4,
     "target": 95.0, "threshold": 90.0, "window_h": 120,  "description": "P4 resolved within 5 business days (120 h)"},
    {"id": "AM.09", "name": "SR Resolution (Access)",  "type": "SLA", "priority": None,
     "target": 90.0, "threshold": 85.0, "window_h": 24,   "description": "Access-provisioning SRs resolved within SLA"},
    {"id": "AM.10", "name": "SR Resolution (Other)",   "type": "SLA", "priority": None,
     "target": 85.0, "threshold": 80.0, "window_h": 48,   "description": "Other service requests resolved within SLA"},
    {"id": "AM.17", "name": "First Time Fix Rate",     "type": "KPI", "priority": None,
     "target": 55.0, "threshold": 45.0, "window_h": None, "description": "% incidents resolved without reassignment or reopen"},
    {"id": "AM.18", "name": "Ticket Aging ≤30 days",  "type": "KPI", "priority": None,
     "target": 95.0, "threshold": 90.0, "window_h": 720,  "description": "% tickets resolved or active within 30 days"},
]


def _rag(actual: float, target: float, threshold: float) -> str:
    if actual >= target:
        return "green"
    if actual >= threshold:
        return "amber"
    return "red"


def _compute_metric(df, metric: dict) -> dict:
    m   = metric
    pid = m.get("priority")
    sub = df[df["priority"] == pid] if pid else df.copy()

    if m["id"] in ("AM.17",):
        ftf  = sub[(sub["reassignment_count"] == 0) & (sub["reopen_count"] == 0)]
        total = len(sub)
        met   = len(ftf)
        actual = round(100 * met / total, 1) if total else 0.0
        return {**m, "total": total, "met": met, "not_met": total - met,
                "actual": actual, "rag": _rag(actual, m["target"], m["threshold"])}

    if m["id"] in ("AM.18",):
        now = datetime.utcnow()
        aged = sub[
            ((sub["mttr_hours"].notna()) & (sub["mttr_hours"] <= 720)) |
            ((sub["mttr_hours"].isna()) & ((now - sub["created"]).dt.total_seconds() / 3600 <= 720))
        ]
        total  = len(sub)
        met    = len(aged)
        actual = round(100 * met / total, 1) if total else 0.0
        return {**m, "total": total, "met": met, "not_met": total - met,
                "actual": actual, "rag": _rag(actual, m["target"], m["threshold"])}

    if m["id"] in ("AM.09",):
        sub = df[df["category"].str.contains("Access", case=False, na=False)]
    if m["id"] in ("AM.10",):
        sub = df[~df["category"].str.contains("Access", case=False, na=False)]

    window_h = m.get("window_h")
    if window_h and sub["mttr_hours"].notna().any():
        resolved = sub[sub["mttr_hours"].notna()]
        met_mask = resolved["mttr_hours"] <= window_h
        met      = int(met_mask.sum())
        total    = len(resolved)
        actual   = round(100 * met / total, 1) if total else 0.0
    else:
        total  = len(sub)
        met    = int(sub["made_sla_bool"].sum())
        actual = round(100 * met / total, 1) if total else 0.0

    return {**m, "total": total, "met": met, "not_met": total - met,
            "actual": actual, "rag": _rag(actual, m["target"], m["threshold"])}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary")
def scorecard_summary(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    groups:    Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(
        date_from=date_from, date_to=date_to, groups=groups,
    ))
    return [_compute_metric(df, m) for m in AM_METRICS]


@router.get("/by-agent")
def scorecard_by_agent(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    groups:    Optional[List[str]] = Query(default=None),
    top_n:     int = 15,
):
    df = apply_filters(get_dataframe(), dict(
        date_from=date_from, date_to=date_to, groups=groups,
    ))
    df = df[df["assigned_to"].str.strip().ne("") & df["assigned_to"].notna()]
    if df.empty:
        return []

    agents = df["assigned_to"].value_counts().head(top_n).index.tolist()
    rows = []
    for agent in agents:
        a = df[df["assigned_to"] == agent]
        ftf_pct = round(100 * ((a["reassignment_count"] == 0) & (a["reopen_count"] == 0)).sum() / len(a), 1) if len(a) else 0
        sla_pct = round(100 * a["made_sla_bool"].mean(), 1) if len(a) else 0
        avg_mttr = round(float(a["mttr_hours"].mean()), 1) if a["mttr_hours"].notna().any() else None

        by_priority = []
        for p in [1, 2, 3, 4]:
            sub = a[a["priority"] == p]
            if len(sub):
                by_priority.append({
                    "priority": p,
                    "total": len(sub),
                    "met":   int(sub["made_sla_bool"].sum()),
                    "pct":   round(100 * sub["made_sla_bool"].mean(), 1),
                })

        rows.append({
            "agent":        agent,
            "total":        len(a),
            "sla_pct":      sla_pct,
            "ftf_pct":      ftf_pct,
            "avg_mttr":     avg_mttr,
            "by_priority":  by_priority,
        })
    rows.sort(key=lambda r: r["total"], reverse=True)
    return rows


@router.get("/monthly")
def scorecard_monthly(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    groups:    Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(
        date_from=date_from, date_to=date_to, groups=groups,
    ))
    monthly = df.groupby("month").apply(lambda g: {
        "period":    g["month"].iloc[0],
        "total":     len(g),
        "sla_pct":   round(100 * g["made_sla_bool"].mean(), 1),
        "ftf_pct":   round(100 * ((g["reassignment_count"] == 0) & (g["reopen_count"] == 0)).mean(), 1),
        "avg_mttr":  round(float(g["mttr_hours"].mean()), 1) if g["mttr_hours"].notna().any() else None,
    }).tolist()
    return sorted(monthly, key=lambda r: r["period"])
