#!/usr/bin/env python3
"""
Veridict hybrid AI detection — dynamic confidence gate fusion.
Neural veto >=75%, human re-anchor <=25%, language-scaled phrase norms. Bilingual.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

import numpy as np
from transformers import Pipeline, pipeline

try:
    from langdetect import detect as _langdetect

    _LANGDETECT_DISPONIBIL = True
except ImportError:
    _LANGDETECT_DISPONIBIL = False
    _langdetect = None  # type: ignore

_LIMBI_SLABE_ROBERTA = {"ro", "hu", "pl", "cs", "sk", "bg", "hr", "uk", "ru", "tr"}
_detector: Pipeline | None = None
_LABEL_AI: str = "Fake"


def _detecteaza_limba(text: str) -> str:
    if not _LANGDETECT_DISPONIBIL:
        return _detecteaza_limba_heuristica(text)
    try:
        lng = _langdetect(text)
        return lng if lng in ("ro", "en") else "ro"
    except Exception:
        return _detecteaza_limba_heuristica(text)


def _detecteaza_limba_heuristica(text: str) -> str:
    """Fallback when langdetect is unavailable — mirrors TS heuristic."""
    lower = text.lower()
    en_hits = len(
        re.findall(
            r"\b(the|and|is|are|was|were|in|on|that|this|with|for|not|it|to|of)\b",
            lower,
        )
    )
    ro_hits = len(
        re.findall(
            r"\b(sau|si|este|sunt|care|pentru|din|la|un|o|nu|ca|dar|mai)\b",
            lower,
        )
    )
    if en_hits > ro_hits * 1.15 and en_hits >= 2:
        return "en"
    return "ro"


def calculeaza_burstiness_nativ(text: str) -> float:
    propozitii = re.split(r"[.!?]+", text)
    lungimi = [len(p.split()) for p in propozitii if len(p.strip()) > 2]
    if len(lungimi) <= 1:
        return 0.0
    return round(float(np.std(lungimi)), 2)


def analizeaza_amprente_bilingve_agnostice(text: str, limba: str) -> int:
    text_lucru = text.lower()

    amprente_ro = [
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
    ]

    amprente_en = [
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
    ]

    replacements = {"ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t"}
    for car, rep in replacements.items():
        text_lucru = text_lucru.replace(car, rep)

    dictionar_activ = amprente_en if limba == "en" else amprente_ro
    return sum(1 for amprenta in dictionar_activ if amprenta in text_lucru)


def evalueaza_text_profesional_fuzionat(text: str, limba: str) -> dict[str, Any]:
    burst = calculeaza_burstiness_nativ(text)
    amprente = analizeaza_amprente_bilingve_agnostice(text, limba)

    scor_final = 35.0
    if burst < 6.5:
        scor_final += (6.5 - burst) * 6.5
    else:
        scor_final -= (burst - 6.5) * 3.0
    scor_final += amprente * 9.5

    procent_ai = min(round(scor_final, 1), 99.4)
    if procent_ai < 5.0:
        procent_ai = 5.2

    return {"burstiness": burst, "amprente": amprente, "procent_ai": procent_ai}


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
    este_eticheta_ai = (
        eticheta == _LABEL_AI
        or "1" in eticheta
        or "fake" in eticheta_lower
        or "ai" in eticheta_lower
    )
    probabilitate_ai = (
        round(confidenta * 100, 1)
        if este_eticheta_ai
        else round((1.0 - confidenta) * 100, 1)
    )
    return {
        "probabilitate_ai": probabilitate_ai,
        "eticheta_bruta": eticheta,
        "confidenta_model": round(confidenta, 4),
    }


def analizeaza_text_complet(text: str, include_heuristic: bool = True) -> dict[str, Any]:
    limba_detectata = _detecteaza_limba(text)
    rezultat_roberta = analizeaza_cu_roberta(text)
    numar_cuvinte = max(len(text.split()), 1)

    if not include_heuristic:
        return {"scor_combinat_ai": rezultat_roberta["probabilitate_ai"]}

    rezultat_heuristic = evalueaza_text_profesional_fuzionat(text, limba_detectata)
    probabilitate_roberta = rezultat_roberta["probabilitate_ai"]
    burst = rezultat_heuristic["burstiness"]
    amprente = rezultat_heuristic["amprente"]
    densitate_amprente = (amprente / numar_cuvinte) * 100

    # 1. Calibrare continuă a scorului de structură (fără IF-uri rigide)
    if burst > 0:
        scor_structura = max(5.0, min(95.0, 50.0 - (burst - 6.5) * 6.0))
    else:
        scor_structura = 35.0

    factor_limba = 18.0 if limba_detectata == "en" else 12.0
    if amprente > 0:
        scor_structura = min(95.0, scor_structura + (amprente * factor_limba))

    # 2. Dynamic Confidence Gate
    if probabilitate_roberta >= 75.0:
        greutate_roberta = min(1.0, 0.85 + (probabilitate_roberta - 75.0) * 0.006)
        greutate_heuristic = 1.0 - greutate_roberta
    elif probabilitate_roberta <= 25.0:
        greutate_roberta = 0.70
        greutate_heuristic = 0.30
        if burst > 8.0 and densitate_amprente < 1.0:
            probabilitate_roberta = max(5.2, probabilitate_roberta * 0.4)
    else:
        greutate_roberta = 0.45
        greutate_heuristic = 0.55

    scor_combinat = (
        probabilitate_roberta * greutate_roberta
        + scor_structura * greutate_heuristic
    )

    if probabilitate_roberta > 80.0 and scor_combinat < 80.0:
        scor_combinat = max(scor_combinat, probabilitate_roberta * 0.95)

    scor_combinat = max(min(round(scor_combinat, 1), 99.4), 0.0)

    return {
        "scor_combinat_ai": scor_combinat,
        "burstiness": burst,
        "amprente": amprente,
        "probabilitate_roberta": probabilitate_roberta,
        "scor_structura": round(scor_structura, 1),
        "densitate_amprente": round(densitate_amprente, 2),
        "limba_detectata": limba_detectata,
        "eticheta_bruta": rezultat_roberta.get("eticheta_bruta"),
        "confidenta_model": rezultat_roberta.get("confidenta_model"),
    }


def analizeaza_text_complet_agnostic(text: str) -> dict[str, Any]:
    return analizeaza_text_complet(text)


def analizeaza_text_complet_finetuned(text: str) -> dict[str, Any]:
    return analizeaza_text_complet(text)


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
