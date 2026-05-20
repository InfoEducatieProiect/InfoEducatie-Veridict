"""Phase 2 validation: human narrative low, EN AI above human, RO AI essays diverge smoothly."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DETECTOR = ROOT / "scripts" / "ai_detector.py"

TEXT_HUMAN_NARRATIVE = (
    "Trenul se opri brusc. Oamenii erau obositi, ramase pe peron in tacere. "
    "El gandi la copilarie, la zilele cand zburau cu trenul spre munte. "
    "Simtea frigul, apoi adormise pe scaunul ingust."
)

TEXT_EN_AI = (
    "Trees are one of the most valuable treasures of our world. "
    "They provide people with oxygen and create beautiful landscapes. "
    "Forests are not only a source of life but also play a crucial role "
    "in maintaining the fragile balance of nature and peace of mind."
)

TEXT_RO_AI_A = (
    "Universul conservator în care timpul pare suspendat este evidențiat perfect "
    "în monografia comunității pastorale din opera Baltagul. Mihail Sadoveanu insistă "
    "pe legătura organică dintre om și natură, punând accent pe ritualurile fundamentale."
)

TEXT_RO_AI_B = (
    "Opera Baltagul prezintă o perspectivă mitică asupra existenței, suprapusă peste "
    "o structură epică de roman polițist cu clare elemente arhaice românești. "
    "Căutarea adevărului de Vitoria Lipan urmează un traseu geografic prin munți."
)


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


def main() -> None:
    results = run_batch(
        [
            {"id": "human", "text": TEXT_HUMAN_NARRATIVE},
            {"id": "en_ai", "text": TEXT_EN_AI},
            {"id": "ro_ai_a", "text": TEXT_RO_AI_A},
            {"id": "ro_ai_b", "text": TEXT_RO_AI_B},
        ]
    )
    by_id = {r["id"]: r for r in results}
    print(json.dumps(by_id, indent=2, ensure_ascii=False))

    human = by_id["human"]["scor_combinat_ai"]
    en_ai = by_id["en_ai"]["scor_combinat_ai"]
    ro_a = by_id["ro_ai_a"]["scor_combinat_ai"]
    ro_b = by_id["ro_ai_b"]["scor_combinat_ai"]

    assert human < 15.0, f"Human narrative should be low, got {human}%"
    assert en_ai > human + 10, f"EN AI ({en_ai}) should exceed human ({human})"
    assert en_ai != human, f"Compression overlap: both scored {human}%"
    assert abs(ro_a - ro_b) < 20, f"Similar RO AI essays diverged too much: {ro_a} vs {ro_b}"
    print(f"OK: human={human}% en_ai={en_ai}% ro_a={ro_a}% ro_b={ro_b}%")


if __name__ == "__main__":
    main()
