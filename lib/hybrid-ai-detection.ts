/**
 * TypeScript mirror of scripts/ai_detector.py — Decoupled Ensemble Matrix.
 */

export const LIMBI_SLABE_ROBERTA = new Set([
  "ro",
  "hu",
  "pl",
  "cs",
  "sk",
  "bg",
  "hr",
  "uk",
  "ru",
  "tr",
])

export const AMPRENTE_RO = [
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

export const AMPRENTE_EN = [
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
  id?: string
  scor_combinat_ai: number
  probabilitate_roberta_bruta?: number
  probabilitate_roberta?: number
  burstiness?: number
  amprente?: number
  densitate_amprente?: number
  scor_structura?: number
  greutate_roberta?: number
  greutate_heuristic?: number
  limba_detectata?: string
  limba_slaba_pentru_roberta?: boolean
  scut_artistic_activ?: boolean
  scut_enciclopedic_activ?: boolean
  source: "python" | "typescript_fallback"
  error?: string
}

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

export function calculeazaScorStructura(
  burst: number,
  amprente: number,
): number {
  let scorStructura = 35.0
  scorStructura += Math.min(45.0, Math.log1p(amprente) * 18.0)
  if (burst < 3.5) scorStructura += 20.0
  else if (burst > 7.5) scorStructura -= 15.0
  return Math.max(0, Math.min(99.4, Math.round(scorStructura * 10) / 10))
}

export function ensembleFusion(
  probabilitateRobertaBruta: number,
  scorStructuraIn: number,
  burst: number,
  amprente: number,
  densitateAmprente: number,
  numarCuvinte: number,
): {
  scorCombinat: number
  probabilitateRoberta: number
  scorStructura: number
  greutateRoberta: number
  greutateHeuristic: number
  scutArtisticActiv: boolean
  scutEnciclopedicActiv: boolean
} {
  let prob = probabilitateRobertaBruta
  let scorStructura = scorStructuraIn
  let scutArtistic = false
  let scutEnciclopedic = false

  if (probabilitateRobertaBruta < 75) {
    scutArtistic = burst > 7 && densitateAmprente < 0.5
    scutEnciclopedic =
      burst >= 4 && densitateAmprente < 1.2 && numarCuvinte > 100
  }

  let greutateRoberta: number
  let greutateHeuristic: number

  if (probabilitateRobertaBruta >= 75) {
    scutArtistic = false
    scutEnciclopedic = false
    greutateRoberta = 0.8
    greutateHeuristic = 0.2
  } else if (probabilitateRobertaBruta <= 20 && amprente <= 1) {
    greutateRoberta = 0.85
    greutateHeuristic = 0.15
    scorStructura = Math.min(scorStructura, 25)
  } else {
    greutateRoberta = 0.5
    greutateHeuristic = 0.5
  }

  if (probabilitateRobertaBruta < 75 && (scutArtistic || scutEnciclopedic)) {
    greutateRoberta = 0.2
    greutateHeuristic = 0.85
    prob = Math.min(prob, 30)
  }

  let scorCombinat =
    Math.round((prob * greutateRoberta + scorStructura * greutateHeuristic) * 10) /
    10
  scorCombinat = Math.max(0, Math.min(99.4, scorCombinat))

  if (probabilitateRobertaBruta >= 75) {
    scorCombinat = Math.max(scorCombinat, probabilitateRobertaBruta)
  }

  return {
    scorCombinat,
    probabilitateRoberta: Math.round(prob * 10) / 10,
    scorStructura,
    greutateRoberta,
    greutateHeuristic,
    scutArtisticActiv: scutArtistic,
    scutEnciclopedicActiv: scutEnciclopedic,
  }
}

/**
 * @param probabilitateRobertaBruta — RoBERTa AI %; use 50 only for TS-only fallback tests.
 */
export function analizeazaTextComplet(
  text: string,
  probabilitateRobertaBruta = 50.0,
  limba?: string,
): HybridAiResult {
  const limbaHeuristica = limba ?? detecteazaLimba(text)
  const limbaDetectata: "ro" | "en" =
    limbaHeuristica === "en" ? "en" : "ro"
  const numarCuvinte = Math.max(text.split(/\s+/).filter(Boolean).length, 1)

  const probabilitate_roberta_bruta =
    Math.round(probabilitateRobertaBruta * 10) / 10
  const amprente = analizeazaAmprenteBilingveAgnostice(text, limbaDetectata)
  const burst = calculeazaBurstinessNativ(text)
  const densitate_amprente =
    Math.round((amprente / numarCuvinte) * 100 * 100) / 100

  let scorStructura = calculeazaScorStructura(burst, amprente)
  const fuziune = ensembleFusion(
    probabilitate_roberta_bruta,
    scorStructura,
    burst,
    amprente,
    densitate_amprente,
    numarCuvinte,
  )

  return {
    scor_combinat_ai: fuziune.scorCombinat,
    probabilitate_roberta_bruta: probabilitate_roberta_bruta,
    probabilitate_roberta: fuziune.probabilitateRoberta,
    burstiness: burst,
    amprente,
    densitate_amprente,
    scor_structura: fuziune.scorStructura,
    greutate_roberta: fuziune.greutateRoberta,
    greutate_heuristic: fuziune.greutateHeuristic,
    limba_detectata: limbaDetectata,
    limba_slaba_pentru_roberta: LIMBI_SLABE_ROBERTA.has(limbaHeuristica),
    scut_artistic_activ: fuziune.scutArtisticActiv,
    scut_enciclopedic_activ: fuziune.scutEnciclopedicActiv,
    source: "typescript_fallback",
  }
}

export const analizeazaTextCompletAgnostic = analizeazaTextComplet
export const analizeazaTextCompletFinetuned = analizeazaTextComplet

export function mergePythonResult(
  raw: Record<string, unknown>,
): HybridAiResult {
  const scor = Number(raw.scor_combinat_ai)
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    scor_combinat_ai: Number.isFinite(scor)
      ? Math.max(Math.min(scor, 99.4), 0)
      : 0,
    probabilitate_roberta_bruta: Number(raw.probabilitate_roberta_bruta),
    probabilitate_roberta: Number(raw.probabilitate_roberta),
    burstiness: Number(raw.burstiness),
    amprente: Number(raw.amprente),
    densitate_amprente: Number(raw.densitate_amprente),
    scor_structura: Number(raw.scor_structura),
    greutate_roberta: Number(raw.greutate_roberta),
    greutate_heuristic: Number(raw.greutate_heuristic),
    limba_detectata:
      raw.limba_detectata != null ? String(raw.limba_detectata) : undefined,
    limba_slaba_pentru_roberta: Boolean(raw.limba_slaba_pentru_roberta),
    scut_artistic_activ: Boolean(raw.scut_artistic_activ),
    scut_enciclopedic_activ: Boolean(raw.scut_enciclopedic_activ),
    source: "python",
    error: raw.error != null ? String(raw.error) : undefined,
  }
}
