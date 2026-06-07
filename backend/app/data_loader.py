"""
Data Loader — tuned exactly to the real ServiceNow export format confirmed in screenshots:
- Date format: DD-MM-YYYY HH:MM  (e.g. 30-04-2026 23:01)
- Priority: "4 - Standard", "3 - Moderate", "2 - High", "1 - Critical"
- Urgency:  "3 - Low", "2 - Medium", "1 - High"
- Assigned to: "Saurabh Saraswat (SSaraswat2@slb.com)"
- Assignment groups: DPS-WEB-L2, Global-Traceability-L2, CG-DPS-Automation-L2
"""
import pandas as pd
import numpy as np
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

_df_cache = None
_cache_loaded_at = None

# Real priority mapping from screenshots
PRIORITY_MAP = {
    "1": 1, "1 - critical": 1, "1-critical": 1, "p1": 1, "critical": 1,
    "2": 2, "2 - high": 2, "2-high": 2, "p2": 2, "high": 2,
    "3": 3, "3 - moderate": 3, "3-moderate": 3, "p3": 3, "moderate": 3, "medium": 3,
    "4": 4, "4 - standard": 4, "4-standard": 4, "p4": 4, "standard": 4, "low": 4,
}
URGENCY_MAP = {
    "1": 1, "1 - high": 1, "1-high": 1, "high": 1,
    "2": 2, "2 - medium": 2, "2-medium": 2, "medium": 2,
    "3": 3, "3 - low": 3, "3-low": 3, "low": 3,
}
PRIORITY_LABELS = {1: "P1-Critical", 2: "P2-High", 3: "P3-Moderate", 4: "P4-Standard"}
URGENCY_LABELS  = {1: "1-High", 2: "2-Medium", 3: "3-Low"}

# NLP category classifier based on real service offerings and short descriptions
CATEGORY_RULES = [
    ("Application Access",  ["access", "permission", "login", "sso", "eptw", "certif",
                              "approve buddy", "approvebuddy", "account lock", "badge",
                              "access now", "epermit", "role", "authoris", "unauthor"]),
    ("Application Error",   ["error", "not working", "crash", "issue", "problem", "bug",
                              "giving an error", "went wrong", "failed", "failure",
                              "cannot", "can't", "unable", "not running", "not able"]),
    ("Data & Reporting",    ["report", "data fetch", "letter generation", "ksahr",
                              "validation", "document", "upload", "download", "export",
                              "eclaim", "eclaims", "mdbr", "cycle count"]),
    ("User Account",        ["new user", "onboard", "leaver", "deactivat", "profile",
                              "user setup", "joiner", "hrc", "icharge"]),
    ("Network",             ["vpn", "wifi", "network", "internet", "connect", "dns",
                              "bandwidth", "proxy", "connectivity"]),
    ("Hardware",            ["laptop", "desktop", "printer", "monitor", "mobile",
                              "device", "hardware", "screen", "docking"]),
    ("Software & Tools",    ["install", "software", "upgrade", "patch", "license",
                              "version", "update", "app update", "blueworld", "bluemm",
                              "blue mm", "slb ride", "slbride", "gt mobile", "iworkplace",
                              "workday", "sap", "sharepoint", "tep", "gbs ci tracker"]),
    ("Infrastructure",      ["server", "storage", "backup", "database", "infrastructure",
                              "cpu", "memory", "disk", "vm", "virtual"]),
    ("Change Request",      ["change request", "enhancement", "change/enhancement",
                              "product backlog", "feature request"]),
    ("Service Request",     ["request", "provision", "setup", "new", "require",
                              "materials management", "mct", "generic technical"]),
]

SUBCAT_RULES = {
    "Application Access":  [("Login/SSO", ["login","sso","sign in"]),
                             ("Permission Error", ["permission","access denied","unauthor"]),
                             ("Certification Required", ["certif","pcp"]),
                             ("Account Lockout", ["lock","locked"]),
                             ("Badge Access", ["badge"]),
                             ("EPTW Access", ["eptw","epermit"])],
    "Application Error":   [("Functional Error", ["error","not working","wrong"]),
                             ("Performance Issue", ["slow","timeout","hang"]),
                             ("Crash/Unresponsive", ["crash","unresponsive","freeze"])],
    "Data & Reporting":    [("Data Fetch Issue", ["fetch","data","report"]),
                             ("Document Upload", ["upload","document"]),
                             ("Validation Error", ["validation","reject"])],
    "Software & Tools":    [("Application Update", ["update","upgrade","version"]),
                             ("Installation", ["install"]),
                             ("License Issue", ["license"])],
}

def _classify_category(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return "General"
    t = text.lower()
    best_cat, best_score = "General", 0
    for cat, keywords in CATEGORY_RULES:
        score = sum(1 for kw in keywords if kw in t)
        if score > best_score:
            best_score, best_cat = score, cat
    return best_cat

def _classify_subcat(cat: str, text: str) -> str:
    if not isinstance(text, str):
        return "Other"
    t = text.lower()
    rules = SUBCAT_RULES.get(cat, [])
    for label, kws in rules:
        if any(kw in t for kw in kws):
            return label
    return "General"

def _parse_priority(val) -> int:
    s = str(val).strip().lower()
    # Direct lookup
    if s in PRIORITY_MAP:
        return PRIORITY_MAP[s]
    # Extract first digit
    for ch in s:
        if ch.isdigit():
            d = int(ch)
            if 1 <= d <= 4:
                return d
    return 3

def _parse_urgency(val) -> int:
    s = str(val).strip().lower()
    if s in URGENCY_MAP:
        return URGENCY_MAP[s]
    for ch in s:
        if ch.isdigit():
            d = int(ch)
            if 1 <= d <= 3:
                return d
    return 3

def _parse_dates(df: pd.DataFrame, col: str) -> pd.Series:
    """Parse DD-MM-YYYY HH:MM format as used in real ServiceNow export."""
    if col not in df.columns:
        return pd.Series([pd.NaT] * len(df))
    raw = df[col]
    # Try DD-MM-YYYY HH:MM first (real format), then fallback
    parsed = pd.to_datetime(raw, format="%d-%m-%Y %H:%M", errors="coerce")
    # For any that failed, try dayfirst=True general parse
    mask = parsed.isna() & raw.notna() & (raw.astype(str).str.strip() != "") & (raw.astype(str).str.strip() != "nan")
    if mask.any():
        parsed[mask] = pd.to_datetime(raw[mask], dayfirst=True, errors="coerce")
    # Last resort: standard parse
    still_na = parsed.isna() & raw.notna()
    if still_na.any():
        parsed[still_na] = pd.to_datetime(raw[still_na], errors="coerce")
    return parsed

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = (
        df.columns.str.strip().str.lower()
        .str.replace(r'[\s\-\/]+', '_', regex=True)
        .str.replace(r'[^\w]', '', regex=True)
    )
    ALIASES = {
        "impacted_user": "impact_user", "caller_id": "impact_user", "caller": "impact_user",
        "on_hold_reason": "hold_reason",
        "opened": "created", "opened_at": "created", "sys_created_on": "created",
        "close_notes": "resolution_notes", "close_code": "resolution_code",
        "resolved_at": "resolved", "closed_at": "resolved",
        "sys_updated_on": "updated", "last_updated": "updated",
        "business_service": "service_offering", "cmdb_ci": "service_offering",
        "assigned_to_name": "assigned_to",
        "made_sla": "made_sla",
    }
    for src, tgt in ALIASES.items():
        if src in df.columns and tgt not in df.columns:
            df = df.rename(columns={src: tgt})
    if "first_assignment_group" not in df.columns and "assignment_group" in df.columns:
        df["first_assignment_group"] = df["assignment_group"]
    return df

def _fill_defaults(df: pd.DataFrame) -> pd.DataFrame:
    DEFAULTS = {
        "hold_reason":"", "tags":"", "reopen_count":0, "reassignment_count":0,
        "business_duration":0, "resolution_notes":"", "resolution_code":"",
        "service_offering":"", "last_assignment_date":None, "urgency":3,
        "subcategory":"", "updated":None, "updated_by":"", "sla_due":None,
        "assigned_to":"", "impact_user":"", "last_reopened_at":None, "duration":0,
        "internal_id":"",
    }
    for col, default in DEFAULTS.items():
        if col not in df.columns:
            df[col] = default
    return df

def _load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False, dtype=str)  # read all as str first
    logger.info(f"Raw CSV: {len(df)} rows, {len(df.columns)} columns")
    logger.info(f"Raw columns: {df.columns.tolist()}")

    df = _normalize_columns(df)
    df = _fill_defaults(df)

    logger.info(f"Normalized columns: {df.columns.tolist()}")

    # Parse all date columns with DD-MM-YYYY aware parser
    for col in ["created", "updated", "resolved", "sla_due", "last_assignment_date", "last_reopened_at"]:
        df[col] = _parse_dates(df, col)

    # Priority — handles "4 - Standard", "3 - Moderate", etc.
    df["priority"] = df["priority"].apply(_parse_priority)
    df["priority_label"] = df["priority"].map(PRIORITY_LABELS)

    # Urgency — handles "3 - Low", "2 - Medium", etc.
    df["urgency"] = df["urgency"].apply(_parse_urgency)
    df["urgency_label"] = df["urgency"].map(URGENCY_LABELS)

    # SLA
    df["made_sla_bool"] = (
        df["made_sla"].astype(str).str.strip().str.upper()
        .isin(["TRUE","YES","1","Y"])
    )

    # Auto-derive Category & Subcategory from Short Description + Service Offering
    if "category" not in df.columns:
        combo = (df.get("short_description","").fillna("") + " " +
                 df.get("service_offering","").fillna("")).str.strip()
        df["category"] = combo.apply(_classify_category)
        logger.info(f"Auto-derived categories: {df['category'].value_counts().to_dict()}")

    if "subcategory" not in df.columns or df["subcategory"].str.strip().eq("").all():
        df["subcategory"] = df.apply(
            lambda r: _classify_subcat(r["category"],
                str(r.get("short_description","")) + " " + str(r.get("service_offering",""))), axis=1)

    # Time-derived columns
    if "created" in df.columns and df["created"].notna().any():
        df["month"] = df["created"].dt.to_period("M").astype(str)
        df["week"]  = df["created"].dt.to_period("W").astype(str)
        df["date"]  = df["created"].dt.date.astype(str)
        df["hour"]  = df["created"].dt.hour.fillna(9).astype(int)
        df["dow"]   = df["created"].dt.day_name()
    else:
        df["month"] = "Unknown"; df["week"] = "Unknown"
        df["date"]  = "Unknown"; df["hour"] = 9; df["dow"] = "Monday"

    # MTTR
    df["mttr_hours"] = np.where(
        df["resolved"].notna() & df["created"].notna(),
        (df["resolved"] - df["created"]).dt.total_seconds() / 3600,
        np.nan
    )

    # Numeric safety
    for col in ["reopen_count","reassignment_count"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
    df["business_duration"] = pd.to_numeric(df["business_duration"], errors="coerce").fillna(0)

    logger.info(f"Loaded {len(df)} incidents")
    logger.info(f"Priority dist: {df['priority'].value_counts().to_dict()}")
    logger.info(f"States: {df['state'].value_counts().to_dict()}")
    logger.info(f"Groups: {df['assignment_group'].value_counts().to_dict()}")
    logger.info(f"Date range: {df['created'].min()} → {df['created'].max()}")
    return df

def _load_servicenow(instance, username, password):
    raise NotImplementedError("Set DATA_SOURCE=csv in .env to use CSV mode.")

def get_dataframe(force_reload=False):
    global _df_cache, _cache_loaded_at
    from app.config import get_settings
    settings = get_settings()
    if _df_cache is not None and not force_reload:
        return _df_cache
    if settings.data_source == "csv":
        _df_cache = _load_csv(settings.csv_path)
    elif settings.data_source == "servicenow_api":
        _df_cache = _load_servicenow(settings.servicenow_instance,
                                     settings.servicenow_username, settings.servicenow_password)
    else:
        raise ValueError(f"Unknown data_source: {settings.data_source}")
    _cache_loaded_at = datetime.utcnow()
    return _df_cache

def apply_filters(df, params):
    if params.get("date_from"):
        df = df[df["created"] >= pd.Timestamp(params["date_from"])]
    if params.get("date_to"):
        df = df[df["created"] <= pd.Timestamp(params["date_to"]) + pd.Timedelta(days=1)]
    if params.get("towers"):
        df = df[df["tower"].isin(params["towers"])]
    if params.get("sdms"):
        df = df[df["sdm"].isin(params["sdms"])]
    if params.get("groups"):
        df = df[df["assignment_group"].isin(params["groups"])]
    if params.get("priorities"):
        df = df[df["priority"].isin([int(p) for p in params["priorities"]])]
    if params.get("categories"):
        df = df[df["category"].isin(params["categories"])]
    if params.get("states"):
        df = df[df["state"].isin(params["states"])]
    if params.get("sla"):
        if params["sla"] == "met":    df = df[df["made_sla_bool"] == True]
        elif params["sla"] == "breached": df = df[df["made_sla_bool"] == False]
    return df

def get_filter_options(df):
    return {
        "towers":     sorted(df["tower"].dropna().unique().tolist()),
        "sdms":       sorted(df["sdm"].dropna().unique().tolist()),
        "groups":     sorted(df["assignment_group"].dropna().unique().tolist()),
        "categories": sorted(df["category"].dropna().unique().tolist()),
        "states":     sorted(df["state"].dropna().unique().tolist()),
        "priorities": [{"value":k,"label":v} for k,v in PRIORITY_LABELS.items()],
        "date_min":   df["created"].min().strftime("%Y-%m-%d") if df["created"].notna().any() else None,
        "date_max":   df["created"].max().strftime("%Y-%m-%d") if df["created"].notna().any() else None,
    }
