"""
Insights Engine — rule-based analytical insights for each chart module.
Returns structured insight objects consumed by the frontend InsightCard component.
"""
from fastapi import APIRouter, Query
from typing import Optional, List
import pandas as pd
import numpy as np

from app.data_loader import get_dataframe, apply_filters

router = APIRouter(prefix="/insights", tags=["Insights Engine"])


def _sev(value, warn_thresh, crit_thresh, reverse=False):
    """Severity helper: low=green, medium=amber, high=red."""
    if reverse:
        if value >= warn_thresh:   return "positive"
        if value >= crit_thresh:   return "warning"
        return "critical"
    else:
        if value < warn_thresh:    return "positive"
        if value < crit_thresh:    return "warning"
        return "critical"


@router.get("/monitoring")
def get_monitoring_insights(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    insights = []

    # ── SLA Compliance ──
    sla_pct = 100 * df["made_sla_bool"].sum() / len(df) if len(df) else 0
    insights.append({
        "id": "sla_compliance",
        "title": "SLA Compliance",
        "message": f"Overall SLA compliance is {sla_pct:.1f}%. "
                   + ("Performance is strong — maintain current response times." if sla_pct >= 90
                      else f"Below 90% target. {int(len(df) * (1 - sla_pct/100))} incidents breached SLA this period."),
        "severity": _sev(sla_pct, 90, 80, reverse=True),
        "metric": f"{sla_pct:.1f}%",
        "chart": "sla_gauge",
    })

    # ── P1/P2 Backlog ──
    critical = df[df["priority"].isin([1,2]) & df["state"].isin(["Open","In Progress","On Hold"])]
    insights.append({
        "id": "critical_backlog",
        "title": "Critical & High Priority Backlog",
        "message": f"{len(critical)} P1/P2 incidents are currently unresolved. "
                   + ("Immediate escalation review recommended." if len(critical) > 10
                      else "Critical backlog is within acceptable limits."),
        "severity": _sev(len(critical), 5, 10),
        "metric": str(len(critical)),
        "chart": "priority_heatmap",
    })

    # ── Top Overloaded Group ──
    active = df[df["state"].isin(["Open","In Progress","On Hold"])]
    if len(active):
        top_group = active["first_assignment_group"].value_counts().idxmax()
        top_count = active["first_assignment_group"].value_counts().max()
        avg_active = len(active) / active["first_assignment_group"].nunique()
        insights.append({
            "id": "group_load",
            "title": "Assignment Group Workload",
            "message": f"{top_group} carries the highest active load ({top_count} tickets, "
                       f"{top_count/avg_active:.1f}x the average). Consider load balancing.",
            "severity": _sev(top_count / avg_active, 1.3, 1.7),
            "metric": f"{top_count} active",
            "chart": "by_group",
        })

    # ── Reassignment Rate ──
    avg_reass = df["reassignment_count"].mean()
    high_reass = df[df["reassignment_count"] >= 3]
    insights.append({
        "id": "reassignment",
        "title": "Reassignment Rate",
        "message": f"Average reassignment count is {avg_reass:.2f} per incident. "
                   + (f"{len(high_reass)} tickets reassigned 3+ times — review routing rules."
                      if len(high_reass) > 5 else "Reassignment rate is within normal bounds."),
        "severity": _sev(avg_reass, 0.8, 1.5),
        "metric": f"{avg_reass:.2f} avg",
        "chart": "by_group",
    })

    # ── On Hold Analysis ──
    on_hold = df[df["state"] == "On Hold"]
    hold_pct = 100 * len(on_hold) / len(df) if len(df) else 0
    insights.append({
        "id": "on_hold",
        "title": "On-Hold Incidents",
        "message": f"{len(on_hold)} incidents ({hold_pct:.1f}%) are on hold. "
                   + ("High hold rate may indicate supplier dependency or approval bottlenecks."
                      if hold_pct > 10 else "Hold queue is within acceptable levels."),
        "severity": _sev(hold_pct, 8, 15),
        "metric": f"{hold_pct:.1f}%",
        "chart": "reopen_tracker",
    })

    # ── Top Category ──
    if len(df):
        top_cat = df["category"].value_counts().idxmax()
        top_cat_pct = 100 * df["category"].value_counts().max() / len(df)
        insights.append({
            "id": "top_category",
            "title": "Dominant Incident Category",
            "message": f"'{top_cat}' accounts for {top_cat_pct:.1f}% of all incidents. "
                       + ("High concentration suggests a systemic issue or process gap worth investigating."
                          if top_cat_pct > 25 else "Incident distribution across categories is balanced."),
            "severity": _sev(top_cat_pct, 25, 35),
            "metric": f"{top_cat_pct:.1f}%",
            "chart": "by_category",
        })

    return insights


@router.get("/trends")
def get_trends_insights(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    insights = []

    monthly = df.groupby("month").size().reset_index(name="count").sort_values("month")

    # ── Volume Trend ──
    if len(monthly) >= 2:
        recent  = monthly["count"].iloc[-1]
        prev    = monthly["count"].iloc[-2]
        delta   = (recent - prev) / max(prev, 1) * 100
        insights.append({
            "id": "volume_trend",
            "title": "Monthly Volume Trend",
            "message": f"Incident volume {'increased' if delta > 0 else 'decreased'} by {abs(delta):.1f}% "
                       f"vs the prior period ({prev} → {recent}). "
                       + ("Investigate root cause of surge." if delta > 15
                          else "Stable trend — no immediate concern." if abs(delta) < 5
                          else "Monitor closely over next period."),
            "severity": _sev(abs(delta), 10, 20),
            "metric": f"{delta:+.1f}%",
            "chart": "volume",
        })

    # ── MTTR Trend ──
    resolved = df[df["mttr_hours"].notna()]
    monthly_mttr = resolved.groupby("month")["mttr_hours"].mean()
    if len(monthly_mttr) >= 2:
        m_recent = monthly_mttr.iloc[-1]
        m_prev   = monthly_mttr.iloc[-2]
        mttr_delta = m_recent - m_prev
        insights.append({
            "id": "mttr_trend",
            "title": "MTTR Trajectory",
            "message": f"Mean Time to Resolve is {m_recent:.1f} hrs (prev period: {m_prev:.1f} hrs). "
                       + ("Resolution times are improving — positive trend." if mttr_delta < -1
                          else "MTTR is stable." if abs(mttr_delta) < 1
                          else "MTTR deteriorating — review resolver capacity and ticket complexity."),
            "severity": _sev(mttr_delta, 0, 5),
            "metric": f"{m_recent:.1f}h",
            "chart": "mttr",
        })

    # ── Worst Performing Category ──
    cat_mttr = resolved.groupby("category")["mttr_hours"].mean().sort_values(ascending=False)
    if len(cat_mttr):
        worst_cat = cat_mttr.index[0]
        worst_mttr = cat_mttr.iloc[0]
        insights.append({
            "id": "worst_category_mttr",
            "title": "Slowest Category to Resolve",
            "message": f"'{worst_cat}' has the highest average MTTR at {worst_mttr:.1f} hours. "
                       + "Consider dedicated knowledge articles, automation, or routing optimisation.",
            "severity": _sev(worst_mttr, 24, 72),
            "metric": f"{worst_mttr:.1f}h",
            "chart": "category_distribution",
        })

    # ── SLA Trend ──
    monthly_sla = df.groupby("month")["made_sla_bool"].mean() * 100
    if len(monthly_sla) >= 2:
        sla_recent = monthly_sla.iloc[-1]
        sla_prev   = monthly_sla.iloc[-2]
        insights.append({
            "id": "sla_trend",
            "title": "SLA Compliance Trend",
            "message": f"SLA compliance this period: {sla_recent:.1f}% (prev: {sla_prev:.1f}%). "
                       + ("Compliance improving — good operational progress." if sla_recent > sla_prev
                          else "Compliance declining — prioritise P1/P2 response times."),
            "severity": _sev(sla_recent, 90, 80, reverse=True),
            "metric": f"{sla_recent:.1f}%",
            "chart": "sla_compliance",
        })

    # ── Forecast Insight ──
    if len(monthly) >= 4:
        x = np.arange(len(monthly))
        y = monthly["count"].values
        coeffs = np.polyfit(x, y, 1)
        slope  = coeffs[0]
        insights.append({
            "id": "forecast",
            "title": "Volume Forecast Signal",
            "message": f"Linear trend slope: {slope:+.1f} incidents/period. "
                       + ("Upward trend detected. Infrastructure capacity planning recommended."
                          if slope > 5 else "Downward trend. Potential improvement from recent initiatives."
                          if slope < -5 else "Volume is stable with no significant directional drift."),
            "severity": _sev(abs(slope), 5, 15),
            "metric": f"{slope:+.1f}/period",
            "chart": "forecast",
        })

    return insights
