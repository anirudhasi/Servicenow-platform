"""
M3 Smart Triage — AI-powered incident auto-classification.

POST /api/triage/predict          → ML classify + LLM hint
GET  /api/triage/model-stats      → Training status
POST /api/triage/priority-audit   → P1/P2 integrity audit using LLM + contract criteria
GET  /api/triage/priority-definitions → Return contractual priority criteria (knowledge store)
"""
from __future__ import annotations

import json
import logging
import re
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ml.trainer import get_models, get_training_status
from app.knowledge.sla_rules import (
    PRIORITY_DEFINITIONS, build_audit_prompt, PRIORITY_AUDIT_SYSTEM_PROMPT
)

router = APIRouter(prefix="/triage", tags=["M3 Smart Triage"])
logger = logging.getLogger(__name__)

PRIORITY_LABELS = {1: "P1-Critical", 2: "P2-High", 3: "P3-Moderate", 4: "P4-Standard"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class TriageRequest(BaseModel):
    short_description: str = Field(..., min_length=3, max_length=2000,
        description="Short description of the incident")
    service_offering: str = Field(default="",
        description="Service offering / application name (optional)")
    priority_hint: Optional[int] = Field(default=None, ge=1, le=4,
        description="Override predicted priority (1=Critical … 4=Standard)")
    use_llm: bool = Field(default=True,
        description="Call LLM for resolution hint (requires configured LLM provider)")


class TriageResponse(BaseModel):
    category: str
    subcategory: str
    priority_predicted: int
    priority_label: str
    confidence_category: float
    confidence_priority: float
    similar_incidents: List[dict]
    llm_resolution_hint: Optional[str] = None
    ml_stats: dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/predict", response_model=TriageResponse, summary="Classify an incoming incident")
async def predict_triage(req: TriageRequest):
    status = get_training_status()
    if status["status"] == "training":
        raise HTTPException(503, detail="ML models are being trained — retry in ~30 seconds.")
    if status["status"] == "failed":
        raise HTTPException(500, detail=f"ML training failed: {status.get('error', 'unknown')}")

    models = get_models()
    if not models:
        raise HTTPException(503, detail="ML models not yet initialised.")

    text = f"{req.short_description} {req.service_offering}".strip()

    cat,   cat_conf = models.predict_category(text)
    subcat          = models.predict_subcategory(cat, text)
    pri,   pri_conf = models.predict_priority(text)

    # Honour caller's priority override
    if req.priority_hint:
        pri, pri_conf = req.priority_hint, 1.0

    similar = models.find_similar(text, top_k=5)

    llm_hint: Optional[str] = None
    if req.use_llm:
        try:
            from app.llm.client import LLMClient
            c = LLMClient()
            if c.is_available():
                llm_hint = await c.get_resolution_hint(
                    req.short_description, cat, subcat, similar
                )
        except Exception as exc:
            logger.warning(f"LLM triage enrichment skipped (non-fatal): {exc}")

    return TriageResponse(
        category=cat,
        subcategory=subcat,
        priority_predicted=pri,
        priority_label=PRIORITY_LABELS.get(pri, "P3-Moderate"),
        confidence_category=round(cat_conf, 3),
        confidence_priority=round(pri_conf, 3),
        similar_incidents=similar,
        llm_resolution_hint=llm_hint,
        ml_stats=models.get_stats(),
    )


@router.get("/model-stats", summary="ML model training status and accuracy metrics")
def triage_model_stats():
    status = get_training_status()
    models = get_models()
    return {
        "status": status["status"],
        **(models.get_stats() if models else {}),
        **({"error": status["error"]} if "error" in status else {}),
    }


@router.get("/priority-definitions", summary="Return contractual SLB priority criteria")
def get_priority_definitions():
    """Returns the full contractual priority definitions for display in the UI."""
    return {
        str(p): {
            "label":          d["label"],
            "support":        d["support_schedule"],
            "response_sla":   d["response_sla"],
            "resolution_sla": d["resolution_sla"],
            "criteria":       d["full_criteria"],
            "key_indicators": d.get("key_indicators", []),
            "disqualifiers":  d.get("disqualifiers", []),
        }
        for p, d in PRIORITY_DEFINITIONS.items()
    }


# ── Rule-based fallback audit (when LLM unavailable) ─────────────────────────

_P1_KEYWORDS = [
    "complete failure", "total outage", "entire", "all users", "most users",
    "division", "production down", "no workaround", "month-end", "year-end",
    "500,000", "$500k", "critical outage", "cannot access", "system down",
]
_P2_KEYWORDS = [
    "senior management", "significant", "multiple users", "many users",
    "cannot generate", "report failure", "time-sensitive", "critical report",
    "50,000", "$50k", "major issue", "impacting operations",
]
_P4_KEYWORDS = [
    "how do i", "how to", "inquiry", "question", "request", "access request",
    "workaround", "information", "guidance", "one user", "single user",
]

def _rule_based_audit(number: str, desc: str, service: str, current_pri: int) -> dict:
    """Keyword-based fallback when LLM is not available."""
    text = (desc + " " + service).lower()
    p1_score = sum(1 for kw in _P1_KEYWORDS if kw in text)
    p2_score = sum(1 for kw in _P2_KEYWORDS if kw in text)
    p4_score = sum(1 for kw in _P4_KEYWORDS if kw in text)

    if current_pri == 1:
        if p1_score >= 2:
            return {"verdict": "CORRECT", "suggested_priority": 1,
                    "confidence": 0.65, "reasoning": "Description contains P1 indicators (widespread impact, no workaround)."}
        elif p2_score >= 1 and p1_score == 0:
            return {"verdict": "RECLASSIFY", "suggested_priority": 2,
                    "confidence": 0.60, "reasoning": "Description lacks P1 breadth (no full-division outage, no $500K+ impact). Fits P2 better."}
        else:
            return {"verdict": "RECLASSIFY", "suggested_priority": 3,
                    "confidence": 0.55, "reasoning": "Description appears to describe a limited-scope issue, not qualifying for P1."}
    elif current_pri == 2:
        if p2_score >= 2 or p1_score >= 2:
            return {"verdict": "CORRECT", "suggested_priority": 2,
                    "confidence": 0.65, "reasoning": "Description contains P2 indicators (significant user impact, critical process)."}
        elif p4_score >= 2:
            return {"verdict": "RECLASSIFY", "suggested_priority": 4,
                    "confidence": 0.60, "reasoning": "Description appears to be an isolated/informational request, not P2."}
        else:
            return {"verdict": "RECLASSIFY", "suggested_priority": 3,
                    "confidence": 0.55, "reasoning": "Description describes a limited-scope issue. Consider P3 (limited users, recurring)."}
    return {"verdict": "CORRECT", "suggested_priority": current_pri,
            "confidence": 0.50, "reasoning": "Insufficient keywords to determine reclassification."}


# ── Priority Audit endpoint ───────────────────────────────────────────────────

@router.post("/priority-audit", summary="Audit P1/P2 incidents against contractual criteria")
async def priority_audit(max_incidents: int = 20):
    """
    Samples up to `max_incidents` P1/P2 incidents from the current dataset.
    Uses LLM (or rule-based fallback) to verify each against the SLB contract criteria.
    Returns individual verdicts + aggregate discrepancy summary.
    """
    from app.data_loader import get_dataframe

    df = get_dataframe()
    p12 = df[df["priority"].isin([1, 2])].copy()

    if p12.empty:
        return {
            "total_audited": 0, "p1_count": 0, "p2_count": 0,
            "correctly_classified": 0, "should_escalate": 0,
            "should_downgrade": 0, "audit_results": [],
            "llm_used": False, "method": "no_data",
        }

    # Stratified sample: up to 5 P1, up to 15 P2
    p1_sample = p12[p12["priority"] == 1].head(5)
    p2_sample = p12[p12["priority"] == 2].head(max_incidents - len(p1_sample))
    sample = pd.concat([p1_sample, p2_sample]).reset_index(drop=True)

    # Detect LLM availability
    try:
        from app.llm.client import LLMClient
        llm = LLMClient()
        llm_available = llm.is_available()
    except Exception:
        llm_available = False
        llm = None

    results = []
    for _, row in sample.iterrows():
        number   = str(row.get("number", ""))
        desc     = str(row.get("short_description", ""))[:400]
        service  = str(row.get("service_offering", ""))[:100]
        pri      = int(row.get("priority", 3))

        if llm_available and llm:
            try:
                prompt = build_audit_prompt(number, desc, service, pri)
                raw = await llm.complete(
                    [{"role": "user", "content": prompt}],
                    system=PRIORITY_AUDIT_SYSTEM_PROMPT,
                    max_tokens=150,
                    temperature=0.1,
                )
                # Extract JSON from response (strip any surrounding text)
                json_match = re.search(r'\{.*\}', raw, re.DOTALL)
                parsed = json.loads(json_match.group()) if json_match else {}
                verdict   = parsed.get("verdict", "CORRECT")
                suggested = int(parsed.get("suggested_priority", pri))
                confidence = float(parsed.get("confidence", 0.5))
                reasoning  = str(parsed.get("reasoning", ""))[:300]
            except Exception as exc:
                logger.warning(f"LLM audit failed for {number}: {exc}")
                r = _rule_based_audit(number, desc, service, pri)
                verdict, suggested, confidence, reasoning = (
                    r["verdict"], r["suggested_priority"], r["confidence"], r["reasoning"]
                )
        else:
            r = _rule_based_audit(number, desc, service, pri)
            verdict, suggested, confidence, reasoning = (
                r["verdict"], r["suggested_priority"], r["confidence"], r["reasoning"]
            )

        results.append({
            "number":            number,
            "short_description": desc[:120],
            "service_offering":  service,
            "current_priority":  pri,
            "verdict":           verdict,
            "suggested_priority":suggested,
            "confidence":        round(confidence, 2),
            "reasoning":         reasoning,
            "delta":             suggested - pri,   # negative = escalation, positive = downgrade
        })

    total     = len(results)
    correct   = sum(1 for r in results if r["verdict"] == "CORRECT")
    escalate  = sum(1 for r in results if r["delta"] < 0)   # suggested < current → should be higher
    downgrade = sum(1 for r in results if r["delta"] > 0)   # suggested > current → should be lower
    p1_cnt    = sum(1 for r in results if r["current_priority"] == 1)
    p2_cnt    = sum(1 for r in results if r["current_priority"] == 2)

    return {
        "total_audited":          total,
        "p1_count":               p1_cnt,
        "p2_count":               p2_cnt,
        "correctly_classified":   correct,
        "correctly_classified_pct": round(100 * correct / total, 1) if total else 0,
        "should_escalate":        escalate,
        "should_downgrade":       downgrade,
        "audit_results":          sorted(results, key=lambda x: (x["verdict"] == "CORRECT", -x["confidence"])),
        "llm_used":               llm_available,
        "method":                 "llm" if llm_available else "rule-based",
    }


import pandas as pd
