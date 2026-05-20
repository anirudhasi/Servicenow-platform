"""
M5 NL Chatbot — conversational Q&A over incident data via LLM + RAG.

POST /api/chatbot/message
  • Accepts a user message + optional session_id
  • Injects dynamically-built incident context (RAG) into the LLM prompt
  • Returns assistant reply + session_id for continued conversation

GET  /api/chatbot/status         — LLM provider availability
GET  /api/chatbot/suggestions    — pre-built starter questions
DEL  /api/chatbot/session/{id}   — clear a conversation session
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/chatbot", tags=["M5 NL Chatbot"])
logger = logging.getLogger(__name__)

# In-memory session store  {session_id → {history, last_active}}
_sessions: dict[str, dict] = {}
SESSION_TTL = 3600   # seconds
MAX_HISTORY = 20     # message turns to keep in context


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = Field(
        default=None,
        description="Pass the session_id returned by a previous call to continue a conversation",
    )


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    sources: List[dict] = []
    provider_used: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse, summary="Send a message to the incident chatbot")
async def chat_message(req: ChatRequest):
    from app.llm.client import LLMClient
    from app.llm.rag import build_incident_context

    client = LLMClient()
    if not client.is_available():
        raise HTTPException(
            503,
            detail=(
                "LLM service not configured. "
                "Set CG_ACCESS_TOKEN (or PROVIDER_1_API_KEY) in your .env file."
            ),
        )

    now = time.time()
    sid = req.session_id or str(uuid.uuid4())

    # Evict expired sessions
    expired = [k for k, v in _sessions.items() if now - v["last_active"] > SESSION_TTL]
    for k in expired:
        del _sessions[k]

    session = _sessions.get(sid, {"history": [], "last_active": now})
    session["last_active"] = now

    context, sources = build_incident_context(req.message)
    history = session["history"][-MAX_HISTORY:]

    reply = await client.chat(
        user_message=req.message,
        context=context,
        history=history,
        max_tokens=1024,
    )

    session["history"].append({"role": "user",      "content": req.message})
    session["history"].append({"role": "assistant",  "content": reply})
    _sessions[sid] = session

    return ChatResponse(
        reply=reply,
        session_id=sid,
        sources=sources,
        provider_used=client.active_provider(),
    )


@router.get("/status", summary="LLM provider availability and session count")
def chatbot_status():
    from app.llm.client import LLMClient
    c = LLMClient()
    return {
        "available": c.is_available(),
        "providers": [{"name": p["name"], "model": p["model"]} for p in c.providers],
        "active_sessions": len(_sessions),
    }


@router.get("/suggestions", summary="Starter questions for the chatbot")
def suggestions():
    return {
        "suggestions": [
            "What are the current P1 and P2 incidents?",
            "Which group has the highest active backlog right now?",
            "What is our overall SLA compliance rate?",
            "Show me average MTTR by assignment group",
            "What are the most common incident categories?",
            "Which incidents have been reopened the most times?",
            "Summarise the current incident backlog situation",
            "Compare SLA performance across all teams",
            "What are the incident volume trends over the last 6 months?",
            "Which category takes the longest to resolve?",
        ]
    }


@router.delete("/session/{session_id}", status_code=204, summary="Clear a conversation session")
def clear_session(session_id: str):
    _sessions.pop(session_id, None)
