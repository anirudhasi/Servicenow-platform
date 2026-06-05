"""
M1 Monitoring Dashboard — REST endpoints
"""
from fastapi import APIRouter, Query
from typing import Optional, List
import pandas as pd
import numpy as np

from app.data_loader import get_dataframe, apply_filters, get_filter_options

router = APIRouter(prefix="/monitoring", tags=["M1 Monitoring"])


def _parse_filters(
    date_from: Optional[str],
    date_to: Optional[str],
    groups: Optional[List[str]],
    priorities: Optional[List[int]],
    categories: Optional[List[str]],
    states: Optional[List[str]],
    sla: Optional[str],
) -> dict:
    return {k: v for k, v in dict(
        date_from=date_from, date_to=date_to, groups=groups,
        priorities=priorities, categories=categories,
        states=states, sla=sla,
    ).items() if v is not None}


@router.get("/filters")
def get_filters():
    """Return all available filter option values."""
    return get_filter_options(get_dataframe())


@router.get("/kpis")
def get_kpis(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
    categories: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, priorities, categories, None, None))
    active = df[df["state"].isin(["Open", "In Progress", "On Hold"])]
    resolved = df[df["state"].isin(["Resolved", "Closed"])]

    avg_mttr = resolved["mttr_hours"].mean()
    avg_mttr = round(avg_mttr, 1) if not np.isnan(avg_mttr) else 0

    sla_breaches = int(df[df["made_sla_bool"] == False].shape[0])
    compliance = round(100 * df["made_sla_bool"].sum() / len(df), 1) if len(df) else 0

    return {
        "total_active":       int(len(active)),
        "total_incidents":    int(len(df)),
        "critical_p1":        int(df[df["priority"] == 1].shape[0]),
        "high_p2":            int(df[df["priority"] == 2].shape[0]),
        "sla_breaches":       sla_breaches,
        "sla_compliance_pct": float(compliance),
        "avg_mttr_hours":     float(avg_mttr),
        "reopen_count":       int(df["reopen_count"].sum()),
        "on_hold":            int(df[df["state"] == "On Hold"].shape[0]),
        "reassignments":      int(df["reassignment_count"].sum()),
    }


@router.get("/by-group")
def get_by_group(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    priorities: Optional[List[int]] = Query(default=None),
    categories: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, None, priorities, categories, None, None))
    grp = df.groupby(["assignment_group", "state"]).size().unstack(fill_value=0)
    for col in ["Open", "In Progress", "On Hold", "Resolved", "Closed"]:
        if col not in grp.columns:
            grp[col] = 0
    grp = grp.reset_index().rename(columns={"assignment_group": "group"})
    grp["total"] = grp[["Open","In Progress","On Hold","Resolved","Closed"]].sum(axis=1)
    grp = grp.sort_values("total", ascending=False)
    return grp.to_dict(orient="records")


@router.get("/by-category")
def get_by_category(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
    states: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, priorities, None, states, None))
    cat = df.groupby("category").size().reset_index(name="count").sort_values("count", ascending=False)
    total = cat["count"].sum()
    cat["percentage"] = (cat["count"] / total * 100).round(1)
    return cat.to_dict(orient="records")


@router.get("/sla-kpi")
def get_sla_kpi(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, priorities, None, None, None))
    total   = len(df)
    met     = int(df["made_sla_bool"].sum())
    breached = total - met
    by_priority = []
    for p in [1, 2, 3, 4]:
        sub = df[df["priority"] == p]
        if len(sub):
            by_priority.append({
                "priority": p,
                "label": f"P{p}",
                "total": len(sub),
                "met": int(sub["made_sla_bool"].sum()),
                "compliance": round(100 * sub["made_sla_bool"].sum() / len(sub), 1),
            })
    return {
        "total": total,
        "met": met,
        "breached": breached,
        "compliance_pct": round(100 * met / total, 1) if total else 0,
        "by_priority": by_priority,
    }


@router.get("/priority-heatmap")
def get_priority_heatmap(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    categories: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, None, None, categories, None, None))
    piv = df.pivot_table(index="assignment_group", columns="priority", values="number",
                          aggfunc="count", fill_value=0)
    for p in [1, 2, 3, 4]:
        if p not in piv.columns:
            piv[p] = 0
    piv = piv[[1, 2, 3, 4]].reset_index().rename(
        columns={"assignment_group": "group", 1: "p1", 2: "p2", 3: "p3", 4: "p4"})
    piv["total"] = piv[["p1","p2","p3","p4"]].sum(axis=1)
    return piv.sort_values("total", ascending=False).to_dict(orient="records")


@router.get("/reopen-tracker")
def get_reopen_tracker(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, None, None, None, None))
    reopened = df[df["reopen_count"] > 0].copy()
    monthly = reopened.groupby("month").agg(
        reopen_count=("reopen_count", "sum"),
        incident_count=("number", "count"),
    ).reset_index().rename(columns={"month": "period"})
    top_tickets = reopened.nlargest(10, "reopen_count")[
        ["number","short_description","assignment_group","priority","reopen_count","state"]
    ].to_dict(orient="records")
    return {
        "monthly_trend": monthly.to_dict(orient="records"),
        "top_reopened": top_tickets,
        "total_reopened": int(len(reopened)),
        "total_reopen_events": int(reopened["reopen_count"].sum()),
    }


@router.get("/incidents")
def get_incidents(
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
    categories: Optional[List[str]] = Query(default=None),
    states: Optional[List[str]] = Query(default=None),
    sla: Optional[str] = None,
    sort_by: str = "created",
    sort_dir: str = "desc",
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, priorities, categories, states, sla))

    if search:
        mask = (
            df["number"].str.contains(search, case=False, na=False) |
            df["short_description"].str.contains(search, case=False, na=False) |
            df["impact_user"].str.contains(search, case=False, na=False)
        )
        df = df[mask]

    valid_sort = ["created","priority","state","assignment_group","category","mttr_hours"]
    sort_col = sort_by if sort_by in valid_sort else "created"
    df = df.sort_values(sort_col, ascending=(sort_dir == "asc"))

    total = len(df)
    df_page = df.iloc[(page - 1) * limit : page * limit]

    display_cols = [
        "number","created","impact_user","assignment_group","category","subcategory",
        "priority","priority_label","urgency","state","short_description","made_sla",
        "made_sla_bool","resolved","reopen_count","reassignment_count","mttr_hours",
        "assigned_to","resolution_code","resolution_notes",
    ]
    available = [c for c in display_cols if c in df_page.columns]
    result = df_page[available].copy()
    result["created"]  = result["created"].astype(str)
    result["resolved"] = result["resolved"].astype(str)

    return {
        "data":        result.to_dict(orient="records"),
        "total":       total,
        "page":        page,
        "limit":       limit,
        "total_pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/top-services")
def get_top_services(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    top_n: int = 10,
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, None, None, None, None))
    svc = df[df["service_offering"].str.strip().ne("")]
    counts = svc.groupby("service_offering").size().reset_index(name="count").sort_values("count", ascending=False)
    total = counts["count"].sum()
    counts["percentage"] = (counts["count"] / total * 100).round(1)
    return counts.head(top_n).to_dict(orient="records")


@router.get("/resolution-codes")
def get_resolution_codes(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, priorities, None, None, None))
    resolved = df[df["resolution_code"].str.strip().ne("") & df["resolution_code"].notna()]
    counts = resolved.groupby("resolution_code").size().reset_index(name="count").sort_values("count", ascending=False)
    total = counts["count"].sum()
    counts["percentage"] = (counts["count"] / total * 100).round(1)
    return counts.head(12).to_dict(orient="records")


@router.get("/monthly-volume")
def get_monthly_volume(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), _parse_filters(date_from, date_to, groups, None, None, None, None))
    monthly = df.groupby("month").agg(
        total=("number", "count"),
        resolved=("state", lambda x: (x.isin(["Resolved","Closed"])).sum()),
        reopened=("reopen_count", lambda x: (x > 0).sum()),
        avg_mttr=("mttr_hours", "mean"),
    ).reset_index().rename(columns={"month": "period"})
    monthly["avg_mttr"] = monthly["avg_mttr"].round(1)
    return monthly.sort_values("period").to_dict(orient="records")


@router.get("/last-updated")
def get_last_updated(limit: int = 15):
    df = get_dataframe()
    recent = df.nlargest(limit, "updated")[
        ["number","updated","state","assignment_group","short_description","priority","updated_by"]
    ].copy()
    recent["updated"] = recent["updated"].astype(str)
    return recent.to_dict(orient="records")
