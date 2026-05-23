#!/usr/bin/env python3
"""
Veridict hybrid AI detection v2 — Three-Signal Ensemble.
Signals: RoBERTa (yaya36095) + Romanian BERT pseudo-perplexity + structural stylometry.
Bilingual: Romanian and English.
Parity: lib/hybrid-ai-detection.ts (structural signals only — no perplexity in TS fallback).
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from typing import Any, Optional

import numpy as np
from transformers import Pipeline, pipeline

try:
    from langdetect import detect as _langdetect
    _LANGDETECT_DISPONIBIL = True
except ImportError:
    _LANGDETECT_DISPONIBIL = False
    _langdetect = None  # type: ignore

# ==========================================
# CONSTANTS
# ==========================================

_LIMBI_SLABE_ROBERTA = {"ro", "hu", "pl", "cs", "sk", "bg", "hr", "uk", "ru", "tr"}
_detector: Pipeline | None = None
_LABEL_AI: str = "Fake"

# Romanian AI-text fingerprints (word-boundary matched — avoids substring false matches)
_AMPRENTE_RO = [
    "una dintre cele mai",
    "are puterea de a",
    "in fiecare anotimp",
    "de aceea",
    "pentru ca",
    "atunci cand",
    "deoarece",
    "prin urmare",
    "in concluzie",
    "un rol important",
    "este esential",
    "ne ofera",
    "reprezinta un",
    "mediul inconjurator",
    "o stare de",
    "un aspect important",
    "punand accent pe",
    "fara indoiala",
    "un rol crucial",
    # additional high-confidence AI phrases
    "este important sa",
    "joaca un rol",
    "in ziua de astazi",
    "din punct de vedere",
    "contribuie la",
    "avand in vedere",
    "in acest sens",
]

_AMPRENTE_EN = [
    "one of the most",
    "provides people with",
    "in every season",
    "that is why",
    "it is important to",
    "not only a",
    "but also the",
    "fragile balance",
    "peace of mind",
    "plays a crucial role",
    "in conclusion",
    "essential for",
    "furthermore",
    "moreover",
    "create beautiful",
    "it is worth noting",
    "it is important to note",
    "in today's world",
    "needless to say",
]

_DIACRITICE = {"ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t"}


# ==========================================
# LANGUAGE DETECTION
# ==========================================

def _detecteaza_limba(text: str) -> str:
    if _LANGDETECT_DISPONIBIL and _langdetect is not None:
        try:
            lng = _langdetect(text)
            return "en" if lng == "en" else "ro"
        except Exception:
            pass
    return _detecteaza_limba_heuristica(text)


def _detecteaza_limba_heuristica(text: str) -> str:
    lower = text.lower()
    en_hits = len(re.findall(
        r"\b(the|and|is|are|was|were|in|on|that|this|with|for|not|it|to|of)\b", lower
    ))
    ro_hits = len(re.findall(
        r"\b(sau|si|este|sunt|care|pentru|din|la|un|o|nu|ca|dar|mai)\b", lower
    ))
    if en_hits > ro_hits * 1.15 and en_hits >= 2:
        return "en"
    return "ro"


# ==========================================
# STRUCTURAL SIGNAL (SIGNAL S)
# No baseline — only earned evidence accumulates.
# ==========================================

def calculeaza_burstiness_nativ(text: str) -> float:
    propozitii = re.split(r"[.!?]+", text)
    lungimi = [len(p.split()) for p in propozitii if len(p.strip()) > 2]
    if len(lungimi) <= 1:
        return 0.0
    return round(float(np.std(lungimi)), 2)


def _normalizeaza_text(text: str) -> str:
    t = text.lower()
    for car, rep in _DIACRITICE.items():
        t = t.replace(car, rep)
    return t


def analizeaza_amprente_bilingve_agnostice(text: str, limba: str) -> int:
    """Word-boundary-aware fingerprint matching (fixes substring false positives)."""
    t = _normalizeaza_text(text)
    dictionar = _AMPRENTE_EN if limba == "en" else _AMPRENTE_RO
    count = 0
    for fraza in dictionar:
        # Escape regex special chars; \b anchors to word boundaries
        pattern = r"\b" + re.escape(fraza) + r"\b"
        if re.search(pattern, t):
            count += 1
    return count


def calculeaza_scor_structura(
    burst: float,
    amprente: int,
    numar_cuvinte: int,
    text: str,
) -> float:
    """
    Evidence-additive structural score (0-100). No baseline anchor.
    AI signatures add to score; human signatures subtract.
    """
    s = 0.0

    # 1. Fingerprints — log-scaled diminishing returns (no hard density cap;
    #    log1p already handles it gracefully)
    s += min(40.0, math.log1p(amprente) * 16.0)

    # 2. Burstiness — continuous, no dead zones
    # Low burst (monotone) → AI. High burst (chaotic) → human.
    # Contribution: −15 (very varied) to +25 (very flat).
    s_burst = max(-15.0, min(25.0, (5.0 - burst) * 7.0))
    s += s_burst

    # 3. Type-Token Ratio — AI tends toward moderate uniformity
    words = text.lower().split()
    if len(words) >= 10:
        ttr = len(set(words)) / len(words)
        if ttr < 0.40:
            s += 15.0     # very repetitive → AI
        elif ttr < 0.55:
            s += 7.0
        elif ttr > 0.70:
            s -= 8.0      # rich vocabulary → human

    # 4. Punctuation diversity — AI rarely uses em-dashes, semicolons, parentheses
    punct_varied = set(c for c in text if c in "—–;:()[]\"'!?")
    if len(punct_varied) <= 1:
        s += 8.0
    elif len(punct_varied) >= 4:
        s -= 5.0

    return max(0.0, min(99.4, round(s, 1)))


# ==========================================
# ROBERTA SIGNAL (SIGNAL R)
# ==========================================

def _calibreaza_etichete(detector: Pipeline) -> None:
    global _LABEL_AI
    text_test_ai = (
        "Artificial intelligence is transforming modern software engineering "
        "by generating automated code implementations."
    )
    rezultat = detector(text_test_ai)[0]
    if rezultat["label"].lower() in ["fake", "label_1", "ai"]:
        _LABEL_AI = rezultat["label"]
    else:
        _LABEL_AI = "LABEL_0" if rezultat["label"] == "LABEL_0" else "LABEL_1"


def _get_detector() -> Pipeline:
    global _detector
    if _detector is None:
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        _detector = pipeline(
            "text-classification",
            model="yaya36095/xlm-roberta-text-detector",
            truncation=True,
            max_length=512,
        )
        _calibreaza_etichete(_detector)
    return _detector


def analizeaza_cu_roberta(text: str) -> dict[str, Any]:
    detector = _get_detector()
    rezultat_brut = detector(text)[0]
    eticheta = rezultat_brut["label"]
    confidenta = rezultat_brut["score"]
    eticheta_lower = eticheta.lower()
    este_ai = (
        eticheta == _LABEL_AI
        or "1" in eticheta
        or "fake" in eticheta_lower
        or "ai" in eticheta_lower
    )
    probabilitate_ai = (
        round(confidenta * 100, 1) if este_ai else round((1.0 - confidenta) * 100, 1)
    )
    return {
        "probabilitate_ai": probabilitate_ai,
        "eticheta_bruta": eticheta,
        "confidenta_model": round(confidenta, 4),
    }


# ==========================================
# PERPLEXITY SIGNAL (SIGNAL P, Romanian only)
# ==========================================

def _get_perplexitate_ro(text: str, limba: str) -> Optional[float]:
    """Returns 0-100 perplexity score for Romanian text, None for English or on failure."""
    if limba != "ro":
        return None
    try:
        from scripts._perplexity_ro import calculeaza_perplexitate_ro
        result = calculeaza_perplexitate_ro(text)
        return result.get("scor_perplexitate")
    except Exception:
        try:
            # Fallback: try relative import when running as subprocess
            import sys
            import os
            sys.path.insert(0, os.path.dirname(__file__))
            from _perplexity_ro import calculeaza_perplexitate_ro
            result = calculeaza_perplexitate_ro(text)
            return result.get("scor_perplexitate")
        except Exception:
            return None


def _get_perplexitate_ro_full(text: str, limba: str) -> dict[str, Any]:
    """Returns full perplexity dict with all fields."""
    if limba != "ro":
        return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None}
    try:
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from _perplexity_ro import calculeaza_perplexitate_ro
        return calculeaza_perplexitate_ro(text)
    except Exception as exc:
        return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None, "eroare": str(exc)}


# ==========================================
# THREE-SIGNAL FUSION
# ==========================================

def _ensemble_fusion_v2(
    R: float,
    P: Optional[float],
    S: float,
    burst: float,
    amprente: int,
    densitate: float,
    numar_cuvinte: int,
    limba: str,
) -> tuple[float, float, Optional[float], float, float, Optional[float], float, bool, bool]:
    """
    Returns (scor_combinat, R_adj, P_adj, S, w_r, w_p, w_s, scut_artistic, scut_enciclopedic).
    P=None means the perplexity signal is absent (English text or disabled).

    Language-adaptive weights:
    - Romanian: yaya36095 scores ≈99-100% on almost all RO text regardless of origin,
      so R is nearly non-discriminating. P (BERT-RO perplexity) and S dominate.
    - English: yaya36095 was trained mostly on EN and discriminates well. R dominates.
    """
    R_adj = R
    P_adj = P
    scut_artistic = False
    scut_enciclopedic = False

    # --- Language-adaptive base weights ---
    if limba == "ro":
        if P is not None:
            # Three-signal Romanian path (optimal)
            w_r, w_p, w_s = 0.15, 0.55, 0.30
        else:
            # Perplexity unavailable — lean heavily on structural signal
            w_r, w_p, w_s = 0.20, None, 0.80
    else:
        # English path — R is reliable; no perplexity
        if R >= 80:
            w_r, w_p, w_s = 0.80, None, 0.20
        else:
            w_r, w_p, w_s = 0.65, None, 0.35

    # --- Shields: additional protection for clearly-human structural patterns ---
    # Fire when BOTH LLM signals are uncertain (P low, R not overwhelmingly high for EN)
    llm_uncertain = (P is None or P < 50) and (limba != "en" or R < 80)
    if llm_uncertain:
        scut_artistic = burst > 7.0 and densitate < 0.5
        scut_enciclopedic = burst >= 4.0 and densitate < 1.2 and numar_cuvinte > 100

    if scut_artistic or scut_enciclopedic:
        R_adj = min(R, 30.0)
        if P is not None:
            P_adj = min(P, 30.0)
            w_r, w_p, w_s = 0.10, 0.20, 0.70
        else:
            w_r, w_p, w_s = 0.10, None, 0.90

    # --- Low-signal cap for Romanian: structural + P both indicate human ---
    if limba == "ro" and amprente <= 1 and (P is None or P <= 30):
        cap = max((P_adj or 0.0), S * 0.5) + 15.0
        raw = _compute_weighted(R_adj, P_adj, S, w_r, w_p, w_s)
        scor = max(0.0, min(99.4, min(cap, raw)))
        return scor, R_adj, P_adj, S, w_r, w_p, w_s, scut_artistic, scut_enciclopedic

    # --- Standard weighted sum ---
    scor = _compute_weighted(R_adj, P_adj, S, w_r, w_p, w_s)
    scor = min(99.4, max(0.0, round(scor, 1)))

    # Floor: only for English where R is genuinely discriminating
    if limba == "en" and R >= 80:
        scor = min(99.4, max(scor, min(R, 92.0)))

    return scor, R_adj, P_adj, S, w_r, w_p, w_s, scut_artistic, scut_enciclopedic


def _compute_weighted(
    R: float,
    P: Optional[float],
    S: float,
    w_r: float,
    w_p: Optional[float],
    w_s: float,
) -> float:
    if P is not None and w_p is not None:
        return round(R * w_r + P * w_p + S * w_s, 1)
    return round(R * w_r + S * w_s, 1)


# ==========================================
# MAIN ANALYSIS FUNCTION
# ==========================================

def analizeaza_text_complet(text: str, include_heuristic: bool = True) -> dict[str, Any]:
    limba_detectata = _detecteaza_limba(text)
    limba_iso: str = limba_detectata if limba_detectata in ("ro", "en") else "ro"

    rezultat_roberta = analizeaza_cu_roberta(text)
    R_brut = rezultat_roberta["probabilitate_ai"]
    numar_cuvinte = max(len(text.split()), 1)

    if not include_heuristic:
        return {
            "scor_combinat_ai": R_brut,
            "probabilitate_roberta_bruta": R_brut,
            "probabilitate_roberta": R_brut,
            "burstiness": 0.0,
            "amprente": 0,
            "densitate_amprente": 0.0,
            "scor_structura": 0.0,
            "greutate_roberta": 1.0,
            "greutate_heuristic": 0.0,
            "limba_detectata": limba_iso,
            "limba_slaba_pentru_roberta": limba_detectata in _LIMBI_SLABE_ROBERTA,
            "scut_artistic_activ": False,
            "scut_enciclopedic_activ": False,
            "scor_perplexitate": None,
            "perplexitate_medie": None,
            "perplexitate_stddev": None,
        }

    # --- Compute all three signals ---
    amprente = analizeaza_amprente_bilingve_agnostice(text, limba_iso)
    burst = calculeaza_burstiness_nativ(text)
    densitate_amprente = round((amprente / numar_cuvinte) * 100, 2)
    S = calculeaza_scor_structura(burst, amprente, numar_cuvinte, text)

    perp_result = _get_perplexitate_ro_full(text, limba_iso)
    P: Optional[float] = perp_result.get("scor_perplexitate")

    (
        scor_combinat,
        R_adj,
        P_adj,
        S_final,
        w_r,
        w_p,
        w_s,
        scut_artistic,
        scut_enciclopedic,
    ) = _ensemble_fusion_v2(R_brut, P, S, burst, amprente, densitate_amprente, numar_cuvinte, limba_iso)

    # greutate_heuristic is the combined non-RoBERTa weight for the TS mirror
    greutate_heuristic = round((w_p or 0.0) + w_s, 2) if w_p is not None else w_s

    return {
        "scor_combinat_ai": scor_combinat,
        "probabilitate_roberta_bruta": R_brut,
        "probabilitate_roberta": round(R_adj, 1),
        "burstiness": burst,
        "amprente": amprente,
        "densitate_amprente": densitate_amprente,
        "scor_structura": S_final,
        "greutate_roberta": w_r,
        "greutate_heuristic": greutate_heuristic,
        "limba_detectata": limba_iso,
        "limba_slaba_pentru_roberta": limba_detectata in _LIMBI_SLABE_ROBERTA,
        "scut_artistic_activ": scut_artistic,
        "scut_enciclopedic_activ": scut_enciclopedic,
        "scor_perplexitate": P_adj,
        "perplexitate_medie": perp_result.get("mean_surprisal"),
        "perplexitate_stddev": perp_result.get("stddev_surprisal"),
    }


def analizeaza_text_complet_agnostic(text: str) -> dict[str, Any]:
    return analizeaza_text_complet(text)


def analizeaza_text_complet_finetuned(text: str) -> dict[str, Any]:
    return analizeaza_text_complet(text)


# ==========================================
# STDIN/STDOUT JSON PROTOCOL (subprocess entry point)
# ==========================================

def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"Invalid JSON stdin: {exc}"}, sys.stdout)
        sys.exit(1)

    texts = payload.get("texts", [])
    if not isinstance(texts, list):
        json.dump({"error": "texts must be an array"}, sys.stdout)
        sys.exit(1)

    results: list[dict[str, Any]] = []
    for item in texts:
        item_id = str(item.get("id", ""))
        text = str(item.get("text", "") or "")
        if not text.strip():
            results.append({"id": item_id, "scor_combinat_ai": 0.0, "error": "empty_text"})
            continue
        try:
            out = analizeaza_text_complet(text)
            out["id"] = item_id
            results.append(out)
        except Exception as exc:
            results.append({"id": item_id, "scor_combinat_ai": 0.0, "error": str(exc)})

    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
