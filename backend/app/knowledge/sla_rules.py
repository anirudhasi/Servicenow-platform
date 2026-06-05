"""
SLA Rules & Priority Definitions — Single Source of Truth
Source: Capgemini-SLB Statement of Work / Contract (confirmed June 2026)

This module is the canonical knowledge store for all SLA and priority rules.
It is imported by:
  - routers/triage.py   → P1/P2 priority audit LLM prompts
  - routers/breach.py   → SLA compliance calculations
  - llm/rag.py          → Chatbot context enrichment
"""
from __future__ import annotations

# ── SLA Response Targets (time to first meaningful response) ──────────────────
# P1/P2 are 24×7 (calendar hours); P3/P4 are 24×5 (business hours only)
SLA_RESPONSE = {
    1: {"hours": 0.25,  "label": "15 min",    "support": "24×7", "calendar": True},
    2: {"hours": 1.0,   "label": "1 hour",    "support": "24×7", "calendar": True},
    3: {"hours": 4.0,   "label": "4 hours",   "support": "24×5", "calendar": False},
    4: {"hours": 4.0,   "label": "4 hours",   "support": "24×5", "calendar": False},
}

# ── SLA Resolution Targets (time to full resolution) ─────────────────────────
# P1/P2 in calendar hours; P3/P4 in BUSINESS hours
SLA_RESOLUTION = {
    1: {"business_hours": 4,   "label": "4 hours",          "support": "24×7", "calendar": True},
    2: {"business_hours": 8,   "label": "8 hours",          "support": "24×7", "calendar": True},
    3: {"business_hours": 72,  "label": "72 business hours","support": "24×5", "calendar": False},
    4: {"business_hours": 120, "label": "120 business hours","support": "24×5","calendar": False},
}

# ── KPI Targets (from SOW) ────────────────────────────────────────────────────
KPI_TARGETS = {
    "first_time_right": {
        "description": "Reopen count ≤ 1% of closed incidents",
        "threshold_pct": 1.0,
        "metric": "reopen_rate",
    },
    "tickets_aging": {
        "description": "95% of incidents resolved within 30 calendar days",
        "threshold_pct": 95.0,
        "days": 30,
        "metric": "resolution_within_30d",
    },
    "csat": {
        "description": "CSAT score ≥ 4.5/5 for 95% of surveyed incidents",
        "min_score": 4.5,
        "threshold_pct": 95.0,
        "metric": "csat_compliance",
    },
}

# ── Priority Definitions (full contractual text) ──────────────────────────────
PRIORITY_DEFINITIONS = {
    1: {
        "label": "Critical / P1",
        "support_schedule": "24 × 7",
        "response_sla": "Within 15 Minutes",
        "resolution_sla": "Within 4 Hours",
        "full_criteria": (
            "A complete failure of an In-Scope Application or supported process in Production Instance, "
            "with NO available workaround. This includes: (1) outages affecting MOST SLB end users; "
            "(2) an entire SLB division being impacted; (3) incidents occurring during critical business "
            "periods (e.g., month-end, year-end); or (4) any incident with a financial impact exceeding "
            "$500,000. Priority 1 Incidents shall take precedence over all other requests."
        ),
        "key_indicators": [
            "Complete application/process failure — no workaround available",
            "Affects the majority of SLB end users or an entire SLB division",
            "Occurring during month-end, year-end, or critical business period",
            "Confirmed financial impact exceeding $500,000",
            "Production environment — not dev/test/staging",
        ],
        "disqualifiers": [
            "A workaround exists (even partial) → consider P2",
            "Affects only a small number of users → P3 or P4",
            "Non-production environment (dev, test, UAT)",
            "Financial impact below $500,000",
            "Isolated, non-widespread issue",
        ],
    },
    2: {
        "label": "High / P2",
        "support_schedule": "24 × 7",
        "response_sla": "Within 1 Hour",
        "resolution_sla": "Within 8 Hours",
        "full_criteria": (
            "Major issues within an In-Scope Application or supported process in Production Instance "
            "that impact a SIGNIFICANT PORTION of the user base. This includes: (1) high-visibility "
            "incidents involving senior management; (2) time-sensitive business processes impacted; "
            "or (3) any incident with a financial impact between $50,000 and $500,000. "
            "Example: inability to generate critical business reports."
        ),
        "key_indicators": [
            "Significant portion of users affected (not just 1–2 people)",
            "Senior management or executive stakeholder directly impacted",
            "Time-sensitive business process impaired (e.g., payroll, reporting deadline)",
            "Financial impact confirmed between $50,000 and $500,000",
            "Critical report generation or data access failure",
            "Production environment with partial service degradation",
        ],
        "disqualifiers": [
            "Only 1–2 users affected with no senior management involvement → P3",
            "Financial impact below $50,000 → P3 or P4",
            "Non-time-sensitive issue → P3",
            "Workaround is readily available → P3 or P4",
            "Isolated individual user access issue → P3 or P4",
        ],
    },
    3: {
        "label": "Moderate / P3",
        "support_schedule": "24 × 5",
        "response_sla": "Within 4 Hours",
        "resolution_sla": "Within 72 Business Hours",
        "full_criteria": (
            "Issues affecting a limited number of users on a recurring basis, impeding their ability "
            "to complete work. Includes incidents with financial impact. "
            "Example: inability to access or properly use implemented functionality."
        ),
        "key_indicators": [
            "Limited number of users affected on recurring basis",
            "Partial functionality loss — work is impeded but not fully blocked",
            "Recurring pattern of the same issue",
        ],
    },
    4: {
        "label": "Standard / P4",
        "support_schedule": "24 × 5",
        "response_sla": "Within 4 Hours",
        "resolution_sla": "Within 120 Business Hours",
        "full_criteria": (
            "Informational inquiries or isolated, non-recurring incidents affecting non-critical users "
            "or processes. Work-arounds are readily available and business impact is minimal."
        ),
        "key_indicators": [
            "Isolated, non-recurring incident",
            "Workaround is readily available",
            "Minimal business impact",
            "Non-critical users or processes",
            "Informational inquiry or access request",
        ],
    },
}

# ── LLM Prompt Template for Priority Audit ───────────────────────────────────
PRIORITY_AUDIT_SYSTEM_PROMPT = """You are a senior ITSM Priority Analyst at Capgemini with 20 years of experience.
Your role is to verify incident priority classifications against contractual SLB priority definitions.
Be conservative with P1 — it requires complete failure, no workaround, and widespread impact.
Be precise with P2 — it requires SIGNIFICANT user base impact or senior management involvement.
Respond ONLY with a JSON object — no markdown, no explanation outside the JSON."""

def build_audit_prompt(number: str, short_desc: str, service: str, current_pri: int) -> str:
    p1 = PRIORITY_DEFINITIONS[1]
    p2 = PRIORITY_DEFINITIONS[2]
    p3 = PRIORITY_DEFINITIONS[3]
    p4 = PRIORITY_DEFINITIONS[4]
    return f"""Evaluate this incident's priority classification:

INCIDENT:
  Number: {number}
  Short Description: {short_desc}
  Service/Application: {service or "Not specified"}
  Current Priority: P{current_pri} ({PRIORITY_DEFINITIONS[current_pri]['label']})

CONTRACTUAL PRIORITY CRITERIA (SLB SOW):
P1 (Critical): {p1['full_criteria']}
  Key indicators: {'; '.join(p1['key_indicators'])}
  Disqualifiers: {'; '.join(p1['disqualifiers'])}

P2 (High): {p2['full_criteria']}
  Key indicators: {'; '.join(p2['key_indicators'])}
  Disqualifiers: {'; '.join(p2['disqualifiers'])}

P3 (Moderate): {p3['full_criteria']}

P4 (Standard): {p4['full_criteria']}

Is P{current_pri} the CORRECT classification based solely on the description and criteria above?

Respond as JSON only:
{{"verdict":"CORRECT"|"RECLASSIFY","suggested_priority":1|2|3|4,"confidence":0.0-1.0,"reasoning":"one concise sentence explaining your decision"}}"""
