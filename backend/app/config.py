"""
Application settings — loaded from .env via pydantic-settings.

Supports both the legacy single-key form (CG_ACCESS_TOKEN, BASE_URL, LLM_MODEL)
and the full multi-provider fallback form (PROVIDER_1_*, PROVIDER_2_*, PROVIDER_3_*).
The LLMClient resolves them in priority order at runtime.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────────
    app_name: str    = "ServiceNow Intelligence Platform API"
    app_version: str = "2.0.0"
    debug: bool      = False

    # ── Data source ───────────────────────────────────────────────────────────
    data_source: str = "csv"  # "csv" | "servicenow_api"
    csv_path: str    = os.path.join(os.path.dirname(__file__), "..", "data", "incidents.csv")

    # ── ServiceNow REST API ───────────────────────────────────────────────────
    servicenow_instance: str = ""
    servicenow_username: str = ""
    servicenow_password: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
    ]

    # ── Cache ─────────────────────────────────────────────────────────────────
    cache_ttl: int = 300  # seconds; 0 = no cache

    # ── LLM — legacy single-key form (backward compat with existing .env) ─────
    cg_access_token: str = ""   # CG_ACCESS_TOKEN
    base_url: str        = "https://openai.generative.engine.capgemini.com/v1"  # BASE_URL
    llm_model: str       = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"  # LLM_MODEL default

    # ── LLM — Provider 1: Capgemini (OpenAI-compatible) ──────────────────────
    provider_1_name: str      = "capgemini"
    provider_1_base_url: str  = ""  # falls back to base_url if empty
    provider_1_api_key: str   = ""  # falls back to cg_access_token if empty
    provider_1_models: str    = ""  # comma-sep; falls back to llm_model if empty

    # ── LLM — Provider 2: OpenAI ─────────────────────────────────────────────
    provider_2_name: str      = "openai"
    provider_2_base_url: str  = "https://api.openai.com/v1"
    provider_2_api_key: str   = ""
    provider_2_models: str    = "gpt-4o,gpt-4-turbo"

    # ── LLM — Provider 3: Anthropic native ───────────────────────────────────
    provider_3_name: str      = "anthropic"
    provider_3_base_url: str  = "https://api.anthropic.com/v1"
    provider_3_api_key: str   = ""
    provider_3_models: str    = "claude-3-5-sonnet-20241022,claude-3-opus-20240229"

    # ── Email / Azure Graph API (optional — for future alerting module) ───────
    azure_tenant_id: str     = ""
    azure_client_id: str     = ""
    azure_client_secret: str = ""
    smtp_user: str           = ""
    it_email: str            = ""

    class Config:
        env_file          = ".env"   # backend/.env (copy of project-root .env)
        env_file_encoding = "utf-8"
        extra             = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
