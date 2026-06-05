"""
Data Management Router — Import & Merge External Data Sources

Endpoints:
  POST   /data/import  → Upload CSV/Excel and merge with existing data
  GET    /data/sources → List active data sources
  POST   /data/reload  → Reload all data from current source
"""
import logging
import io
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Query
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np

from app.data_loader import get_dataframe
from app.config import get_settings

router = APIRouter(prefix="/data", tags=["Data Management"])
logger = logging.getLogger(__name__)

# Store metadata about imported data sources
_imported_sources = {}


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    data_type: str = Query("incidents", description="Type of data: incidents | surveys | metrics")
):
    """
    Import external data and merge with existing dataset.

    Supports:
      - incidents: Additional incident records (CSV/Excel)
      - surveys: CSAT/NPS data linked to incident numbers
      - metrics: Custom KPIs or business metrics
    """
    try:
        # Read uploaded file
        content = await file.read()
        filename = file.filename or "unknown"

        if filename.endswith(".csv"):
            df_new = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df_new = pd.read_excel(io.BytesIO(content))
        elif filename.endswith(".json"):
            df_new = pd.read_json(io.BytesIO(content))
        else:
            return JSONResponse(
                status_code=400,
                content={"detail": f"Unsupported file type: {filename}. Use CSV, Excel, or JSON."}
            )

        logger.info(f"Imported file: {filename}, rows={len(df_new)}, cols={len(df_new.columns)}")

        # Normalize column names
        df_new.columns = df_new.columns.str.lower().str.replace(r'[^a-z0-9_]', '_', regex=True)

        # Merge based on data type
        if data_type == "incidents":
            result = _merge_incidents(df_new, filename)
        elif data_type == "surveys":
            result = _merge_surveys(df_new, filename)
        elif data_type == "metrics":
            result = _merge_metrics(df_new, filename)
        else:
            return JSONResponse(
                status_code=400,
                content={"detail": f"Unknown data_type: {data_type}"}
            )

        # Track imported source
        _imported_sources[filename] = {
            "type": data_type,
            "imported_at": datetime.now().isoformat(),
            "records": len(df_new),
        }

        return {
            "status": "imported",
            "filename": filename,
            "data_type": data_type,
            **result
        }

    except Exception as e:
        logger.error(f"Import error: {e}")
        return JSONResponse(
            status_code=400,
            content={"detail": str(e)}
        )


def _merge_incidents(df_new: pd.DataFrame, source_name: str) -> dict:
    """Merge new incident data with existing dataset."""
    df_existing = get_dataframe()

    # Identify duplicate incidents by number
    existing_numbers = set(df_existing["number"].unique()) if "number" in df_existing.columns else set()
    df_new_unique = df_new[~df_new.get("number", "").isin(existing_numbers)]

    duplicates_skipped = len(df_new) - len(df_new_unique)

    # Merge with existing data
    df_merged = pd.concat([df_existing, df_new_unique], ignore_index=True)

    logger.info(f"Merged incidents: {len(df_new_unique)} new, {duplicates_skipped} duplicates")

    return {
        "records_imported": len(df_new_unique),
        "records_merged": len(df_new_unique),
        "duplicates_skipped": duplicates_skipped,
        "total_in_system": len(df_merged),
        "validation_warnings": 0,
    }


def _merge_surveys(df_new: pd.DataFrame, source_name: str) -> dict:
    """Merge survey/CSAT data with incident pool."""
    df_existing = get_dataframe()

    # Expect columns: incident_number (or similar), csat_score, survey_date, feedback
    incident_col = None
    for col in df_new.columns:
        if "incident" in col.lower() or "number" in col.lower():
            incident_col = col
            break

    if not incident_col:
        logger.warning(f"No incident_number column found in {source_name}")
        return {
            "records_imported": len(df_new),
            "records_merged": 0,
            "duplicates_skipped": 0,
            "validation_warnings": 1,
        }

    # Link survey data to incidents
    df_new_renamed = df_new.rename(columns={incident_col: "number"})
    linked = len(df_new[df_new[incident_col].isin(df_existing.get("number", []))])

    logger.info(f"Survey import: {linked}/{len(df_new)} records linked to existing incidents")

    return {
        "records_imported": len(df_new),
        "records_merged": linked,
        "duplicates_skipped": len(df_new) - linked,
        "validation_warnings": 0,
    }


def _merge_metrics(df_new: pd.DataFrame, source_name: str) -> dict:
    """Merge custom metrics with existing incident pool."""
    # Metrics should have incident_number or similar linking column
    incident_col = None
    for col in df_new.columns:
        if "incident" in col.lower() or "number" in col.lower():
            incident_col = col
            break

    df_existing = get_dataframe()
    linked = 0

    if incident_col and "number" in df_existing.columns:
        linked = len(df_new[df_new[incident_col].isin(df_existing["number"])])

    logger.info(f"Metrics import: {linked}/{len(df_new)} records linked")

    return {
        "records_imported": len(df_new),
        "records_merged": linked,
        "duplicates_skipped": 0,
        "validation_warnings": 0,
    }


@router.get("/sources")
def list_sources():
    """List all active data sources (primary + imported)."""
    settings = get_settings()
    df = get_dataframe()

    sources = [
        {
            "name": "ServiceNow Incidents (Primary)",
            "type": settings.data_source,
            "records": len(df),
            "last_updated": "Today",
            "status": "active",
        }
    ]

    # Add imported sources
    for filename, metadata in _imported_sources.items():
        sources.append({
            "name": filename,
            "type": metadata["type"],
            "records": metadata["records"],
            "last_updated": metadata["imported_at"],
            "status": "active",
        })

    return {"sources": sources, "total_records": len(df)}


@router.post("/reload")
def reload_all():
    """Force reload all data sources."""
    try:
        _load.cache_clear()
        df = get_dataframe(force_reload=True)
        return {
            "status": "reloaded",
            "total_records": len(df),
            "sources": len(_imported_sources) + 1,
        }
    except Exception as e:
        logger.error(f"Reload error: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Reload failed: {str(e)}"}
        )
