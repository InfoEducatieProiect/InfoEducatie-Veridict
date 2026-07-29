#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys

try:
    import spacy
except ImportError:
    print(
        json.dumps(
            {
                "error": "spaCy lipsește. Rulează: pip install spacy && python -m spacy download ro_core_news_sm",
            },
            ensure_ascii=False,
        )
    )
    sys.exit(1)

try:
    nlp = spacy.load("ro_core_news_sm")
except OSError:
    print(
        json.dumps(
            {
                "error": "Rulează mai întâi în terminal: python -m spacy download ro_core_news_sm",
            },
            ensure_ascii=False,
        )
    )
    sys.exit(1)


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _metrics_from_doc(doc) -> dict[str, float]:
    tokenuri_cuvinte = [token for token in doc if token.is_alpha]
    total_cuvinte = len(tokenuri_cuvinte)

    if total_cuvinte == 0:
        return {"ttr": 0.0, "asl": 0.0, "verbs": 0.0, "adjs": 0.0, "punct": 0.0}

    cuvinte_unice = {token.lemma_.lower() for token in tokenuri_cuvinte}
    ttr = (len(cuvinte_unice) / total_cuvinte) * 100

    total_propozitii = max(len(list(doc.sents)), 1)
    asl = total_cuvinte / total_propozitii

    verbe = sum(1 for token in tokenuri_cuvinte if token.pos_ in ("VERB", "AUX"))
    densitate_vrb = (verbe / total_cuvinte) * 100

    adjective = sum(1 for token in tokenuri_cuvinte if token.pos_ == "ADJ")
    densitate_adj = (adjective / total_cuvinte) * 100

    punctuatie_bruta = sum(1 for token in doc if token.is_punct)
    utilizare_punct = (punctuatie_bruta / total_cuvinte) * 100

    return {
        "ttr": round(ttr, 2),
        "asl": round(asl, 2),
        "verbs": round(densitate_vrb, 2),
        "adjs": round(densitate_adj, 2),
        "punct": round(utilizare_punct, 2),
    }


def calculeaza_deviatie_manhattan_normalizata(
    istoric: dict[str, float],
    curent: dict[str, float],
) -> float:
    chei = ["ttr", "asl", "verbs", "adjs", "punct"]
    suma_deviatii_relative = 0.0
    for cheie in chei:
        v_h = float(istoric.get(cheie, 0.0) or 0.0)
        v_c = float(curent.get(cheie, 0.0) or 0.0)
        numitor = max(v_c, v_h)
        if numitor == 0:
            continue
        suma_deviatii_relative += abs(v_c - v_h) / numitor
    return round((1 / 5) * suma_deviatii_relative * 100, 2)


def extrage_amprenta_stilometrica_procentuala(text: str) -> dict[str, float]:
    return _metrics_from_doc(nlp(text))


def _baseline_dict_sau_curent(
    baseline: object,
    curent: dict[str, float],
) -> dict[str, float]:
    if isinstance(baseline, dict) and any(
        baseline.get(k) is not None for k in ("ttr", "asl", "verbs", "adjs", "punct")
    ):
        return {
            "ttr": float(baseline.get("ttr") or 0),
            "asl": float(baseline.get("asl") or 0),
            "verbs": float(baseline.get("verbs") or 0),
            "adjs": float(baseline.get("adjs") or 0),
            "punct": float(baseline.get("punct") or 0),
        }
    return curent


def _rezultat_din_metrics(
    metrics: dict[str, float],
    baseline: object,
) -> dict[str, object]:
    baseline_dict = _baseline_dict_sau_curent(baseline, metrics)
    deviatie = calculeaza_deviatie_manhattan_normalizata(baseline_dict, metrics)
    return {
        "metrics": metrics,
        "deviation": deviatie,
        "baseline_used": baseline_dict,
    }


def _proceseaza_batch(items: list) -> None:
    valide: list[tuple[str, str, object]] = []
    rezultate: list[dict] = []

    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id", "") or "")
        if not item_id:
            continue
        text_curat = re.sub(r"\s+", " ", str(item.get("text", "") or "")).strip()
        if len(text_curat) < 5:
            rezultate.append({"id": item_id, "error": "Text lipsă sau prea scurt."})
            continue
        valide.append((item_id, text_curat, item.get("baseline")))

    if valide:
        docs = nlp.pipe([t for (_id, t, _b) in valide])
        for (item_id, _text, baseline), doc in zip(valide, docs):
            try:
                metrics = _metrics_from_doc(doc)
                rezultate.append({"id": item_id, **_rezultat_din_metrics(metrics, baseline)})
            except Exception as exc:  # noqa: BLE001 — izolare per-element
                rezultate.append({"id": item_id, "error": str(exc)})

    print(json.dumps({"results": rezultate}, ensure_ascii=False))


def main() -> None:
    _configure_utf8_streams()
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"error": "stdin gol"}, ensure_ascii=False))
            sys.exit(1)

        payload = json.loads(raw_input)

        texts = payload.get("texts") if isinstance(payload, dict) else None
        if isinstance(texts, list):
            _proceseaza_batch(texts)
            return

        text = str(payload.get("text", "") or "")
        baseline = payload.get("baseline")

        text_curat = re.sub(r"[\s\xa0\u200b\u200c\u200d]+", " ", text).strip()
        if len(text_curat) < 5:
            print(
                json.dumps(
                    {"error": "Textul furnizat lipsește sau este prea scurt."},
                    ensure_ascii=False,
                )
            )
            sys.exit(1)

        curent = extrage_amprenta_stilometrica_procentuala(text_curat)

        baseline_dict: dict[str, float] | None = None
        if isinstance(baseline, dict) and any(
            baseline.get(k) is not None for k in ("ttr", "asl", "verbs", "adjs", "punct")
        ):
            baseline_dict = {
                "ttr": float(baseline.get("ttr") or 0),
                "asl": float(baseline.get("asl") or 0),
                "verbs": float(baseline.get("verbs") or 0),
                "adjs": float(baseline.get("adjs") or 0),
                "punct": float(baseline.get("punct") or 0),
            }

        if not baseline_dict:
            baseline_dict = curent

        deviatie = calculeaza_deviatie_manhattan_normalizata(baseline_dict, curent)

        print(
            json.dumps(
                {
                    "metrics": curent,
                    "deviation": deviatie,
                    "baseline_used": baseline_dict,
                },
                ensure_ascii=False,
            )
        )
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"JSON invalid: {exc}"}, ensure_ascii=False))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
