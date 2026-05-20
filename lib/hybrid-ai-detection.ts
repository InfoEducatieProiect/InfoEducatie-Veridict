/**
 * TypeScript mirror of scripts/ai_detector.py — Phase 2 finetuned fusion.
 * Used when the Python/RoBERTa subprocess is unavailable (degraded mode).
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
  "valuable treasures",
  "create beautiful landscapes",
  "source of life",
]

const PATTERN_NARATIV =
  /\b(se opri|erau|ramase|gandi|avu|porni|simtea|zburau|adormise|purtat|devenise)\b/gi

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
  este_proza_romaneasca?: boolean
  source: "python" | "typescript_fallback"
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

export function detecteazaStilNarativUman(text: string): boolean {
  const matches = text.toLowerCase().match(PATTERN_NARATIV)
  return (matches?.length ?? 0) >= 3
}

export function analizeazaAmprenteAvansate(text: string, limba: string): number {
  let textLucru = text.toLowerCase()
  for (const [car, rep] of DIACRITIC_REPLACEMENTS) {
    textLucru = textLucru.split(car).join(rep)
  }
  const dictionar = limba === "en" ? AMPRENTE_EN : AMPRENTE_RO
  return dictionar.filter((a) => textLucru.includes(a)).length
}

/**
 * Phase 2 finetuned fusion. When RoBERTa is unavailable, pass `probabilitateRoberta`
 * from an external source or use 50 for neutral structural blending.
 */
export function analizeazaTextCompletFinetuned(
  text: string,
  probabilitateRoberta = 50.0,
  limba = "ro",
): HybridAiResult {
  const numarCuvinte = Math.max(text.split(/\s+/).filter(Boolean).length, 1)
  let probabilitate_roberta = Math.round(probabilitateRoberta * 10) / 10

  const amprente = analizeazaAmprenteAvansate(text, limba)
  if (limba === "en" && amprente >= 2 && probabilitate_roberta < 60.0) {
    probabilitate_roberta = Math.max(probabilitate_roberta, 75.0)
  }

  const burst = calculeazaBurstinessNativ(text)
  const densitateAmprente = (amprente / numarCuvinte) * 100

  let scorStructural = 90.0 - burst * 4.5
  scorStructural = Math.max(Math.min(scorStructural, 95.0), 10.0)

  if (amprente > 0) {
    scorStructural = Math.min(scorStructural + amprente * 12.0, 99.0)
  }

  const esteProzaRomaneasca = detecteazaStilNarativUman(text)
  if (esteProzaRomaneasca && amprente === 0) {
    probabilitate_roberta = Math.min(probabilitate_roberta, 15.0)
    scorStructural = Math.min(scorStructural, 15.0)
  }

  let greutateRoberta: number
  let greutateHeuristic: number
  if (densitateAmprente > 0.8 || probabilitate_roberta > 75.0) {
    greutateRoberta = 0.9
    greutateHeuristic = 0.1
  } else {
    greutateRoberta = 0.65
    greutateHeuristic = 0.35
  }

  let scorCombinat =
    Math.round(
      (probabilitate_roberta * greutateRoberta +
        scorStructural * greutateHeuristic) *
        10,
    ) / 10

  if (esteProzaRomaneasca && amprente === 0) {
    scorCombinat = Math.min(scorCombinat, 8.5)
  }

  scorCombinat = Math.max(Math.min(scorCombinat, 99.4), 1.5)

  return {
    scor_combinat_ai: scorCombinat,
    burstiness: burst,
    amprente,
    probabilitate_roberta,
    scor_structura: Math.round(scorStructural * 10) / 10,
    densitate_amprente: Math.round(densitateAmprente * 100) / 100,
    limba_detectata: limba,
    este_proza_romaneasca: esteProzaRomaneasca,
    source: "typescript_fallback",
  }
}

export function mergePythonResult(raw: Record<string, unknown>): HybridAiResult {
  const scor = Number(raw.scor_combinat_ai)
  return {
    scor_combinat_ai: Number.isFinite(scor)
      ? Math.max(Math.min(scor, 99.4), 1.5)
      : 1.5,
    burstiness: raw.burstiness as number | undefined,
    amprente: raw.amprente as number | undefined,
    probabilitate_roberta: raw.probabilitate_roberta as number | undefined,
    scor_structura: raw.scor_structura as number | undefined,
    densitate_amprente: raw.densitate_amprente as number | undefined,
    limba_detectata: raw.limba_detectata as string | undefined,
    este_proza_romaneasca: raw.este_proza_romaneasca as boolean | undefined,
    source: "python",
  }
}
