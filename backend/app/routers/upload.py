"""
M7 Data Upload — sanitize, deduplicate, and merge new incident files.

Flow:
  1. POST /api/upload/preview   → upload 1-N CSV/Excel files
                                  returns per-file column audit + dedupe summary
                                  stores sanitised DataFrame in _sessions[session_id]
  2. POST /api/upload/commit    → write session data to incidents.csv, reload cache
  3. GET  /api/upload/schema    → canonical column reference for download template
  4. DELETE /api/upload/session → cancel / free session memory

Key rules:
  • Canonical columns: always kept, added with blanks if missing.
  • Extra columns beyond canonical: DROPPED (logged in summary).
  • Dedup key: "number" (first column).  Duplicates within the upload are
    collapsed (last wins).  Duplicates vs. the live CSV are reported and
    skipped — existing rows are NOT overwritten.
"""
from __future__ import annotations

import io
import uuid
import logging
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.data_loader import (
    _normalize_columns, _parse_dates, _parse_priority, _parse_urgency,
    PRIORITY_LABELS,
)
from app.config import get_settings

router = APIRouter(prefix="/upload", tags=["M7 Data Upload"])
logger = logging.getLogger(__name__)

# ── Session store (per-process in-memory) ─────────────────────────────────────
_sessions: dict[str, pd.DataFrame] = {}   # session_id → sanitised DataFrame

# ── Canonical schema ──────────────────────────────────────────────────────────
# These are the columns incidents.csv must contain.  Order matters — CSV is
# written in this order so data_loader picks it up without changes.
CANONICAL_COLUMNS: list[str] = [
    "number", "created", "impact_user", "first_assignment_group",
    "assignment_group", "service_offering", "priority", "urgency",
    "state", "hold_reason", "assigned_to", "short_description",
    "category", "subcategory", "tags", "updated", "updated_by",
    "made_sla", "sla_due", "resolution_code", "resolved",
    "reopen_count", "reassignment_count", "business_duration",
    "last_assignment_date", "resolution_notes",
]

COLUMN_META: dict[str, dict] = {
    "number":                 {"required": True,  "default": "",           "description": "Incident ID (e.g. INC012447639)"},
    "created":                {"required": True,  "default": "",           "description": "Created date — DD-MM-YYYY HH:MM"},
    "impact_user":            {"required": False, "default": "",           "description": "Impacted user name (email or display)"},
    "first_assignment_group": {"required": True,  "default": "",           "description": "Primary assignment group"},
    "assignment_group":       {"required": False, "default": "",           "description": "L2 / escalation assignment group"},
    "service_offering":       {"required": False, "default": "",           "description": "Application / service name"},
    "priority":               {"required": True,  "default": "4 - Standard","description": "1-Critical / 2-High / 3-Moderate / 4-Standard"},
    "urgency":                {"required": False, "default": "3 - Low",    "description": "1-High / 2-Medium / 3-Low"},
    "state":                  {"required": True,  "default": "Open",       "description": "Open / In Progress / On Hold / Resolved / Closed"},
    "hold_reason":            {"required": False, "default": "",           "description": "Reason if On Hold"},
    "assigned_to":            {"required": False, "default": "",           "description": "Agent name / email"},
    "short_description":      {"required": False, "default": "",           "description": "Free-text incident description"},
    "category":               {"required": False, "default": "",           "description": "Category (auto-derived if blank)"},
    "subcategory":            {"required": False, "default": "",           "description": "Sub-category"},
    "tags":                   {"required": False, "default": "",           "description": "Comma-separated tags"},
    "updated":                {"required": False, "default": "",           "description": "Last updated date"},
    "updated_by":             {"required": False, "default": "",           "description": "Last updated by"},
    "made_sla":               {"required": False, "default": "FALSE",      "description": "TRUE / FALSE — was SLA met?"},
    "sla_due":                {"required": False, "default": "",           "description": "SLA due date"},
    "resolution_code":        {"required": False, "default": "",           "description": "How the incident was resolved"},
    "resolved":               {"required": False, "default": "",           "description": "Resolution date"},
    "reopen_count":           {"required": False, "default": "0",          "description": "Times the ticket was reopened"},
    "reassignment_count":     {"required": False, "default": "0",          "description": "Number of group reassignments"},
    "business_duration":      {"required": False, "default": "0",          "description": "Business duration in seconds"},
    "last_assignment_date":   {"required": False, "default": "",           "description": "Date of last reassignment"},
    "resolution_notes":       {"required": False, "default": "",           "description": "Resolution / close notes"},
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_file(file: UploadFile) -> pd.DataFrame:
    """Read CSV or Excel (any sheet) into a raw string DataFrame."""
    content = file.file.read()
    fname   = (file.filename or "").lower()
    if fname.endswith((".xlsx", ".xls", ".xlsm")):
        return pd.read_excel(io.BytesIO(content), dtype=str, engine="openpyxl")
    # CSV — try UTF-8 then latin-1
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(io.BytesIO(content), dtype=str, encoding=enc, low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode file — please save as UTF-8 CSV or XLSX.")


def _sanitize(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Normalise columns, add missing canonicals, drop extras.
    Returns (cleaned_df, column_audit).
    """
    original_cols = raw.columns.tolist()
    df = _normalize_columns(raw.copy())
    normalised_cols = set(df.columns.tolist())
    canonical_set   = set(CANONICAL_COLUMNS)

    missing  = [c for c in CANONICAL_COLUMNS if c not in normalised_cols]   # add with defaults
    extras   = [c for c in normalised_cols  if c not in canonical_set]       # drop
    kept     = [c for c in CANONICAL_COLUMNS if c in normalised_cols]        # already present

    # Add missing columns with their defaults
    for col in missing:
        df[col] = COLUMN_META[col]["default"]

    # Drop extra columns
    df = df[CANONICAL_COLUMNS]   # also enforces column order

    audit = {
        "original_columns":  original_cols,
        "columns_kept":      kept,
        "columns_added":     missing,
        "columns_dropped":   extras,
    }
    return df, audit


def _parse_values(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Parse dates, priority, urgency, SLA — collect warnings."""
    warnings: list[str] = []

    # Dates
    for col in ["created", "updated", "resolved", "sla_due", "last_assignment_date"]:
        df[col] = _parse_dates(df, col).astype(str).replace("NaT", "")

    # Priority / urgency
    df["priority"] = df["priority"].apply(_parse_priority)
    df["urgency"]  = df["urgency"].apply(_parse_urgency)

    # SLA
    sla_raw = df["made_sla"].astype(str).str.strip().str.upper()
    df["made_sla"] = sla_raw.where(sla_raw.isin(["TRUE","FALSE"]), other="FALSE")

    # Numeric fields
    for col in ["reopen_count", "reassignment_count", "business_duration"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int).astype(str)

    # Blank check on required fields
    for col in [c for c in CANONICAL_COLUMNS if COLUMN_META[c]["required"]]:
        blanks = (df[col].astype(str).str.strip() == "").sum()
        if blanks:
            warnings.append(f"'{col}' is required but {blanks} row(s) have a blank value.")

    return df, warnings


def _dedup_upload(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Remove internal duplicates (keep last occurrence, flag removed ones)."""
    dupes = df[df.duplicated(subset=["number"], keep="last")]["number"].tolist()
    df    = df.drop_duplicates(subset=["number"], keep="last")
    return df, dupes


def _dedup_vs_existing(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Compare against the live incidents.csv.
    Returns (new-only rows, list of numbers that already exist).
    """
    settings = get_settings()
    existing_path = Path(settings.csv_path)
    if not existing_path.exists():
        return df, []
    try:
        existing = pd.read_csv(existing_path, dtype=str, low_memory=False)
        existing = _normalize_columns(existing)
        if "number" not in existing.columns:
            return df, []
        existing_numbers = set(existing["number"].dropna().str.strip())
        mask = df["number"].str.strip().isin(existing_numbers)
        dupe_numbers = df.loc[mask, "number"].tolist()
        return df[~mask].copy(), dupe_numbers
    except Exception as exc:
        logger.warning(f"Could not compare against existing CSV: {exc}")
        return df, []


def _build_file_summary(filename: str, row_count_raw: int, audit: dict,
                         warnings: list[str], internal_dupes: list[str],
                         existing_dupes: list[str], net_new: int) -> dict:
    return {
        "filename":             filename,
        "rows_in_file":         row_count_raw,
        "columns_kept":         audit["columns_kept"],
        "columns_added":        audit["columns_added"],
        "columns_dropped":      audit["columns_dropped"],
        "warnings":             warnings,
        "internal_duplicates":  internal_dupes,
        "existing_duplicates":  existing_dupes,
        "net_new_rows":         net_new,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/schema")
def get_schema():
    """Return the canonical column spec (use as download template reference)."""
    return {
        "columns": [
            {"name": c, **COLUMN_META[c]}
            for c in CANONICAL_COLUMNS
        ],
        "total_columns": len(CANONICAL_COLUMNS),
        "date_format":   "DD-MM-YYYY HH:MM",
        "priority_values": ["1 - Critical", "2 - High", "3 - Moderate", "4 - Standard"],
        "urgency_values":  ["1 - High", "2 - Medium", "3 - Low"],
        "state_values":    ["Open", "In Progress", "On Hold", "Resolved", "Closed"],
        "sla_values":      ["TRUE", "FALSE"],
    }


@router.post("/preview")
async def preview_upload(files: List[UploadFile] = File(...)):
    """
    Upload 1-N CSV/Excel files.  Returns sanitisation audit + dedup summary.
    Stores sanitised data in session for commit.
    """
    if not files:
        raise HTTPException(400, "No files provided.")
    if len(files) > 10:
        raise HTTPException(400, "Maximum 10 files per upload.")

    combined_frames: list[pd.DataFrame] = []
    file_summaries: list[dict] = []

    for f in files:
        fname = f.filename or "unknown"
        try:
            raw = _read_file(f)
        except Exception as exc:
            raise HTTPException(422, f"Could not read '{fname}': {exc}")

        if raw.empty:
            file_summaries.append({"filename": fname, "error": "File is empty."})
            continue

        raw_count = len(raw)

        # Sanitise
        clean, audit        = _sanitize(raw)
        clean, val_warnings = _parse_values(clean)

        # Internal dedup
        clean, int_dupes    = _dedup_upload(clean)

        # Vs existing
        clean, ext_dupes    = _dedup_vs_existing(clean)

        net_new = len(clean)
        file_summaries.append(_build_file_summary(
            fname, raw_count, audit, val_warnings, int_dupes, ext_dupes, net_new
        ))
        if net_new > 0:
            combined_frames.append(clean)

    # Merge across files — resolve cross-file duplicates too
    cross_file_dupes: list[str] = []
    if combined_frames:
        combined = pd.concat(combined_frames, ignore_index=True)
        cross_dupes_mask = combined.duplicated(subset=["number"], keep="last")
        cross_file_dupes = combined.loc[cross_dupes_mask, "number"].tolist()
        combined = combined.drop_duplicates(subset=["number"], keep="last")
    else:
        combined = pd.DataFrame(columns=CANONICAL_COLUMNS)

    session_id = str(uuid.uuid4())
    _sessions[session_id] = combined

    total_net = len(combined)
    total_raw = sum(s.get("rows_in_file", 0) for s in file_summaries if "rows_in_file" in s)
    total_int = sum(len(s.get("internal_duplicates", [])) for s in file_summaries)
    total_ext = sum(len(s.get("existing_duplicates", [])) for s in file_summaries)

    return {
        "session_id":          session_id,
        "files_processed":     len([s for s in file_summaries if "error" not in s]),
        "files_errored":       len([s for s in file_summaries if "error" in s]),
        "total_rows_received": total_raw,
        "internal_duplicates": total_int,
        "existing_duplicates": total_ext,
        "cross_file_duplicates": len(cross_file_dupes),
        "net_new_rows":        total_net,
        "file_details":        file_summaries,
        "preview_rows":        combined.head(10).fillna("").to_dict(orient="records"),
        "ready_to_commit":     total_net > 0,
    }


class CommitRequest(BaseModel):
    session_id: str
    merge_mode: str = "append"   # "append" = add new rows only (safe default)


@router.post("/commit")
def commit_upload(req: CommitRequest):
    """
    Persist the sanitised rows from a preview session to incidents.csv.
    Triggers a full data + ML reload.
    """
    df = _sessions.get(req.session_id)
    if df is None:
        raise HTTPException(404, "Session not found or already committed. Re-upload your files.")
    if df.empty:
        del _sessions[req.session_id]
        return {"status": "nothing_to_write", "rows_written": 0}

    settings = get_settings()
    csv_path = Path(settings.csv_path)

    try:
        if csv_path.exists():
            existing = pd.read_csv(csv_path, dtype=str, low_memory=False)
            existing_norm = _normalize_columns(existing.copy())

            if req.merge_mode == "append":
                # Add only net-new rows
                if "number" in existing_norm.columns:
                    existing_numbers = set(existing_norm["number"].dropna().str.strip())
                    df_new = df[~df["number"].str.strip().isin(existing_numbers)]
                else:
                    df_new = df

                # Restore original header style: write normalised, data_loader handles it
                updated = pd.concat([existing_norm, df_new[CANONICAL_COLUMNS]], ignore_index=True)
            else:
                updated = df[CANONICAL_COLUMNS]
        else:
            updated = df[CANONICAL_COLUMNS]

        updated.to_csv(csv_path, index=False)
        rows_written = len(df)
        logger.info(f"Upload committed: {len(df)} new rows → {csv_path}")

        # Re-run normaliser on the merged file to ensure full consistency
        try:
            import sys
            sys.path.insert(0, str(Path(__file__).parent.parent.parent / "data"))
            from normalise_data import normalise as _normalise
            _normalise(str(csv_path), str(csv_path), verbose=False)
            logger.info("Post-commit normalisation completed.")
        except Exception as exc:
            logger.warning(f"Post-commit normalisation skipped: {exc}")

    except Exception as exc:
        logger.error(f"Commit failed: {exc}")
        raise HTTPException(500, f"Failed to write data: {exc}")
    finally:
        del _sessions[req.session_id]

    # Reload data + retrain ML
    try:
        from app.data_loader import get_dataframe
        reloaded = get_dataframe(force_reload=True)
        try:
            from app.ml.trainer import init_models_async
            init_models_async(reloaded)
        except Exception as exc:
            logger.warning(f"ML retrain skipped: {exc}")
    except Exception as exc:
        logger.warning(f"Data reload after commit failed: {exc}")

    return {
        "status":       "committed",
        "rows_written": len(df),
        "csv_path":     str(csv_path),
    }


@router.delete("/session/{session_id}")
def cancel_session(session_id: str):
    """Discard a preview session without writing."""
    if session_id in _sessions:
        del _sessions[session_id]
        return {"status": "cancelled"}
    return {"status": "not_found"}
