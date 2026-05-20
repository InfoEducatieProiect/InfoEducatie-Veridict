"""
Multi-domain score distribution check — detects clustering in 19% / 37% / 50% bands.
Requires: pip install -r requirements.txt
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DETECTOR = ROOT / "scripts" / "ai_detector.py"

SAMPLES = {
    "technical_en": (
        "Furthermore, the algorithm plays a crucial role in optimization. "
        "It is important to note that one of the most essential for "
        "maintaining stable throughput across distributed nodes."
    ),
    "literary_ro": (
        "Romanul construieste un univers in care timpul pare suspendat. "
        "Personajele traverseaza drumuri initiatice, iar natura reactioneaza "
        "la fiecare gest al oamenilor din sat."
    ),
    "essay_en": (
        "In conclusion, trees provide people with oxygen. Forests are not only "
        "a source of life but also essential for ecological balance."
    ),
    "narrative_ro": (
        "Trenul incetini. Pasagerii ramase pe peron, iar vantul aducea "
        "un miros de fum si de ploaie rece de munte."
    ),
    "student_bio": (
        "Photosynthesis converts light energy into chemical energy stored in glucose. "
        "Chlorophyll absorbs photons and drives the Calvin cycle in chloroplasts."
    ),
}


def run_batch(texts: list[dict]) -> list[dict]:
    proc = subprocess.run(
        [sys.executable, str(DETECTOR)],
        input=json.dumps({"texts": texts}),
        capture_output=True,
        text=True,
        timeout=600,
        cwd=str(ROOT),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return json.loads(proc.stdout)["results"]


def bucket(score: float) -> str:
    if score < 15:
        return "low_0_15"
    if score < 40:
        return "mid_15_40"
    if score < 60:
        return "ambiguous_40_60"
    if score < 85:
        return "high_60_85"
    return "alert_85_100"


def main() -> None:
    payload = [{"id": k, "text": v} for k, v in SAMPLES.items()]
    results = run_batch(payload)
    scores = {r["id"]: r["scor_combinat_ai"] for r in results}
    buckets: dict[str, list[str]] = {}
    for sid, sc in scores.items():
        b = bucket(sc)
        buckets.setdefault(b, []).append(f"{sid}={sc}%")

    print("Scores:", json.dumps(scores, indent=2))
    print("Buckets:", json.dumps(buckets, indent=2))

    values = list(scores.values())
    unique = len(set(values))
    assert unique >= 3, f"Clustering artifact: only {unique} distinct scores {values}"

    frozen = [sc for sc in values if abs(sc - 19.5) < 0.1 or abs(sc - 37.5) < 0.1]
    assert len(frozen) <= 1, f"Frozen boundary scores detected: {frozen}"

    print("OK: distribution spans multiple bands without hard freeze clustering.")


if __name__ == "__main__":
    main()
