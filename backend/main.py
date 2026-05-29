"""
ServiceNow Intelligence Platform — FastAPI Backend
Entry point: uvicorn main:app --reload --port 8000

Modules:
  M1  Monitoring  — /api/monitoring/*
  M2  Trends      — /api/trends/*
  M3  Smart Triage— /api/triage/*    (ML + LLM)
  M4  Routing     — /api/routing/*   (ML + LLM)
  M5  Chatbot     — /api/chatbot/*   (LLM + RAG)
      Insights    — /api/insights/*
"""
import logging

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.data_loader import get_dataframe
from app.routers import monitoring, trends, insights
from app.routers import triage, routing, chatbot, scorecard, upload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Preloading incident data …")
    try:
        df = get_dataframe()
        logger.info(f"Data ready: {len(df):,} incidents loaded.")
    except Exception as exc:
        logger.error(f"Failed to preload data: {exc}")
        df = None

    # Kick off ML training in background (non-blocking)
    if df is not None and len(df) > 0:
        try:
            from app.ml.trainer import init_models_async
            init_models_async(df)
            logger.info("ML model training queued in background thread.")
        except Exception as exc:
            logger.error(f"Failed to start ML training: {exc}")

    yield
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI-Powered ServiceNow Incident Intelligence Platform\n\n"
        "**M1** Live Monitoring · **M2** Trend Analysis · "
        "**M3** Smart Triage · **M4** Intelligent Routing · **M5** NL Chatbot"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(monitoring.router, prefix="/api")
app.include_router(trends.router,     prefix="/api")
app.include_router(insights.router,   prefix="/api")
app.include_router(triage.router,     prefix="/api")
app.include_router(routing.router,    prefix="/api")
app.include_router(chatbot.router,    prefix="/api")
app.include_router(scorecard.router,  prefix="/api")
app.include_router(upload.router,     prefix="/api")


# ── Utility endpoints ─────────────────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
def health():
    from app.ml.trainer import get_training_status
    from app.llm.client import LLMClient
    df = get_dataframe()
    return {
        "status":           "healthy",
        "incidents_loaded": len(df),
        "data_source":      settings.data_source,
        "version":          settings.app_version,
        "ml_status":        get_training_status()["status"],
        "llm_available":    LLMClient().is_available(),
    }


@app.get("/api/reload", tags=["System"])
def reload_data():
    """Force reload data from source (useful after swapping incidents.csv)."""
    df = get_dataframe(force_reload=True)
    try:
        from app.ml.trainer import init_models_async
        init_models_async(df)
    except Exception as exc:
        logger.warning(f"ML retrain after reload failed: {exc}")
    return {"status": "reloaded", "incidents": len(df)}


@app.get("/api/reload-config", tags=["System"])
def reload_config():
    """Clear settings cache so updated .env values are picked up without restart."""
    get_settings.cache_clear()
    new = get_settings()
    from app.llm.client import LLMClient
    return {
        "status": "config reloaded",
        "llm_available": LLMClient().is_available(),
        "base_url": new.base_url,
        "model": new.llm_model,
        "has_cg_token": bool(new.cg_access_token),
    }
