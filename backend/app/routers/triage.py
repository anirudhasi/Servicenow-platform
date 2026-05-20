"""
M3 Smart Triage — AI-powered incident auto-classification.

POST /api/triage/predict
  • Predicts category, subcategory, priority using trained ML models
  • Finds top-5 similar past incidents via cosine similarity
  • Optionally calls the LLM for a resolution hint (non-blocking)

GET  /api/triage/model-stats
  • Returns training status + accuracy metrics
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ml.trainer import get_models, get_training_status

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
