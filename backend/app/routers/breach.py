"""
SLA Breach Intelligence — REST endpoints
Anchored to contractual SLB SLA targets from sla_rules.py:
  P1: Response 15min  | Resolution 4h   (24×7)
  P2: Response 1h     | Resolution 8h   (24×7)
  P3: Response 4h     | Resolution 72bh (24×5)
  P4: Response 4h     | Resolution 120bh(24×5)
  KPI: First-time-right ≤1% reopen | 95% resolved ≤30d | CSAT ≥4.5
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd
from fastapi import APIRouter

from app.knowledge.sla_rules import SLA_RESOLUTION, KPI_TARGETS

router  = APIRouter(prefix="/breach", tags=["SLA Breach Intelligence"])
TODAY   = datetime(2026, 6, 4, 14, 0, 0)
_CSV    = os.path.join(os.path.dirname(__file__), "..", "..", "data", "sla_breach.csv")

# Resolution SLA in business hours keyed by priority int
SLA_RES_H = {p: v["business_hours"] for p, v in SLA_RESOLUTION.items()}


def _safe(v, d=0.0):
    try:
        f = float(v)
        return d if (np.isnan(f) or np.isinf(f)) else round(f, 1)
    except Exception:
        return d


@lru_cache(maxsize=1)
def _load() -> pd.DataFrame:
    df = pd.read_csv(_CSV, dtype=str, low_memory=False)
    df.columns = (
        df.columns.str.strip().str.lower()
        .str.replace(r"[\s\-\/]+", "_", regex=True)
        .str.replace(r"[^\w]", "", regex=True)
    )

    for col in ["created", "breach_time", "stop_time", "last_assignment_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    for col in ["reassignment_count", "reopen_count", "actual_time_left"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    df["business_elapsed_percentage"] = pd.to_numeric(
        df["business_elapsed_percentage"], errors="coerce").fillna(0)

    # Priority integer
    df["priority_num"] = (
        df["priority"].str.extract(r"^(\d)").astype(float).fillna(4).astype(int))

    # Contractual SLA hours for each ticket's priority
    df["sla_resolution_hours"] = df["priority_num"].map(SLA_RES_H).fillna(120)

    # Derived flags
    df["already_breached"] = df["business_elapsed_percentage"] >= 100
    df["on_hold"]          = df["state"].str.strip().eq("On Hold")
    df["has_bug_link"]     = df["internal_id"].fillna("").str.strip().ne("")

    # Overdue business hours (breached tickets only)
    df["overdue_biz_hours"] = np.where(
        df["already_breached"],
        ((df["business_elapsed_percentage"] - 100) / 100 * df["sla_resolution_hours"]).round(1),
        0.0,
    )

    # Remaining business hours (not-yet-breached)
    df["remaining_biz_hours"] = np.where(
        ~df["already_breached"],
        ((100 - df["business_elapsed_percentage"]) / 100 * df["sla_resolution_hours"]).round(1),
        0.0,
    )

    # Assignment ownership age — how many hours the current assignee has held this ticket
    df["assignment_age_h"] = np.where(
        df["last_assignment_date"].notna(),
        (TODAY - df["last_assignment_date"]).dt.total_seconds() / 3600,
        np.nan,
    )
    df["assignment_age_h"] = df["assignment_age_h"].clip(lower=0).round(1)

    # Breach date (date-only string)
    df["breach_date"] = df["breach_time"].dt.date.astype(str)

    # Urgency bucket
    def _urgency(row):
        if row["already_breached"]:
            return "Already Breached"
        h = row["remaining_biz_hours"]
        if row["on_hold"]:
            return "On Hold (Paused)"
        if h <= 4:   return "Breaching <4h"
        if h <= 24:  return "Breaching Today"
        if h <= 72:  return "Breaching This Week"
        return "Breaching Later"
    df["urgency"] = df.apply(_urgency, axis=1)

    # SLA compliance label (how well within SLA the ticket is)
    def _sla_severity(pct):
        if pct >= 100: return "Breached"
        if pct >= 90:  return "Critical (90–100%)"
        if pct >= 75:  return "At Risk (75–90%)"
        if pct >= 50:  return "Caution (50–75%)"
        return "Healthy (<50%)"
    df["sla_severity"] = df["business_elapsed_percentage"].apply(_sla_severity)

    return df


# ── 1. KPIs (contract-referenced) ────────────────────────────────────────────

@router.get("/kpis")
def get_kpis():
    df = _load()
    already  = int(df["already_breached"].sum())
    on_hold  = int(df["on_hold"].sum())
    crit_hi  = int((df["priority_num"] <= 2).sum())
    # Breaching within 24h (In Progress only, not On Hold)
    breach_24h = int(
        (~df["already_breached"] & ~df["on_hold"] & (df["remaining_biz_hours"] <= 24)).sum()
    )
    avg_elapsed  = _safe(df["business_elapsed_percentage"].mean())
    avg_overdue  = _safe(df.loc[df["already_breached"], "overdue_biz_hours"].mean())
    avg_assign_h = _safe(df["assignment_age_h"].mean())
    bug_linked   = int(df["has_bug_link"].sum())

    # On Hold SLA restart risk: On Hold tickets where elapsed% > 75%
    hold_restart_risk = int(
        (df["on_hold"] & (df["business_elapsed_percentage"] >= 75)).sum()
    )

    # Aging KPI — % with remaining_biz_hours (all tickets, simulate 30-day target)
    days_open = ((TODAY - df["created"]).dt.total_seconds() / 86400).clip(lower=0)
    over_30d  = int((days_open > 30).sum())
    aging_kpi_target = KPI_TARGETS["tickets_aging"]["threshold_pct"]

    return {
        "total":                   int(len(df)),
        "already_breached":        already,
        "breached_pct":            round(100 * already / len(df), 1),
        "on_hold":                 on_hold,
        "on_hold_pct":             round(100 * on_hold / len(df), 1),
        "hold_restart_risk":       hold_restart_risk,
        "critical_high":           crit_hi,
        "breaching_24h":           breach_24h,
        "avg_elapsed_pct":         float(avg_elapsed),
        "avg_overdue_hours":       float(avg_overdue),
        "avg_assignment_age_h":    float(avg_assign_h),
        "bug_linked":              bug_linked,
        "over_30_days":            over_30d,
        "aging_kpi_target_pct":    aging_kpi_target,
        "urgency_breakdown":       {k: int(v) for k, v in df["urgency"].value_counts().items()},
        "sla_severity_breakdown":  {k: int(v) for k, v in df["sla_severity"].value_counts().items()},
    }


# ── 2. Breach Timeline ────────────────────────────────────────────────────────

@router.get("/timeline")
def get_timeline():
    df = _load()
    ws = (TODAY - timedelta(days=7)).date()
    we = (TODAY + timedelta(days=14)).date()
    win = df[df["breach_time"].notna()
             & (df["breach_time"].dt.date >= ws)
             & (df["breach_time"].dt.date <= we)].copy()
    if win.empty:
        return []
    g = (win.groupby("breach_date")
         .agg(count=("task","count"), already_breached=("already_breached","sum"))
         .reset_index().rename(columns={"breach_date":"date"}).sort_values("date"))
    today_s = TODAY.date().isoformat()
    g["is_today"]  = g["date"] == today_s
    g["is_past"]   = g["date"] < today_s
    g["is_future"] = g["date"] > today_s
    g["upcoming"]  = (g["count"] - g["already_breached"]).clip(lower=0)
    return g.to_dict(orient="records")


# ── 3. SLA Compliance by Priority (contract-anchored) ────────────────────────

@router.get("/sla-compliance")
def get_sla_compliance():
    df = _load()
    result = []
    for p in [1, 2, 3, 4]:
        sub = df[df["priority_num"] == p]
        if sub.empty:
            continue
        total    = len(sub)
        breached = int(sub["already_breached"].sum())
        compliant = total - breached
        result.append({
            "priority":           p,
            "priority_label":     SLA_RESOLUTION[p]["label"],
            "sla_target":         f"{SLA_RESOLUTION[p]['business_hours']}h",
            "sla_hours":          SLA_RESOLUTION[p]["business_hours"],
            "total":              total,
            "compliant":          compliant,
            "breached":           breached,
            "compliance_pct":     round(100 * compliant / total, 1) if total else 0,
            "avg_elapsed_pct":    _safe(sub["business_elapsed_percentage"].mean()),
            "avg_overdue_hours":  _safe(sub.loc[sub["already_breached"], "overdue_biz_hours"].mean()),
        })
    return result


# ── 4. Service Pareto ─────────────────────────────────────────────────────────

@router.get("/by-service")
def get_by_service(top_n: int = 12):
    df = _load()
    svc = (df.groupby("service_offering")
           .agg(count=("task","count"),
                already_breached=("already_breached","sum"),
                avg_elapsed_pct=("business_elapsed_percentage","mean"),
                on_hold_count=("on_hold","sum"),
                avg_overdue_hours=("overdue_biz_hours","mean"))
           .reset_index().sort_values("count", ascending=False).head(top_n))
    svc["pct_total"]       = (svc["count"] / len(df) * 100).round(1)
    svc["avg_elapsed_pct"] = svc["avg_elapsed_pct"].round(1)
    svc["avg_overdue_hours"] = svc["avg_overdue_hours"].apply(lambda v: _safe(v))
    svc["already_breached"]  = svc["already_breached"].astype(int)
    svc["on_hold_count"]     = svc["on_hold_count"].astype(int)
    svc["cumulative_pct"]    = (svc["count"].cumsum() / len(df) * 100).round(1)
    return svc.reset_index(drop=True).to_dict(orient="records")


# ── 5. Group × State ──────────────────────────────────────────────────────────

@router.get("/by-group")
def get_by_group():
    df = _load()
    grp = (df.groupby(["assignment_group","state"]).size()
           .unstack(fill_value=0).reset_index())
    for s in ["On Hold","In Progress"]:
        if s not in grp.columns: grp[s] = 0
    grp["total"] = grp.get("On Hold",0) + grp.get("In Progress",0)
    grp = grp.rename(columns={"assignment_group":"group"})
    stats = (df.groupby("assignment_group")
             .agg(avg_elapsed_pct=("business_elapsed_percentage","mean"),
                  already_breached=("already_breached","sum"),
                  critical_high=("priority_num", lambda x: (x<=2).sum()),
                  avg_assignment_age_h=("assignment_age_h","mean"))
             .reset_index().rename(columns={"assignment_group":"group"}))
    stats["avg_elapsed_pct"]     = stats["avg_elapsed_pct"].round(1)
    stats["already_breached"]    = stats["already_breached"].astype(int)
    stats["critical_high"]       = stats["critical_high"].astype(int)
    stats["avg_assignment_age_h"]= stats["avg_assignment_age_h"].apply(lambda v: _safe(v))
    return (grp.merge(stats, on="group", how="left")
            .sort_values("total", ascending=False).to_dict(orient="records"))


# ── 6. Elapsed % Distribution ─────────────────────────────────────────────────

@router.get("/elapsed-distribution")
def get_elapsed_distribution():
    df = _load()
    bins   = [0, 25, 50, 75, 90, 100, 200]
    labels = ["0–25% Healthy","25–50% Caution","50–75% Elevated","75–90% At Risk","90–100% Critical",">100% Breached"]
    df["bucket"] = pd.cut(
        df["business_elapsed_percentage"], bins=bins, labels=labels, right=True)
    dist = (df.groupby(["bucket","assignment_group"], observed=True)
            .size().reset_index(name="count"))
    pivot = (dist.pivot_table(index="bucket", columns="assignment_group",
                              values="count", fill_value=0).reset_index())
    pivot.columns.name = None
    pivot = pivot.rename(columns={"bucket":"range"})
    pivot["total"] = pivot.drop(columns=["range"]).sum(axis=1)
    pivot["_ord"]  = pivot["range"].map({l:i for i,l in enumerate(labels)})
    return pivot.sort_values("_ord").drop(columns=["_ord"]).to_dict(orient="records")


# ── 7. Assignment Age Analysis (NEW — uses Last Assignment Date) ──────────────

@router.get("/assignment-age")
def get_assignment_age():
    df = _load()
    valid = df[df["assignment_age_h"].notna()].copy()
    if valid.empty:
        return {"summary": [], "by_group": [], "age_distribution": []}

    # Age buckets
    bins   = [0, 4, 8, 24, 72, 168, 99999]
    labels = ["<4h","4–8h","8–24h","1–3 days","3–7 days",">7 days"]
    valid["age_bucket"] = pd.cut(
        valid["assignment_age_h"], bins=bins, labels=labels, right=True)

    age_dist = (valid.groupby(["age_bucket","state"], observed=True)
                .size().reset_index(name="count"))
    age_pivot = (age_dist.pivot_table(index="age_bucket", columns="state",
                                      values="count", fill_value=0).reset_index())
    age_pivot.columns.name = None
    age_pivot = age_pivot.rename(columns={"age_bucket":"bucket"})
    for s in ["On Hold","In Progress"]:
        if s not in age_pivot.columns: age_pivot[s] = 0
    age_pivot["total"] = age_pivot.get("On Hold",0) + age_pivot.get("In Progress",0)
    age_pivot["_ord"]  = age_pivot["bucket"].map({l:i for i,l in enumerate(labels)})
    age_pivot = age_pivot.sort_values("_ord").drop(columns=["_ord"])

    # By group
    by_grp = (valid.groupby("assignment_group")
              .agg(avg_age_h=("assignment_age_h","mean"),
                   max_age_h=("assignment_age_h","max"),
                   over_7d=("assignment_age_h", lambda x: (x>168).sum()),
                   count=("task","count"))
              .reset_index().rename(columns={"assignment_group":"group"}))
    by_grp["avg_age_h"] = by_grp["avg_age_h"].round(1)
    by_grp["max_age_h"] = by_grp["max_age_h"].round(1)
    by_grp["over_7d"]   = by_grp["over_7d"].astype(int)

    # Agent-level (top 10 by max ownership age)
    valid["agent_name"] = valid["assigned_to"].str.extract(r"^(.*?)\s*\(").fillna(valid["assigned_to"])
    agent = (valid.groupby("agent_name")
             .agg(avg_age_h=("assignment_age_h","mean"),
                  max_age_h=("assignment_age_h","max"),
                  count=("task","count"),
                  already_breached=("already_breached","sum"))
             .reset_index().sort_values("avg_age_h", ascending=False).head(10))
    agent["avg_age_h"] = agent["avg_age_h"].round(1)
    agent["max_age_h"] = agent["max_age_h"].round(1)
    agent["already_breached"] = agent["already_breached"].astype(int)

    return {
        "overall_avg_age_h":    _safe(valid["assignment_age_h"].mean()),
        "overall_max_age_h":    _safe(valid["assignment_age_h"].max()),
        "over_7d_count":        int((valid["assignment_age_h"] > 168).sum()),
        "age_distribution":     age_pivot.to_dict(orient="records"),
        "by_group":             by_grp.to_dict(orient="records"),
        "by_agent":             agent.to_dict(orient="records"),
    }


# ── 8. Reassignment Impact ────────────────────────────────────────────────────

@router.get("/reassignment-impact")
def get_reassignment_impact():
    df = _load()
    impact = (df.groupby("reassignment_count")
              .agg(count=("task","count"),
                   avg_elapsed_pct=("business_elapsed_percentage","mean"),
                   breach_rate=("already_breached","mean"),
                   avg_assignment_age_h=("assignment_age_h","mean"))
              .reset_index())
    impact["avg_elapsed_pct"]     = impact["avg_elapsed_pct"].round(1)
    impact["breach_rate"]         = (impact["breach_rate"] * 100).round(1)
    impact["avg_assignment_age_h"]= impact["avg_assignment_age_h"].apply(lambda v: _safe(v))
    return impact.to_dict(orient="records")


# ── 9. Priority Breakdown ─────────────────────────────────────────────────────

@router.get("/priority-breakdown")
def get_priority_breakdown():
    df = _load()
    summary = (df.groupby("priority")
               .agg(count=("task","count"),
                    already_breached=("already_breached","sum"),
                    avg_elapsed_pct=("business_elapsed_percentage","mean"),
                    avg_overdue_hours=("overdue_biz_hours","mean"))
               .reset_index())
    summary["avg_elapsed_pct"]   = summary["avg_elapsed_pct"].round(1)
    summary["avg_overdue_hours"] = summary["avg_overdue_hours"].apply(lambda v: _safe(v))
    summary["already_breached"]  = summary["already_breached"].astype(int)
    summary["breach_rate"] = (
        summary["already_breached"] / summary["count"] * 100).round(1)
    # Add SLA target for each priority
    def _add_sla(row):
        try:
            p = int(row["priority"].split()[0])
            row["sla_resolution_label"] = SLA_RESOLUTION[p]["label"]
            row["sla_resolution_hours"] = SLA_RESOLUTION[p]["business_hours"]
        except Exception:
            row["sla_resolution_label"] = "Unknown"
            row["sla_resolution_hours"] = 0
        return row
    summary = summary.apply(_add_sla, axis=1)
    return {
        "summary":  summary.to_dict(orient="records"),
    }


# ── 10. On Hold Risk Analysis ─────────────────────────────────────────────────

@router.get("/on-hold-analysis")
def get_on_hold_analysis():
    df = _load()
    oh = df[df["on_hold"]].copy()
    ip = df[~df["on_hold"]].copy()

    oh["hold_dur_days"] = (
        (TODAY - oh["stop_time"]).dt.total_seconds().div(86400).fillna(0).clip(lower=0).round(1))

    bins   = [0,1,3,7,14,30,999]
    labels = ["<1 day","1–3 days","3–7 days","7–14 days","14–30 days",">30 days"]
    oh["hold_age"]= pd.cut(oh["hold_dur_days"], bins=bins, labels=labels, right=True)
    hold_dist = (oh.groupby("hold_age", observed=True).size()
                 .reset_index(name="count").rename(columns={"hold_age":"age_bucket"}))
    hold_dist["age_bucket"]   = hold_dist["age_bucket"].astype(str)
    hold_dist["is_risk"]      = hold_dist["age_bucket"].isin(["7–14 days","14–30 days",">30 days"])

    by_grp = (df.groupby(["assignment_group","state"]).size()
              .unstack(fill_value=0).reset_index()
              .rename(columns={"assignment_group":"group"}))
    for s in ["On Hold","In Progress"]:
        if s not in by_grp.columns: by_grp[s] = 0

    # Restart risk: On Hold tickets that would breach quickly if resumed
    restart_risk = int(
        (oh["business_elapsed_percentage"] >= 75).sum())

    return {
        "total_on_hold":        int(len(oh)),
        "total_in_progress":    int(len(ip)),
        "on_hold_pct":          round(100 * len(oh) / len(df), 1),
        "avg_hold_days":        _safe(oh["hold_dur_days"].mean()),
        "avg_elapsed_on_hold":  _safe(oh["business_elapsed_percentage"].mean()),
        "avg_elapsed_in_prog":  _safe(ip["business_elapsed_percentage"].mean()),
        "restart_risk_count":   restart_risk,
        "hold_age_distribution":hold_dist.to_dict(orient="records"),
        "by_group":             by_grp.to_dict(orient="records"),
    }


# ── 11. KPI Scorecard (contract KPIs) ─────────────────────────────────────────

@router.get("/kpi-scorecard")
def get_kpi_scorecard():
    df = _load()

    # Aging KPI — % open tickets older than 30 days
    days_open = ((TODAY - df["created"]).dt.total_seconds() / 86400).clip(lower=0)
    over_30 = int((days_open > 30).sum())
    within_30_pct = round(100 * (1 - over_30 / len(df)), 1)

    # Reopen rate (from reopen_count; proxy for "first time right")
    total_reopen  = int(df["reopen_count"].sum())
    reopen_rate   = round(100 * total_reopen / max(len(df), 1), 2)
    ftr_ok        = reopen_rate <= KPI_TARGETS["first_time_right"]["threshold_pct"]

    # Bug-linked tickets (need change management, not operational)
    bug_pct = round(100 * df["has_bug_link"].mean(), 1)

    return {
        "aging_kpi": {
            "label":       "Tickets Aging",
            "target":      f"95% resolved ≤30 days",
            "target_pct":  95.0,
            "actual_pct":  within_30_pct,
            "over_30_days":over_30,
            "status":      "PASS" if within_30_pct >= 95 else "FAIL",
        },
        "first_time_right": {
            "label":      "First Time Right",
            "target":     "Reopen ≤1% of closed",
            "target_pct": 1.0,
            "actual_pct": reopen_rate,
            "status":     "PASS" if ftr_ok else "FAIL",
        },
        "bug_linked": {
            "label":   "Bug-Linked (Change needed)",
            "count":   int(df["has_bug_link"].sum()),
            "pct":     bug_pct,
            "note":    "Requires change/defect escalation, not operational resolution",
        },
        "p1_p2_breach": {
            "label":   "P1/P2 SLA Breach",
            "target":  "Zero tolerance — P1 4h, P2 8h",
            "p1_breached": int(df[(df["priority_num"]==1) & df["already_breached"]].shape[0]),
            "p2_breached": int(df[(df["priority_num"]==2) & df["already_breached"]].shape[0]),
            "status":  "FAIL" if df[(df["priority_num"]<=2) & df["already_breached"]].shape[0] > 0 else "PASS",
        },
    }
