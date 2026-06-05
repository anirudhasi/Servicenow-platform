"""
RAG context builder — injects incident statistics into the chatbot prompt.

build_incident_context(question) returns (context_string, sources_list).
The context is keyword-driven: only sections relevant to the question
are included, keeping the prompt concise and under MAX_CONTEXT_CHARS.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 2800
PRI_LABELS = {1: "P1-Critical", 2: "P2-High", 3: "P3-Moderate", 4: "P4-Standard"}


def _has(*keywords: str) -> "callable[[str], bool]":
    def _check(q: str) -> bool:
        ql = q.lower()
        return any(kw in ql for kw in keywords)
    return _check


def build_incident_context(question: str) -> tuple[str, list[dict]]:
    """Return (context_string, sources) relevant to the user's question."""
    try:
        from app.data_loader import get_dataframe
        df = get_dataframe()
    except Exception as exc:
        logger.warning(f"RAG: could not load dataframe: {exc}")
        return "", []

    total = len(df)
    if total == 0:
        return "No incident data is currently loaded.", []

    parts: list[str] = []
    sources: list[dict] = []

    open_df = df[df["state"].isin(["Open", "In Progress", "On Hold"])]
    res_df  = df[df["mttr_hours"].notna()]
    sla_pct = 100.0 * float(df["made_sla_bool"].sum()) / total

    # ── Core overview — always present ────────────────────────────────────────
    parts.append(f"**Platform Overview** ({total:,} total incidents)")
    parts.append(
        f"• Active: {len(open_df):,}  |  "
        f"Resolved/Closed: {len(df[df['state'].isin(['Resolved', 'Closed'])]):,}"
    )
    parts.append(f"• Overall SLA compliance: {sla_pct:.1f}%")
    if len(res_df):
        parts.append(f"• Overall avg MTTR: {res_df['mttr_hours'].mean():.1f} hours")

    d_min = df["created"].min()
    d_max = df["created"].max()
    if pd.notna(d_min) and pd.notna(d_max):
        parts.append(
            f"• Data range: {d_min.strftime('%d %b %Y')} → {d_max.strftime('%d %b %Y')}"
        )

    # ── Priority breakdown ────────────────────────────────────────────────────
    if _has("priority", "p1", "p2", "p3", "p4", "critical", "urgent", "severe", "high")(question):
        pri_all    = df["priority"].value_counts().sort_index()
        pri_active = open_df["priority"].value_counts().sort_index()
        parts.append("\n**Priority Breakdown:**")
        for p in sorted({*pri_all.index, *pri_active.index}):
            lbl = PRI_LABELS.get(int(p), f"P{p}")
            parts.append(
                f"• {lbl}: {int(pri_all.get(p, 0)):,} total, "
                f"{int(pri_active.get(p, 0)):,} active"
            )
        sources.append({"type": "priority_breakdown"})

    # ── Group workload ────────────────────────────────────────────────────────
    if _has("group", "team", "assign", "backlog", "workload", "who", "queue", "which team")(question):
        grp = open_df["assignment_group"].value_counts().head(8)
        parts.append("\n**Active Incidents by Assignment Group:**")
        for g, c in grp.items():
            parts.append(f"• {g}: {c:,} active")
        sources.append({"type": "group_workload"})

    # ── Category distribution ─────────────────────────────────────────────────
    if _has(
        "category", "type", "kind", "hardware", "network", "software",
        "access", "error", "application", "service", "infrastructure",
    )(question):
        cat = df["category"].value_counts().head(10)
        parts.append("\n**Category Distribution:**")
        for c, n in cat.items():
            parts.append(f"• {c}: {n:,} ({100 * n / total:.0f}%)")
        sources.append({"type": "categories"})

    # ── MTTR by group ─────────────────────────────────────────────────────────
    if _has("mttr", "resolution time", "how long", "duration", "resolve", "mean time", "time to")(question):
        mttr_grp = (
            res_df.groupby("assignment_group")["mttr_hours"]
            .mean()
            .sort_values()
        )
        parts.append("\n**Average MTTR by Group (hours):**")
        for g, h in mttr_grp.items():
            parts.append(f"• {g}: {h:.1f}h")
        sources.append({"type": "mttr_by_group"})

    # ── SLA compliance ────────────────────────────────────────────────────────
    if _has("sla", "breach", "compliance", "target", "met", "missed", "service level")(question):
        sla_grp = (
            (df.groupby("assignment_group")["made_sla_bool"].mean() * 100)
            .sort_values(ascending=False)
        )
        parts.append("\n**SLA Compliance by Group:**")
        for g, pct in sla_grp.items():
            parts.append(f"• {g}: {pct:.1f}%")
        sources.append({"type": "sla_compliance"})

    # ── Monthly trend ─────────────────────────────────────────────────────────
    if _has(
        "trend", "week", "month", "recent", "last", "this month",
        "over time", "history", "timeline", "pattern",
    )(question):
        monthly = df.groupby("month").size().sort_index().tail(6)
        parts.append("\n**Monthly Incident Volume (last 6 periods):**")
        for period, cnt in monthly.items():
            parts.append(f"• {period}: {cnt:,}")
        sources.append({"type": "monthly_trend"})

    # ── Reassignment ──────────────────────────────────────────────────────────
    if _has("reassign", "bounce", "routing", "wrong group", "escalat", "transfer")(question):
        avg_r = float(df["reassignment_count"].mean())
        high  = int((df["reassignment_count"] >= 3).sum())
        parts.append("\n**Reassignment Analysis:**")
        parts.append(f"• Avg reassignments per incident: {avg_r:.2f}")
        parts.append(f"• Incidents with 3+ reassignments: {high:,}")
        sources.append({"type": "reassignment"})

    # ── Top active incidents (for "show me" / "list" queries) ────────────────
    if _has("top", "worst", "highest", "most", "list", "show me", "what are the")(question):
        top5 = open_df.sort_values(["priority", "created"]).head(5)
        if len(top5):
            parts.append("\n**Top 5 Active Incidents (by priority):**")
            for _, row in top5.iterrows():
                p_lbl = PRI_LABELS.get(int(row["priority"]), "P?")
                desc  = str(row.get("short_description", ""))[:80]
                parts.append(f"• [{p_lbl}] {row.get('number', '?')} — {desc}")
            sources.append({"type": "top_active_incidents"})

    ctx = "\n".join(parts)
    if len(ctx) > MAX_CONTEXT_CHARS:
        ctx = ctx[:MAX_CONTEXT_CHARS] + "\n…[context truncated]"

    return ctx, sources
