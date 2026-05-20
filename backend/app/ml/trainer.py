"""
ML model trainer — M3 Smart Triage + M4 Intelligent Routing.

Three calibrated LinearSVC pipelines trained from incidents.csv:
  category_pipe  : TF-IDF → incident category
  priority_pipe  : TF-IDF → priority (1–4)
  group_pipe     : TF-IDF → first_assignment_group

A TF-IDF similarity index enables nearest-neighbour lookups for
surface-similar past incidents.  All training runs in a daemon thread
so it never blocks API startup.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

logger = logging.getLogger(__name__)

_models_instance: Optional["IncidentMLModels"] = None
_models_lock = threading.Lock()
_training_status: dict = {"status": "not_started"}


# ── Model class ───────────────────────────────────────────────────────────────

class IncidentMLModels:
    def __init__(self) -> None:
        self.category_pipe: Optional[Pipeline] = None
        self.priority_pipe: Optional[Pipeline] = None
        self.group_pipe: Optional[Pipeline] = None
        self.tfidf_sim: Optional[TfidfVectorizer] = None
        self.sim_matrix = None
        self._df_ref: Optional[pd.DataFrame] = None
        self.stats: dict = {}
        self.is_ready = False

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _make_pipe() -> Pipeline:
        return Pipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 2), max_features=8000,
                sublinear_tf=True, min_df=2, strip_accents="unicode",
            )),
            ("clf", CalibratedClassifierCV(
                LinearSVC(C=1.0, max_iter=3000, class_weight="balanced"),
                cv=3, method="sigmoid",
            )),
        ])

    def _fit_pipe(self, X: pd.Series, y: pd.Series, label: str, min_n: int = 40):
        """Filter rare classes, split, fit, log accuracy. Returns (pipe, acc)."""
        counts = y.value_counts()
        valid  = counts[counts >= 5].index
        mask   = y.isin(valid)
        X, y   = X[mask], y[mask]

        if len(X) < min_n or y.nunique() < 2:
            logger.warning(f"[{label}] insufficient data n={len(X)}, classes={y.nunique()} — skipping")
            return None, 0.0

        try:
            Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
            pipe = self._make_pipe()
            pipe.fit(Xtr, ytr)
            acc = float(accuracy_score(yte, pipe.predict(Xte)))
            logger.info(f"[{label}] accuracy={acc:.1%}  classes={y.nunique()}  n={len(X)}")
            return pipe, acc
        except Exception as exc:
            logger.error(f"[{label}] training error: {exc}")
            return None, 0.0

    # ── Training ──────────────────────────────────────────────────────────────

    def train(self, df: pd.DataFrame) -> None:
        logger.info("ML training started …")
        df = df.copy()

        def _text(row) -> str:
            parts = [
                str(row.get("short_description", "") or ""),
                str(row.get("service_offering",   "") or ""),
                str(row.get("category",           "") or ""),
            ]
            return " ".join(p for p in parts if p).strip()

        df["_text"] = df.apply(_text, axis=1)

        # ── Category ─────────────────────────────────────────────────────────
        cat_mask = (
            df["category"].notna()
            & (df["category"].str.strip() != "")
            & (df["category"] != "General")
        )
        pipe, acc = self._fit_pipe(df.loc[cat_mask, "_text"], df.loc[cat_mask, "category"], "category")
        self.category_pipe = pipe
        self.stats.update(
            category_accuracy=round(acc, 3),
            category_classes=int(df.loc[cat_mask, "category"].nunique()),
        )

        # ── Priority ─────────────────────────────────────────────────────────
        pri_mask = df["priority"].notna()
        pri_labels = df.loc[pri_mask, "priority"].astype(int)
        pipe, acc = self._fit_pipe(df.loc[pri_mask, "_text"], pri_labels, "priority")
        self.priority_pipe = pipe
        self.stats.update(priority_accuracy=round(acc, 3))

        # ── Assignment Group ──────────────────────────────────────────────────
        grp_mask = (
            df["first_assignment_group"].notna()
            & (df["first_assignment_group"].str.strip() != "")
        )
        pipe, acc = self._fit_pipe(df.loc[grp_mask, "_text"], df.loc[grp_mask, "first_assignment_group"], "group")
        self.group_pipe = pipe
        self.stats.update(
            group_accuracy=round(acc, 3),
            group_classes=int(df.loc[grp_mask, "first_assignment_group"].nunique()),
        )

        # ── Similarity index ──────────────────────────────────────────────────
        texts = df["_text"].fillna("").tolist()
        self.tfidf_sim  = TfidfVectorizer(ngram_range=(1, 2), max_features=12000, sublinear_tf=True)
        self.sim_matrix = self.tfidf_sim.fit_transform(texts)
        self._df_ref = df[[
            "number", "short_description", "category", "priority",
            "state", "first_assignment_group", "resolution_notes",
            "made_sla_bool", "mttr_hours",
        ]].reset_index(drop=True)
        logger.info(f"Similarity index: {self.sim_matrix.shape[0]} vectors")

        self.stats["total_incidents"] = int(len(df))
        self.stats["training_date"]   = pd.Timestamp.now().isoformat()
        self.is_ready = True
        logger.info("ML training complete.")

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict_category(self, text: str) -> tuple[str, float]:
        if not self.category_pipe:
            return "General", 0.5
        try:
            proba = self.category_pipe.predict_proba([text])[0]
            idx   = int(np.argmax(proba))
            return str(self.category_pipe.classes_[idx]), float(proba[idx])
        except Exception:
            return "General", 0.5

    def predict_priority(self, text: str) -> tuple[int, float]:
        if not self.priority_pipe:
            return 3, 0.5
        try:
            proba = self.priority_pipe.predict_proba([text])[0]
            idx   = int(np.argmax(proba))
            return int(self.priority_pipe.classes_[idx]), float(proba[idx])
        except Exception:
            return 3, 0.5

    def predict_group(self, text: str, top_k: int = 5) -> list[dict]:
        if not self.group_pipe:
            return []
        try:
            proba   = self.group_pipe.predict_proba([text])[0]
            top_idx = np.argsort(proba)[::-1][:top_k]
            return [
                {"group": str(self.group_pipe.classes_[i]), "confidence": round(float(proba[i]), 3)}
                for i in top_idx
            ]
        except Exception:
            return []

    def predict_subcategory(self, category: str, text: str) -> str:
        try:
            from app.data_loader import SUBCAT_RULES
            t = text.lower()
            for label, kws in SUBCAT_RULES.get(category, []):
                if any(kw in t for kw in kws):
                    return label
        except Exception:
            pass
        return "General"

    def find_similar(self, text: str, top_k: int = 5) -> list[dict]:
        if self.tfidf_sim is None or self.sim_matrix is None:
            return []
        try:
            q      = self.tfidf_sim.transform([text])
            scores = cosine_similarity(q, self.sim_matrix)[0]
            top_idx = np.argsort(scores)[::-1][: top_k + 5]
            results: list[dict] = []
            for idx in top_idx:
                if len(results) >= top_k:
                    break
                score = float(scores[idx])
                if score < 0.05:
                    break
                row = self._df_ref.iloc[idx]
                mttr = row.get("mttr_hours")
                results.append({
                    "number":     str(row.get("number", "")),
                    "description": str(row.get("short_description", ""))[:120],
                    "category":   str(row.get("category", "")),
                    "priority":   int(row["priority"]) if pd.notna(row.get("priority")) else 3,
                    "state":      str(row.get("state", "")),
                    "group":      str(row.get("first_assignment_group", "")),
                    "resolution": str(row.get("resolution_notes", ""))[:250] if pd.notna(row.get("resolution_notes")) else "",
                    "similarity": round(score, 3),
                    "mttr_hours": round(float(mttr), 1) if pd.notna(mttr) else None,
                })
            return results
        except Exception as exc:
            logger.warning(f"find_similar error: {exc}")
            return []

    def get_stats(self) -> dict:
        return dict(self.stats)


# ── Public API ────────────────────────────────────────────────────────────────

def get_models() -> Optional[IncidentMLModels]:
    return _models_instance


def get_training_status() -> dict:
    return dict(_training_status)


def init_models_async(df: pd.DataFrame) -> None:
    """Kick off model training in a daemon thread."""
    global _models_instance, _training_status
    _training_status = {"status": "training"}

    def _run() -> None:
        global _models_instance, _training_status
        with _models_lock:
            try:
                m = IncidentMLModels()
                m.train(df)
                _models_instance = m
                _training_status = {"status": "ready"}
            except Exception as exc:
                logger.exception("ML training failed")
                _training_status = {"status": "failed", "error": str(exc)}

    threading.Thread(target=_run, daemon=True, name="ml-trainer").start()
