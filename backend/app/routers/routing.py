"""
M4 Intelligent Routing — predict the best assignment group for an incident.

POST /api/routing/predict
  • Returns recommended group + top-4 alternatives with confidence scores
  • Includes live performance stats for the recommended group
  • Optionally calls LLM for a 2-sentence routing rationale

GET  /api/routing/groups
  • Lists all known assignment groups with their performance metrics
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.data_loader import get_dataframe
from app.ml.trainer import get_models, get_training_status

router = APIRouter(prefix="/routing", tags=["M4 Intelligent Routing"])
logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RoutingRequest(BaseModel):
    short_description: str = Field(..., min_length=3, max_length=2000)
    service_offering: str  = Field(default="")
    category: str          = Field(default="",
        description="Predicted/known category — improves routing accuracy")
    priority: int          = Field(default=3, ge=1, le=4)
    use_llm: bool          = Field(default=True)


class RoutingResponse(BaseModel):
    recommended_group: str
    confidence: float
    alternatives: List[dict]
    reasoning: Optional[str] = None
    group_performance: dict
    ml_stats: dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/predict", response_model=RoutingResponse, summary="Predict assignment group")
async def predict_routing(req: RoutingRequest):
    status = get_training_status()
    if status["status"] == "training":
        raise HTTPException(503, detail="ML models are being trained — retry in ~30 seconds.")

    models = get_models()
    if not models:
        raise HTTPException(503, detail="ML models not yet initialised.")

    text = f"{req.short_description} {req.service_offering} {req.category}".strip()
    preds = models.predict_group(text, top_k=5)

    if not preds:
        raise HTTPException(
            422,
            detail="Insufficient training data to predict routing. "
                   "Ensure the dataset contains multiple assignment groups.",
        )

    top          = preds[0]
    alternatives = preds[1:]
    perf         = _group_stats(get_dataframe(), top["group"])

    reasoning: Optional[str] = None
    if req.use_llm:
        try:
            from app.llm.client import LLMClient
            c = LLMClient()
            if c.is_available():
                reasoning = await c.get_routing_reasoning(
                    req.short_description, top["group"], alternatives, perf
                )
        except Exception as exc:
            logger.warning(f"LLM routing reasoning skipped (non-fatal): {exc}")

    return RoutingResponse(
        recommended_group=top["group"],
        confidence=top["confidence"],
        alternatives=alternatives,
        reasoning=reasoning,
        group_performance=perf,
        ml_stats=models.get_stats(),
    )


@router.get("/groups", summary="List all assignment groups with performance metrics")
def list_groups():
    df = get_dataframe()
    groups = sorted(df["assignment_group"].dropna().unique())
    return [{"group": g, **_group_stats(df, g)} for g in groups]


# ── Helper ────────────────────────────────────────────────────────────────────

def _group_stats(df, group: str) -> dict:
    sub = df[df["assignment_group"] == group]
    if sub.empty:
        return {}
    res = sub[sub["mttr_hours"].notna()]
    act = sub[sub["state"].isin(["Open", "In Progress", "On Hold"])]
    return {
        "total_incidents":   int(len(sub)),
        "active_incidents":  int(len(act)),
        "avg_mttr_hours":    round(float(res["mttr_hours"].mean()), 1) if len(res) else None,
        "sla_compliance":    round(float(sub["made_sla_bool"].mean()), 3),
        "avg_reassignments": round(float(sub["reassignment_count"].mean()), 2),
    }
