"""
M2 Trend Analysis Engine — REST endpoints
"""
from fastapi import APIRouter, Query
from typing import Optional, List
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.data_loader import get_dataframe, apply_filters

router = APIRouter(prefix="/trends", tags=["M2 Trend Analysis"])


def _resample_key(granularity: str):
    return {"day": "date", "week": "week", "month": "month"}.get(granularity, "month")


@router.get("/volume")
def get_volume(
    granularity: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
    categories: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(
        date_from=date_from, date_to=date_to,
        groups=groups, priorities=priorities, categories=categories,
    ))
    if df.empty:
        return []
    key = _resample_key(granularity)
    # Drop rows where the period key is unknown/null before grouping
    df = df[df[key].notna() & (df[key].astype(str) != "Unknown")]
    if df.empty:
        return []
    grouped = df.groupby([key, "assignment_group"]).size().reset_index(name="count")
    pivoted = grouped.pivot_table(index=key, columns="assignment_group", values="count", fill_value=0).reset_index()
    pivoted.columns.name = None
    pivoted = pivoted.rename(columns={key: "period"})
    pivoted["total"] = pivoted.drop(columns=["period"]).sum(axis=1)
    return pivoted.sort_values("period").to_dict(orient="records")


@router.get("/mttr")
def get_mttr(
    granularity: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    categories: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups, categories=categories))
    resolved = df[df["mttr_hours"].notna() & (df["mttr_hours"] > 0)]
    if resolved.empty:
        return []
    key = _resample_key(granularity)
    mttr = resolved.groupby([key, "assignment_group"])["mttr_hours"].mean().reset_index()
    mttr["mttr_hours"] = mttr["mttr_hours"].round(1)
    pivoted = mttr.pivot_table(index=key, columns="assignment_group", values="mttr_hours").reset_index()
    pivoted.columns.name = None
    pivoted = pivoted.rename(columns={key: "period"})
    # Align overall_avg by period (not by position — fixes prior misalignment bug)
    overall = resolved.groupby(key)["mttr_hours"].mean().round(1).reset_index()
    overall.columns = ["period", "overall_avg"]
    pivoted = pivoted.merge(overall, on="period", how="left")
    return pivoted.sort_values("period").fillna("").to_dict(orient="records")


@router.get("/category-distribution")
def get_category_distribution(
    granularity: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    if df.empty:
        return []
    key = _resample_key(granularity)
    df = df[df[key].notna() & (df[key].astype(str) != "Unknown")]
    if df.empty:
        return []
    grp = df.groupby([key, "category"]).size().reset_index(name="count")
    piv = grp.pivot_table(index=key, columns="category", values="count", fill_value=0).reset_index()
    piv.columns.name = None
    piv = piv.rename(columns={key: "period"})
    return piv.sort_values("period").to_dict(orient="records")


@router.get("/sla-compliance")
def get_sla_compliance(
    granularity: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
    priorities: Optional[List[int]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups, priorities=priorities))
    if df.empty:
        return []
    key = _resample_key(granularity)
    df = df[df[key].notna() & (df[key].astype(str) != "Unknown")]
    if df.empty:
        return []
    sla = df.groupby(key).agg(
        total=("number", "count"),
        met=("made_sla_bool", "sum"),
    ).reset_index().rename(columns={key: "period"})
    sla["breached"]       = sla["total"] - sla["met"]
    sla["compliance_pct"] = (sla["met"] / sla["total"] * 100).round(1)
    return sla.sort_values("period").to_dict(orient="records")


@router.get("/priority-trend")
def get_priority_trend(
    granularity: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    if df.empty:
        return []
    key = _resample_key(granularity)
    df = df[df[key].notna() & (df[key].astype(str) != "Unknown")]
    if df.empty:
        return []
    grp = df.groupby([key, "priority"]).size().reset_index(name="count")
    piv = grp.pivot_table(index=key, columns="priority", values="count", fill_value=0).reset_index()
    piv.columns.name = None
    for p in [1, 2, 3, 4]:
        if p not in piv.columns:
            piv[p] = 0
    piv = piv.rename(columns={key: "period", 1: "P1", 2: "P2", 3: "P3", 4: "P4"})
    return piv.sort_values("period").to_dict(orient="records")


@router.get("/resolution-heatmap")
def get_resolution_heatmap(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    """Returns incident count by day-of-week × hour for heatmap visualization."""
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    hm = df.groupby(["dow", "hour"]).size().reset_index(name="count")
    dow_order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    hm["dow"] = pd.Categorical(hm["dow"], categories=dow_order, ordered=True)
    hm = hm.sort_values(["dow","hour"])
    return hm.to_dict(orient="records")


@router.get("/reassignment-analysis")
def get_reassignment_analysis(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    if df.empty:
        return {"by_group": [], "scatter_data": []}
    by_group = df.groupby("assignment_group").agg(
        avg_reassignments=("reassignment_count", "mean"),
        total_incidents=("number", "count"),
        high_reassignment=("reassignment_count", lambda x: (x >= 3).sum()),
    ).reset_index().rename(columns={"assignment_group": "group"})
    by_group["avg_reassignments"] = by_group["avg_reassignments"].round(2)

    scatter = df[["number","mttr_hours","reassignment_count","priority","assignment_group","category"]].dropna(
        subset=["mttr_hours"]
    ).rename(columns={"assignment_group":"group"})
    scatter = scatter[scatter["mttr_hours"] < 500]
    if not scatter.empty:
        scatter = scatter.sample(min(500, len(scatter)), random_state=42)

    return {
        "by_group":    by_group.to_dict(orient="records"),
        "scatter_data": scatter.to_dict(orient="records"),
    }


@router.get("/forecast")
def get_forecast(
    periods: int = 6,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Simple linear regression forecast over monthly volumes."""
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to))
    if df.empty:
        return {"historical": [], "forecast": []}
    # Only use rows with valid month values
    df = df[df["month"].notna() & (df["month"].astype(str) != "Unknown")]
    monthly = df.groupby("month").size().reset_index(name="count").sort_values("month")
    if len(monthly) < 3:
        return {"historical": monthly.to_dict(orient="records"), "forecast": []}

    x = np.arange(len(monthly))
    y = monthly["count"].values
    # Weighted linear regression (recent data weighted more)
    weights = np.linspace(0.5, 1.0, len(x))
    coeffs  = np.polyfit(x, y, deg=1, w=weights)
    trend   = np.poly1d(coeffs)

    # Seasonal factors from monthly averages
    monthly["month_num"] = pd.to_datetime(monthly["month"] + "-01").dt.month
    seasonal = monthly.groupby("month_num")["count"].mean()
    overall_mean = monthly["count"].mean()
    seasonal_factors = (seasonal / overall_mean).to_dict()

    # Project future months
    last_period = pd.to_datetime(monthly["month"].iloc[-1] + "-01")
    forecast_rows = []
    for i in range(1, periods + 1):
        fut = last_period + pd.DateOffset(months=i)
        fut_period = fut.strftime("%Y-%m")
        fut_x = len(monthly) + i - 1
        base_pred = max(0, trend(fut_x))
        sf = seasonal_factors.get(fut.month, 1.0)
        pred = round(base_pred * sf)
        ci_width = round(pred * 0.12)  # ±12% confidence interval
        forecast_rows.append({
            "period": fut_period,
            "forecast": int(pred),
            "ci_lower": max(0, int(pred - ci_width)),
            "ci_upper": int(pred + ci_width),
            "type": "forecast",
        })

    historical = [{"period": r["month"], "count": int(r["count"]), "type": "actual"}
                  for _, r in monthly.iterrows()]
    return {"historical": historical, "forecast": forecast_rows}


@router.get("/root-cause")
def get_root_cause(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    groups: Optional[List[str]] = Query(default=None),
):
    df = apply_filters(get_dataframe(), dict(date_from=date_from, date_to=date_to, groups=groups))
    if df.empty:
        return []
    rc = df.groupby(["category", "subcategory"]).size().reset_index(name="count")
    rc = rc.sort_values(["category","count"], ascending=[True, False])
    # Treemap format
    tree = []
    for cat, sub in rc.groupby("category"):
        tree.append({
            "name": cat,
            "total": int(sub["count"].sum()),
            "children": sub.rename(columns={"subcategory": "name"})[["name","count"]].to_dict(orient="records")
        })
    tree.sort(key=lambda x: x["total"], reverse=True)
    return tree
