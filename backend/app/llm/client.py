"""
Multi-provider LLM client with automatic fallback.

Provider resolution order (first available wins):
  1. Capgemini   — OpenAI-compatible endpoint  (CG_ACCESS_TOKEN / PROVIDER_1_API_KEY)
  2. OpenAI      — Standard OpenAI API          (PROVIDER_2_API_KEY)
  3. Anthropic   — Native Messages API          (PROVIDER_3_API_KEY)

All providers are tried in model order within each provider before
moving to the next provider.  Errors are logged at WARNING level;
only a full exhaustion raises RuntimeError.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an AI assistant embedded in the ServiceNow Incident Intelligence Platform "
    "at Capgemini. You help IT operations analysts understand incident data, diagnose "
    "patterns, and improve service delivery.\n\n"
    "Guidelines:\n"
    "• Be concise and actionable. Prefer 3–6 bullet points over long paragraphs.\n"
    "• When numerical context is provided, reference the specific numbers.\n"
    "• Use standard ITSM terminology (MTTR, SLA, backlog, escalation, etc.).\n"
    "• Structure longer answers with brief headers.\n"
    "• Do NOT fabricate incident numbers, dates, or statistics absent from the context.\n"
    "• If the context is insufficient, acknowledge it and give ITSM best-practice advice."
)


class LLMClient:
    """Stateless multi-provider client. Safe to instantiate per request."""

    def __init__(self) -> None:
        from app.config import get_settings
        s = get_settings()
        self.providers: list[dict] = []

        # ── Provider 1: Capgemini (OpenAI-compatible) ─────────────────────────
        p1_key    = (s.provider_1_api_key or s.cg_access_token).strip()
        p1_url    = (s.provider_1_base_url or s.base_url).strip().rstrip("/")
        p1_models = [m.strip() for m in (s.provider_1_models or s.llm_model).split(",") if m.strip()]
        if p1_key and p1_url and p1_models:
            for model in p1_models:
                self.providers.append({
                    "name": s.provider_1_name, "type": "openai",
                    "base_url": p1_url, "key": p1_key, "model": model,
                })

        # ── Provider 2: OpenAI ────────────────────────────────────────────────
        if s.provider_2_api_key.strip():
            for model in [m.strip() for m in s.provider_2_models.split(",") if m.strip()]:
                self.providers.append({
                    "name": s.provider_2_name, "type": "openai",
                    "base_url": s.provider_2_base_url.rstrip("/"),
                    "key": s.provider_2_api_key.strip(), "model": model,
                })

        # ── Provider 3: Anthropic (native Messages API) ───────────────────────
        if s.provider_3_api_key.strip():
            for model in [m.strip() for m in s.provider_3_models.split(",") if m.strip()]:
                self.providers.append({
                    "name": s.provider_3_name, "type": "anthropic",
                    "base_url": s.provider_3_base_url.rstrip("/"),
                    "key": s.provider_3_api_key.strip(), "model": model,
                })

    # ── Availability ──────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        return bool(self.providers)

    def active_provider(self) -> Optional[str]:
        return self.providers[0]["name"] if self.providers else None

    # ── Low-level HTTP calls ──────────────────────────────────────────────────

    async def _call_openai(
        self, p: dict, messages: list, max_tokens: int, temperature: float
    ) -> str:
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                f"{p['base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {p['key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": p["model"],
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    async def _call_anthropic(
        self, p: dict, messages: list, system: str, max_tokens: int, temperature: float
    ) -> str:
        # Anthropic native format: no system role in messages array
        ant_msgs = [m for m in messages if m.get("role") != "system"]
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                f"{p['base_url']}/messages",
                headers={
                    "x-api-key": p["key"],
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": p["model"],
                    "messages": ant_msgs,
                    "system": system,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            r.raise_for_status()
            return r.json()["content"][0]["text"]

    # ── Core completion ───────────────────────────────────────────────────────

    async def complete(
        self,
        messages: list,
        system: str = SYSTEM_PROMPT,
        max_tokens: int = 768,
        temperature: float = 0.3,
    ) -> str:
        if not self.providers:
            raise RuntimeError(
                "No LLM providers configured. "
                "Set CG_ACCESS_TOKEN (or PROVIDER_1_API_KEY) in your .env file."
            )

        full_messages = [{"role": "system", "content": system}] + messages
        last_err: Optional[Exception] = None

        for p in self.providers:
            try:
                logger.debug(f"LLM → {p['name']}/{p['model']}")
                if p["type"] == "openai":
                    return await self._call_openai(p, full_messages, max_tokens, temperature)
                else:
                    return await self._call_anthropic(p, full_messages, system, max_tokens, temperature)
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    f"Provider {p['name']}/{p['model']}: HTTP {exc.response.status_code} "
                    f"— {exc.response.text[:200]}"
                )
                last_err = exc
            except Exception as exc:
                logger.warning(f"Provider {p['name']}/{p['model']}: {exc}")
                last_err = exc

        raise RuntimeError(f"All LLM providers exhausted. Last error: {last_err}")

    # ── High-level helpers ────────────────────────────────────────────────────

    async def chat(
        self,
        user_message: str,
        context: str = "",
        history: Optional[list] = None,
        max_tokens: int = 1024,
    ) -> str:
        messages = list(history or [])
        content = (
            f"Incident database context:\n{context}\n\nQuestion: {user_message}"
            if context else user_message
        )
        messages.append({"role": "user", "content": content})
        return await self.complete(messages, max_tokens=max_tokens, temperature=0.4)

    async def get_resolution_hint(
        self,
        description: str,
        category: str,
        subcategory: str,
        similar: list,
    ) -> Optional[str]:
        resolutions = [
            s["resolution"] for s in similar
            if s.get("resolution") and len(s["resolution"]) > 15
        ][:3]
        ctx = f"Category: {category} › {subcategory}\n"
        if resolutions:
            ctx += "Past resolutions for similar incidents:\n" + "\n".join(
                f"• {r[:200]}" for r in resolutions
            )
        try:
            return await self.complete(
                [{"role": "user", "content": (
                    f"New incident reported: {description}\n{ctx}\n\n"
                    "Provide a concise 2–3 sentence resolution recommendation with actionable steps."
                )}],
                max_tokens=256,
                temperature=0.4,
            )
        except Exception as exc:
            logger.warning(f"get_resolution_hint failed: {exc}")
            return None

    async def get_routing_reasoning(
        self,
        description: str,
        group: str,
        alternatives: list,
        stats: dict,
    ) -> Optional[str]:
        alt_text = ", ".join(
            f"{a['group']} ({a['confidence']:.0%})" for a in alternatives[:2]
        )
        s_text = ""
        if stats:
            mttr = stats.get("avg_mttr_hours")
            sla  = stats.get("sla_compliance")
            s_text = (
                f"\nGroup profile: {stats.get('total_incidents', '?')} incidents handled"
                + (f", avg MTTR {mttr}h" if mttr else "")
                + (f", SLA compliance {sla * 100:.0f}%" if sla else "")
            )
        try:
            return await self.complete(
                [{"role": "user", "content": (
                    f"Incident: {description}\n"
                    f"Recommended group: {group}{s_text}\n"
                    f"Alternatives considered: {alt_text}\n\n"
                    "In exactly 2 sentences, explain why the recommended group is the best fit."
                )}],
                max_tokens=200,
                temperature=0.3,
            )
        except Exception as exc:
            logger.warning(f"get_routing_reasoning failed: {exc}")
            return None
