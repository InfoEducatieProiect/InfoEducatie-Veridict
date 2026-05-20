/**
 * TypeScript mirror of scripts/ai_detector.py — dynamic confidence gate fusion.
 */

const AMPRENTE_RO = [
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

const AMPRENTE_EN = [
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

const DIACRITIC_REPLACEMENTS: [string, string][] = [
  ["ă", "a"],
  ["â", "a"],
  ["î", "i"],
  ["ș", "s"],
  ["ț", "t"],
]

export interface HybridAiResult {
  scor_combinat_ai: number
  burstiness?: number
  amprente?: number
  probabilitate_roberta?: number
  scor_structura?: number
  densitate_amprente?: number
  limba_detectata?: string
  greutate_roberta?: number
  source: "python" | "typescript_fallback"
}

/** Mirrors Python `_detecteaza_limba_heuristica` for fallback parity. */
export function detecteazaLimba(text: string): "ro" | "en" {
  const lower = text.toLowerCase()
  const enHits = (
    lower.match(
      /\b(the|and|is|are|was|were|in|on|that|this|with|for|not|it|to|of)\b/g,
    ) ?? []
  ).length
  const roHits = (
    lower.match(
      /\b(sau|si|este|sunt|care|pentru|din|la|un|o|nu|ca|dar|mai)\b/g,
    ) ?? []
  ).length
  if (enHits > roHits * 1.15 && enHits >= 2) return "en"
  return "ro"
}

export function calculeazaBurstinessNativ(text: string): number {
  const propozitii = text.split(/[.!?]+/)
  const lungimi = propozitii
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
    .map((p) => p.split(/\s+/).filter(Boolean).length)
  if (lungimi.length <= 1) return 0
  const mean = lungimi.reduce((a, b) => a + b, 0) / lungimi.length
  const variance =
    lungimi.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lungimi.length
  return Math.round(Math.sqrt(variance) * 100) / 100
}

export function analizeazaAmprenteBilingveAgnostice(
  text: string,
  limba: string,
): number {
  let textLucru = text.toLowerCase()
  for (const [car, rep] of DIACRITIC_REPLACEMENTS) {
    textLucru = textLucru.split(car).join(rep)
  }
  const dictionar = limba === "en" ? AMPRENTE_EN : AMPRENTE_RO
  return dictionar.filter((a) => textLucru.includes(a)).length
}

export function evalueazaTextProfesionalFuzionat(
  text: string,
  limba: string,
): { burstiness: number; amprente: number; procent_ai: number } {
  const burst = calculeazaBurstinessNativ(text)
  const amprente = analizeazaAmprenteBilingveAgnostice(text, limba)
  let scorFinal = 35.0
  if (burst < 6.5) scorFinal += (6.5 - burst) * 6.5
  else scorFinal -= (burst - 6.5) * 3.0
  scorFinal += amprente * 9.5
  let procentAi = Math.min(Math.round(scorFinal * 10) / 10, 99.4)
  if (procentAi < 5.0) procentAi = 5.2
  return { burstiness: burst, amprente, procent_ai: procentAi }
}

/**
 * @param probabilitateRoberta — from RoBERTa when available; use ~50 only for pure structural fallback tests.
 * @param limba — omit to auto-detect (required for bilingual TS fallback parity).
 */
export function analizeazaTextComplet(
  text: string,
  probabilitateRoberta = 50.0,
  limba?: string,
): HybridAiResult {
  const limbaDetectata = limba ?? detecteazaLimba(text)
  const numarCuvinte = Math.max(text.split(/\s+/).filter(Boolean).length, 1)
  const rezultatHeuristic = evalueazaTextProfesionalFuzionat(text, limbaDetectata)

  let probabilitate_roberta = Math.round(probabilitateRoberta * 10) / 10
  const burst = rezultatHeuristic.burstiness
  const amprente = rezultatHeuristic.amprente
  const densitateAmprente = (amprente / numarCuvinte) * 100

  let scorStructura: number
  if (burst > 0) {
    scorStructura = Math.max(5, Math.min(95, 50 - (burst - 6.5) * 6))
  } else {
    scorStructura = 35
  }

  const factorLimba = limbaDetectata === "en" ? 18 : 12
  if (amprente > 0) {
    scorStructura = Math.min(95, scorStructura + amprente * factorLimba)
  }

  let greutateRoberta: number
  let greutateHeuristic: number

  if (probabilitate_roberta >= 75) {
    greutateRoberta = Math.min(1, 0.85 + (probabilitate_roberta - 75) * 0.006)
    greutateHeuristic = 1 - greutateRoberta
  } else if (probabilitate_roberta <= 25) {
    greutateRoberta = 0.7
    greutateHeuristic = 0.3
    if (burst > 8 && densitateAmprente < 1) {
      probabilitate_roberta = Math.max(5.2, probabilitate_roberta * 0.4)
    }
  } else {
    greutateRoberta = 0.45
    greutateHeuristic = 0.55
  }

  let scorCombinat =
    probabilitate_roberta * greutateRoberta +
    scorStructura * greutateHeuristic

  if (probabilitate_roberta > 80 && scorCombinat < 80) {
    scorCombinat = Math.max(scorCombinat, probabilitate_roberta * 0.95)
  }

  scorCombinat = Math.round(Math.max(Math.min(scorCombinat, 99.4), 0) * 10) / 10

  return {
    scor_combinat_ai: scorCombinat,
    burstiness: burst,
    amprente,
    probabilitate_roberta,
    scor_structura: Math.round(scorStructura * 10) / 10,
    densitate_amprente: Math.round(densitateAmprente * 100) / 100,
    limba_detectata: limbaDetectata,
    greutate_roberta: Math.round(greutateRoberta * 1000) / 1000,
    source: "typescript_fallback",
  }
}

export const analizeazaTextCompletAgnostic = analizeazaTextComplet
export const analizeazaTextCompletFinetuned = analizeazaTextComplet

export function mergePythonResult(raw: Record<string, unknown>): HybridAiResult {
  const scor = Number(raw.scor_combinat_ai)
  return {
    scor_combinat_ai: Number.isFinite(scor)
      ? Math.max(Math.min(scor, 99.4), 0)
      : 0,
    burstiness: raw.burstiness as number | undefined,
    amprente: raw.amprente as number | undefined,
    probabilitate_roberta: raw.probabilitate_roberta as number | undefined,
    scor_structura: raw.scor_structura as number | undefined,
    densitate_amprente: raw.densitate_amprente as number | undefined,
    limba_detectata: raw.limba_detectata as string | undefined,
    greutate_roberta: raw.greutate_roberta as number | undefined,
    source: "python",
  }
}
