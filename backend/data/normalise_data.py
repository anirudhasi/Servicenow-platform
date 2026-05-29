#!/usr/bin/env python3
"""
ServiceNow Data Normaliser
==========================
Run this script ONCE on any raw CSV/Excel export before placing it in
backend/data/incidents.csv.  It is also called automatically by the
M7 upload endpoint (app/routers/upload.py) on every upload.

Usage (standalone):
    python normalise_data.py                          # normalise incidents.csv in-place
    python normalise_data.py --input raw_export.xlsx  # convert an Excel export
    python normalise_data.py --input raw.csv --output incidents.csv

What it does (in order):
    1.  Read CSV or Excel (any sheet)
    2.  Normalise column names  → lowercase, underscored
    3.  Apply column aliases    → e.g. "Opened" → "created"
    4.  Add missing canonical columns with sensible defaults
    5.  Drop columns not in the canonical schema (logged, not silently lost)
    6.  Parse dates             → stored as "DD-MM-YYYY HH:MM" strings
    7.  Parse priority/urgency  → numeric 1-4 then back to label string
    8.  Normalise SLA           → TRUE / FALSE (uppercase)
    9.  Normalise state         → title-cased to known values
   10.  Auto-derive category / subcategory from short_description if blank
   11.  Clamp numeric fields    → reopen_count, reassignment_count ≥ 0
   12.  Deduplicate on "number" (keep last occurrence)
   13.  Write clean CSV         → UTF-8, no index, canonical column order
   14.  Print a full audit report to stdout

The output file is 100 % compatible with data_loader.py and all M1-M6 charts.
"""

import sys
import os
import argparse
import io
import logging
from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

# ── Canonical columns (must match data_loader.py) ────────────────────────────
CANONICAL_COLUMNS = [
    "number", "created", "impact_user", "first_assignment_group",
    "assignment_group", "service_offering", "priority", "urgency",
    "state", "hold_reason", "assigned_to", "short_description",
    "category", "subcategory", "tags", "updated", "updated_by",
    "made_sla", "sla_due", "resolution_code", "resolved",
    "reopen_count", "reassignment_count", "business_duration",
    "last_assignment_date", "resolution_notes",
]

COLUMN_DEFAULTS = {
    "impact_user": "",        "assignment_group": "",   "service_offering": "",
    "urgency": "3 - Low",    "state": "Open",          "hold_reason": "",
    "assigned_to": "",        "short_description": "",  "category": "",
    "subcategory": "",        "tags": "",               "updated": "",
    "updated_by": "",         "made_sla": "FALSE",      "sla_due": "",
    "resolution_code": "",    "resolved": "",           "reopen_count": "0",
    "reassignment_count": "0","business_duration": "0", "last_assignment_date": "",
    "resolution_notes": "",   "first_assignment_group": "", "priority": "4 - Standard",
    "number": "",
}

COLUMN_ALIASES = {
    "impacted_user":       "impact_user",
    "caller_id":           "impact_user",
    "caller":              "impact_user",
    "opened":              "created",
    "opened_at":           "created",
    "sys_created_on":      "created",
    "on_hold_reason":      "hold_reason",
    "close_notes":         "resolution_notes",
    "close_code":          "resolution_code",
    "resolved_at":         "resolved",
    "closed_at":           "resolved",
    "sys_updated_on":      "updated",
    "last_updated":        "updated",
    "business_service":    "service_offering",
    "cmdb_ci":             "service_offering",
    "assigned_to_name":    "assigned_to",
    "internal_id":         None,   # → drop (not in canonical)
}

PRIORITY_MAP = {
    "1": 1, "1 - critical": 1, "1-critical": 1, "p1": 1, "critical": 1,
    "2": 2, "2 - high": 2,     "2-high": 2,     "p2": 2, "high": 2,
    "3": 3, "3 - moderate": 3, "3-moderate": 3, "p3": 3, "moderate": 3, "medium": 3,
    "4": 4, "4 - standard": 4, "4-standard": 4, "p4": 4, "standard": 4, "low": 4,
}
PRIORITY_LABEL = {1: "1 - Critical", 2: "2 - High", 3: "3 - Moderate", 4: "4 - Standard"}

URGENCY_MAP = {
    "1": 1, "1 - high": 1,   "1-high": 1,   "high": 1,
    "2": 2, "2 - medium": 2, "2-medium": 2, "medium": 2,
    "3": 3, "3 - low": 3,    "3-low": 3,    "low": 3,
}
URGENCY_LABEL = {1: "1 - High", 2: "2 - Medium", 3: "3 - Low"}

VALID_STATES = {"Open", "In Progress", "On Hold", "Resolved", "Closed"}
STATE_ALIASES = {
    "new": "Open", "work in progress": "In Progress", "wip": "In Progress",
    "hold": "On Hold", "pending": "On Hold", "close": "Closed",
    "complete": "Resolved", "completed": "Resolved", "done": "Resolved",
}

CATEGORY_RULES = [
    ("Application Access",  ["access", "permission", "login", "sso", "certif", "badge", "account lock", "role"]),
    ("Application Error",   ["error", "not working", "crash", "issue", "problem", "bug", "failed", "cannot", "unable"]),
    ("Data & Reporting",    ["report", "data", "letter", "validation", "document", "upload", "export", "cycle count"]),
    ("User Account",        ["new user", "onboard", "leaver", "deactivat", "profile", "user setup"]),
    ("Network",             ["vpn", "wifi", "network", "internet", "connect", "dns", "bandwidth"]),
    ("Hardware",            ["laptop", "desktop", "printer", "monitor", "mobile", "device", "screen"]),
    ("Software & Tools",    ["install", "software", "upgrade", "patch", "license", "version", "update", "sap", "sharepoint"]),
    ("Infrastructure",      ["server", "storage", "backup", "database", "cpu", "memory", "vm"]),
    ("Service Request",     ["request", "provision", "setup", "require"]),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_file(path: str) -> pd.DataFrame:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if p.suffix.lower() in (".xlsx", ".xls", ".xlsm"):
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            raise ImportError("openpyxl is required for Excel files: pip install openpyxl")
        return pd.read_excel(path, dtype=str, engine="openpyxl")
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(path, dtype=str, encoding=enc, low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Cannot decode {path}")


def _norm_colname(c: str) -> str:
    import re
    return re.sub(r'[^\w]', '', re.sub(r'[\s\-\/]+', '_', c.strip().lower()))


def _normalise_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list, list, list]:
    df.columns = [_norm_colname(c) for c in df.columns]
    original = set(df.columns)

    # Apply aliases
    for src, tgt in COLUMN_ALIASES.items():
        if src in df.columns:
            if tgt and tgt not in df.columns:
                df = df.rename(columns={src: tgt})
            elif tgt is None or (tgt and tgt in df.columns):
                df = df.drop(columns=[src], errors="ignore")

    if "first_assignment_group" not in df.columns and "assignment_group" in df.columns:
        df["first_assignment_group"] = df["assignment_group"]

    canonical_set = set(CANONICAL_COLUMNS)
    current       = set(df.columns)
    missing       = [c for c in CANONICAL_COLUMNS if c not in current]
    extra         = [c for c in current if c not in canonical_set]
    kept          = [c for c in CANONICAL_COLUMNS if c in current]

    for col in missing:
        df[col] = COLUMN_DEFAULTS.get(col, "")
    df = df[CANONICAL_COLUMNS]

    return df, kept, missing, extra


def _parse_date_col(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, format="%d-%m-%Y %H:%M", errors="coerce")
    mask = parsed.isna() & series.notna() & (series.astype(str).str.strip().ne("")) & (series.astype(str).str.strip().ne("nan"))
    if mask.any():
        parsed[mask] = pd.to_datetime(series[mask], dayfirst=True, errors="coerce")
    still_na = parsed.isna() & series.notna() & (series.astype(str).str.strip().ne(""))
    if still_na.any():
        parsed[still_na] = pd.to_datetime(series[still_na], errors="coerce")
    return parsed


def _parse_dates(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    date_cols = ["created", "updated", "resolved", "sla_due", "last_assignment_date"]
    failed = 0
    for col in date_cols:
        if col not in df.columns:
            continue
        parsed = _parse_date_col(df[col])
        bad = parsed.isna() & df[col].notna() & (df[col].astype(str).str.strip() != "")
        failed += bad.sum()
        df[col] = parsed.dt.strftime("%d-%m-%Y %H:%M").where(parsed.notna(), other="")
    return df, failed


def _classify_category(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return "General"
    t = text.lower()
    best, score = "General", 0
    for cat, kws in CATEGORY_RULES:
        s = sum(1 for kw in kws if kw in t)
        if s > score:
            best, score = cat, s
    return best


def _parse_values(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    issues = {"priority_fixed": 0, "urgency_fixed": 0, "sla_fixed": 0, "state_fixed": 0}

    # Priority
    def fix_pri(v):
        k = str(v).strip().lower()
        if k in PRIORITY_MAP:
            return PRIORITY_LABEL[PRIORITY_MAP[k]]
        for ch in k:
            if ch.isdigit() and 1 <= int(ch) <= 4:
                return PRIORITY_LABEL[int(ch)]
        issues["priority_fixed"] += 1
        return "4 - Standard"

    # Urgency
    def fix_urg(v):
        k = str(v).strip().lower()
        if k in URGENCY_MAP:
            return URGENCY_LABEL[URGENCY_MAP[k]]
        for ch in k:
            if ch.isdigit() and 1 <= int(ch) <= 3:
                return URGENCY_LABEL[int(ch)]
        issues["urgency_fixed"] += 1
        return "3 - Low"

    df["priority"] = df["priority"].apply(fix_pri)
    df["urgency"]  = df["urgency"].apply(fix_urg)

    # SLA
    def fix_sla(v):
        s = str(v).strip().upper()
        if s in ("TRUE", "YES", "1", "Y"):  return "TRUE"
        if s in ("FALSE", "NO", "0", "N"):  return "FALSE"
        issues["sla_fixed"] += 1
        return "FALSE"

    df["made_sla"] = df["made_sla"].apply(fix_sla)

    # State
    def fix_state(v):
        s = str(v).strip()
        if s in VALID_STATES:
            return s
        lo = s.lower()
        if lo in STATE_ALIASES:
            issues["state_fixed"] += 1
            return STATE_ALIASES[lo]
        issues["state_fixed"] += 1
        return "Open"

    df["state"] = df["state"].apply(fix_state)

    # Numeric fields
    for col in ["reopen_count", "reassignment_count", "business_duration"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).clip(lower=0).astype(int).astype(str)

    # Auto-derive category if blank
    blank_cat = df["category"].astype(str).str.strip().eq("")
    if blank_cat.any():
        combo = (df["short_description"].fillna("") + " " + df["service_offering"].fillna("")).str.strip()
        df.loc[blank_cat, "category"] = combo[blank_cat].apply(_classify_category)

    return df, issues


def normalise(input_path: str, output_path: str | None = None, verbose: bool = True) -> dict:
    """
    Full pipeline. Returns an audit dict.
    Called both by this script and by app/routers/upload.py.
    """
    if output_path is None:
        output_path = input_path

    if verbose:
        log.info(f"Reading: {input_path}")
    df = _read_file(input_path)
    raw_rows = len(df)
    raw_cols = df.columns.tolist()

    if verbose:
        log.info(f"  Raw: {raw_rows} rows, {len(raw_cols)} columns")

    # 1. Column normalisation
    df, kept, added, dropped = _normalise_columns(df)
    if verbose:
        if added:   log.info(f"  Columns added ({len(added)}):   {added}")
        if dropped: log.info(f"  Columns dropped ({len(dropped)}): {dropped}")

    # 2. Date parsing
    df, date_failures = _parse_dates(df)
    if verbose and date_failures:
        log.warning(f"  {date_failures} date values could not be parsed — set to blank")

    # 3. Value normalisation
    df, val_issues = _parse_values(df)
    if verbose:
        for k, v in val_issues.items():
            if v:
                log.info(f"  {k}: {v} values corrected")

    # 4. Deduplication
    pre_dedup = len(df)
    df = df.drop_duplicates(subset=["number"], keep="last")
    dupes_removed = pre_dedup - len(df)
    if verbose and dupes_removed:
        log.warning(f"  Removed {dupes_removed} duplicate incident numbers (kept last occurrence)")

    # 5. Remove rows with blank number
    blank_num = df["number"].astype(str).str.strip().eq("")
    if blank_num.any():
        if verbose:
            log.warning(f"  Removed {blank_num.sum()} rows with blank 'number' field")
        df = df[~blank_num]

    # 6. Write output
    df.to_csv(output_path, index=False, encoding="utf-8")
    net_rows = len(df)
    if verbose:
        log.info(f"  Written: {net_rows} rows → {output_path}")

    return {
        "input":           input_path,
        "output":          output_path,
        "raw_rows":        raw_rows,
        "raw_columns":     raw_cols,
        "columns_kept":    kept,
        "columns_added":   added,
        "columns_dropped": dropped,
        "date_failures":   date_failures,
        "value_corrections": val_issues,
        "duplicates_removed": dupes_removed,
        "net_rows":        net_rows,
    }


# ── CLI entry point ───────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Normalise incident data for the ServiceNow Intelligence Platform")
    ap.add_argument("--input",  "-i", default=None,
                    help="Input CSV or Excel file (default: incidents.csv in this directory)")
    ap.add_argument("--output", "-o", default=None,
                    help="Output CSV path (default: overwrite input or incidents.csv)")
    ap.add_argument("--quiet",  "-q", action="store_true",
                    help="Suppress informational output")
    args = ap.parse_args()

    here = Path(__file__).parent
    default_csv = here / "incidents.csv"

    in_path  = args.input  or str(default_csv)
    out_path = args.output or (str(default_csv) if not args.input else args.input.replace(".xlsx","_normalised.csv").replace(".xls","_normalised.csv"))

    if not Path(in_path).exists():
        print(f"ERROR: Input file not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "="*60)
    print("  ServiceNow Data Normaliser")
    print("="*60)

    audit = normalise(in_path, out_path, verbose=not args.quiet)

    print("\n── Audit Summary " + "─"*44)
    print(f"  Input rows      : {audit['raw_rows']:,}")
    print(f"  Columns kept    : {len(audit['columns_kept'])}")
    print(f"  Columns added   : {len(audit['columns_added'])}  {audit['columns_added'] if audit['columns_added'] else ''}")
    print(f"  Columns dropped : {len(audit['columns_dropped'])}  {audit['columns_dropped'] if audit['columns_dropped'] else ''}")
    print(f"  Date failures   : {audit['date_failures']}")
    for k, v in audit['value_corrections'].items():
        if v:
            print(f"  {k:<22}: {v} values corrected")
    print(f"  Duplicates removed: {audit['duplicates_removed']}")
    print(f"  Net output rows : {audit['net_rows']:,}")
    print(f"  Output file     : {audit['output']}")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
