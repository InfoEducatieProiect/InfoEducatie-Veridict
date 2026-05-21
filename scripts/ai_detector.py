#!/usr/bin/env python3
"""
Veridict hybrid AI detection — Decoupled Ensemble Matrix.
RoBERTa (yaya36095/xlm-roberta-text-detector) + non-linear stylometrics.
Parity: lib/hybrid-ai-detection.ts
"""
from __future__ import annotations

import json
import math
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
        if lng == "en":
            return "en"
        return "ro"
    except Exception:
        return _detecteaza_limba_heuristica(text)


def _detecteaza_limba_heuristica(text: str) -> str:
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


def _calculeaza_scor_structura(burst: float, amprente: int) -> float:
    scor_structura = 35.0
    scor_structura += min(45.0, math.log1p(amprente) * 18.0)
    if burst < 3.5:
        scor_structura += 20.0
    elif burst > 7.5:
        scor_structura -= 15.0
    return max(0.0, min(99.4, round(scor_structura, 1)))


def _ensemble_fusion(
    probabilitate_roberta_bruta: float,
    scor_structura: float,
    burst: float,
    amprente: int,
    densitate_amprente: float,
    numar_cuvinte: int,
) -> tuple[float, float, float, float, float, bool, bool]:
    prob = probabilitate_roberta_bruta
    scut_artistic = False
    scut_enciclopedic = False

    if probabilitate_roberta_bruta < 75.0:
        scut_artistic = burst > 7.0 and densitate_amprente < 0.5
        scut_enciclopedic = (
            burst >= 4.0
            and densitate_amprente < 1.2
            and numar_cuvinte > 100
        )

    if probabilitate_roberta_bruta >= 75.0:
        scut_artistic = False
        scut_enciclopedic = False
        greutate_roberta = 0.80
        greutate_heuristic = 0.20
    elif probabilitate_roberta_bruta <= 20.0 and amprente <= 1:
        greutate_roberta = 0.85
        greutate_heuristic = 0.15
        scor_structura = min(scor_structura, 25.0)
    else:
        greutate_roberta = 0.50
        greutate_heuristic = 0.50

    if probabilitate_roberta_bruta < 75.0 and (scut_artistic or scut_enciclopedic):
        greutate_roberta = 0.20
        greutate_heuristic = 0.85
        prob = min(prob, 30.0)

    scor_combinat = round(
        (prob * greutate_roberta) + (scor_structura * greutate_heuristic),
        1,
    )
    scor_combinat = max(0.0, min(99.4, scor_combinat))

    if probabilitate_roberta_bruta >= 75.0:
        scor_combinat = max(scor_combinat, probabilitate_roberta_bruta)

    return (
        scor_combinat,
        round(prob, 1),
        scor_structura,
        greutate_roberta,
        greutate_heuristic,
        scut_artistic,
        scut_enciclopedic,
    )


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
    limba_iso = limba_detectata if limba_detectata in ("ro", "en") else "ro"
    rezultat_roberta = analizeaza_cu_roberta(text)
    numar_cuvinte = max(len(text.split()), 1)

    probabilitate_roberta_bruta = rezultat_roberta["probabilitate_ai"]

    if not include_heuristic:
        return {
            "scor_combinat_ai": probabilitate_roberta_bruta,
            "probabilitate_roberta_bruta": probabilitate_roberta_bruta,
            "probabilitate_roberta": probabilitate_roberta_bruta,
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
        }

    amprente = analizeaza_amprente_bilingve_agnostice(text, limba_iso)
    burst = calculeaza_burstiness_nativ(text)
    densitate_amprente = round((amprente / numar_cuvinte) * 100, 2)

    scor_structura = _calculeaza_scor_structura(burst, amprente)
    (
        scor_combinat,
        probabilitate_roberta,
        scor_structura,
        greutate_roberta,
        greutate_heuristic,
        scut_artistic,
        scut_enciclopedic,
    ) = _ensemble_fusion(
        probabilitate_roberta_bruta,
        scor_structura,
        burst,
        amprente,
        densitate_amprente,
        numar_cuvinte,
    )

    return {
        "scor_combinat_ai": scor_combinat,
        "probabilitate_roberta_bruta": probabilitate_roberta_bruta,
        "probabilitate_roberta": probabilitate_roberta,
        "burstiness": burst,
        "amprente": amprente,
        "densitate_amprente": densitate_amprente,
        "scor_structura": scor_structura,
        "greutate_roberta": greutate_roberta,
        "greutate_heuristic": greutate_heuristic,
        "limba_detectata": limba_iso,
        "limba_slaba_pentru_roberta": limba_detectata in _LIMBI_SLABE_ROBERTA,
        "scut_artistic_activ": scut_artistic,
        "scut_enciclopedic_activ": scut_enciclopedic,
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
            results.append(
                {
                    "id": item_id,
                    "scor_combinat_ai": 0.0,
                    "error": "empty_text",
                }
            )
            continue
        try:
            out = analizeaza_text_complet(text)
            out["id"] = item_id
            results.append(out)
        except Exception as exc:
            results.append(
                {
                    "id": item_id,
                    "scor_combinat_ai": 0.0,
                    "error": str(exc),
                }
            )

    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
