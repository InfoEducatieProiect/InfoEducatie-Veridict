#!/usr/bin/env python3
"""
Veridict hybrid AI detection — Phase 2 finetuned:
XLM-RoBERTa + continuous burstiness structural layer + RO narrative shield + EN compensator.
stdin:  {"texts": [{"id": "<submission_id>", "text": "..."}, ...]}
stdout: {"results": [{"id": "...", "scor_combinat_ai": float, ...}, ...]}
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
except ImportError:
    _langdetect = None  # type: ignore

_detector: Pipeline | None = None
_LABEL_AI: str = "Fake"

_PATTERN_NARATIV = re.compile(
    r"\b(se opri|erau|ramase|gandi|avu|porni|simtea|zburau|adormise|purtat|devenise)\b",
    re.IGNORECASE,
)


def _detecteaza_limba(text: str) -> str:
    if _langdetect is None:
        return "ro"
    try:
        return _langdetect(text)
    except Exception:
        return "ro"


def calculeaza_burstiness_nativ(text: str) -> float:
    propozitii = re.split(r"[.!?]+", text)
    lungimi = [len(p.split()) for p in propozitii if len(p.strip()) > 2]
    if len(lungimi) <= 1:
        return 0.0
    return round(float(np.std(lungimi)), 2)


def detecteaza_stil_narativ_uman(text: str) -> bool:
    matches = _PATTERN_NARATIV.findall(text.lower())
    return len(matches) >= 3


def analizeaza_amprente_avansate(text: str, limba: str) -> int:
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
        "evidentiat perfect",
        "legatura organica",
        "universul conservator",
        "maestrul descrierilor",
        "un martor tacut",
        "un farmec special",
        "punand accent pe",
        "fara indoiala",
        "comorile lumii",
        "peisaje impresionante",
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
        "valuable treasures",
        "create beautiful landscapes",
        "source of life",
    ]

    replacements = {"ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t"}
    for car, rep in replacements.items():
        text_lucru = text_lucru.replace(car, rep)

    dictionar_activ = amprente_en if limba == "en" else amprente_ro
    return sum(1 for amprenta in dictionar_activ if amprenta in text_lucru)


def analizeaza_text_complet_finetuned(text: str) -> dict[str, Any]:
    limba = _detecteaza_limba(text)
    numar_cuvinte = max(len(text.split()), 1)

    global _detector, _LABEL_AI
    if _detector is None:
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        _detector = pipeline(
            "text-classification",
            model="yaya36095/xlm-roberta-text-detector",
            truncation=True,
            max_length=512,
        )
        test_res = _detector(
            "Artificial intelligence is generating automated code loops continuously."
        )[0]
        _LABEL_AI = (
            test_res["label"]
            if test_res["label"].lower() in ["fake", "label_1", "ai"]
            else "LABEL_1"
        )

    rezultat_brut = _detector(text)[0]
    eticheta = rezultat_brut["label"]
    este_ai = (
        eticheta == _LABEL_AI
        or "1" in eticheta
        or "fake" in eticheta.lower()
    )
    probabilitate_roberta = (
        rezultat_brut["score"] * 100
        if este_ai
        else (1.0 - rezultat_brut["score"]) * 100
    )
    probabilitate_roberta = round(probabilitate_roberta, 1)

    amprente = analizeaza_amprente_avansate(text, limba)
    if limba == "en" and amprente >= 2 and probabilitate_roberta < 60.0:
        probabilitate_roberta = max(probabilitate_roberta, 75.0)

    burst = calculeaza_burstiness_nativ(text)
    densitate_amprente = (amprente / numar_cuvinte) * 100

    scor_structural = 90.0 - (burst * 4.5)
    scor_structural = max(min(scor_structural, 95.0), 10.0)

    if amprente > 0:
        scor_structural = min(scor_structural + (amprente * 12.0), 99.0)

    este_proza_romaneasca = detecteaza_stil_narativ_uman(text)
    if este_proza_romaneasca and amprente == 0:
        probabilitate_roberta = min(probabilitate_roberta, 15.0)
        scor_structural = min(scor_structural, 15.0)

    if densitate_amprente > 0.8 or probabilitate_roberta > 75.0:
        greutate_roberta, greutate_heuristic = 0.90, 0.10
    else:
        greutate_roberta, greutate_heuristic = 0.65, 0.35

    scor_combinat = round(
        (probabilitate_roberta * greutate_roberta)
        + (scor_structural * greutate_heuristic),
        1,
    )

    if este_proza_romaneasca and amprente == 0:
        scor_combinat = min(scor_combinat, 8.5)

    scor_combinat = max(min(scor_combinat, 99.4), 1.5)

    return {
        "scor_combinat_ai": scor_combinat,
        "burstiness": burst,
        "amprente": amprente,
        "probabilitate_roberta": probabilitate_roberta,
        "scor_structura": round(scor_structural, 1),
        "densitate_amprente": round(densitate_amprente, 2),
        "limba_detectata": limba,
        "este_proza_romaneasca": este_proza_romaneasca,
        "eticheta_bruta": eticheta,
        "confidenta_model": round(rezultat_brut["score"], 4),
    }


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
            results.append({"id": item_id, "scor_combinat_ai": 1.5, "error": "empty_text"})
            continue
        try:
            out = analizeaza_text_complet_finetuned(text)
            out["id"] = item_id
            results.append(out)
        except Exception as exc:
            results.append({"id": item_id, "scor_combinat_ai": 1.5, "error": str(exc)})

    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
