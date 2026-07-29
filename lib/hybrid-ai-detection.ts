
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
  "este important sa",
  "joaca un rol",
  "in ziua de astazi",
  "din punct de vedere",
  "contribuie la",
  "avand in vedere",
  "in acest sens",
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
  "it is worth noting",
  "it is important to note",
  "in today's world",
  "needless to say",
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
  scor_perplexitate?: number | null
  perplexitate_medie?: number | null
  perplexitate_stddev?: number | null
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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
  return dictionar.filter((fraza) =>
    new RegExp("\\b" + escapeRegex(fraza) + "\\b").test(textLucru),
  ).length
}

export function calculeazaScorStructura(
  burst: number,
  amprente: number,
  numarCuvinte: number,
  text: string,
): number {
  let s = 0.0

  s += Math.min(40.0, Math.log1p(amprente) * 16.0)

  const sBurst = Math.max(-15.0, Math.min(25.0, (5.0 - burst) * 7.0))
  s += sBurst

  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length >= 10) {
    const ttr = new Set(words).size / words.length
    if (ttr < 0.4) s += 15.0
    else if (ttr < 0.55) s += 7.0
    else if (ttr > 0.7) s -= 8.0
  }

  const punctVaried = new Set(
    [...text].filter((c) => "—–;:()[]\"'!?".includes(c)),
  ).size
  if (punctVaried <= 1) s += 8.0
  else if (punctVaried >= 4) s -= 5.0

  return Math.max(0, Math.min(99.4, Math.round(s * 10) / 10))
}

export function ensembleFusion(
  R: number,
  S: number,
  burst: number,
  amprente: number,
  densitateAmprente: number,
  numarCuvinte: number,
  limba: "ro" | "en" = "ro",
): {
  scorCombinat: number
  probabilitateRoberta: number
  scorStructura: number
  greutateRoberta: number
  greutateHeuristic: number
  scutArtisticActiv: boolean
  scutEnciclopedicActiv: boolean
} {
  let R_adj = R
  let w_r: number
  let w_s: number
  let scutArtistic = false
  let scutEnciclopedic = false

  if (limba === "ro") {
    w_r = 0.20
    w_s = 0.80
  } else {
    w_r = R >= 80 ? 0.80 : 0.65
    w_s = R >= 80 ? 0.20 : 0.35
  }

  if (limba !== "en" || R < 80) {
    scutArtistic = burst > 7.0 && densitateAmprente < 0.5
    scutEnciclopedic =
      burst >= 4.0 && densitateAmprente < 1.2 && numarCuvinte > 100
  }

  if (scutArtistic || scutEnciclopedic) {
    R_adj = Math.min(R, 30)
    w_r = 0.10
    w_s = 0.90
  }

  if (limba === "ro" && amprente <= 1) {
    const cap = Math.max(S * 0.5, 0) + 15
    const raw = Math.round((R_adj * w_r + S * w_s) * 10) / 10
    const scorCombinat = Math.max(0, Math.min(99.4, Math.min(cap, raw)))
    return {
      scorCombinat,
      probabilitateRoberta: Math.round(R_adj * 10) / 10,
      scorStructura: S,
      greutateRoberta: w_r,
      greutateHeuristic: w_s,
      scutArtisticActiv: scutArtistic,
      scutEnciclopedicActiv: scutEnciclopedic,
    }
  }

  let scorCombinat = Math.round((R_adj * w_r + S * w_s) * 10) / 10
  scorCombinat = Math.max(0, Math.min(99.4, scorCombinat))

  if (limba === "en" && R >= 80) {
    scorCombinat = Math.min(99.4, Math.max(scorCombinat, Math.min(R, 92)))
  }

  return {
    scorCombinat,
    probabilitateRoberta: Math.round(R_adj * 10) / 10,
    scorStructura: S,
    greutateRoberta: w_r,
    greutateHeuristic: w_s,
    scutArtisticActiv: scutArtistic,
    scutEnciclopedicActiv: scutEnciclopedic,
  }
}

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

  const S = calculeazaScorStructura(burst, amprente, numarCuvinte, text)
  const fuziune = ensembleFusion(
    probabilitate_roberta_bruta,
    S,
    burst,
    amprente,
    densitate_amprente,
    numarCuvinte,
    limbaDetectata,
  )

  return {
    scor_combinat_ai: fuziune.scorCombinat,
    probabilitate_roberta_bruta,
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
    scor_perplexitate: null,
    perplexitate_medie: null,
    perplexitate_stddev: null,
    source: "typescript_fallback",
  }
}

export const analizeazaTextCompletAgnostic = analizeazaTextComplet
export const analizeazaTextCompletFinetuned = analizeazaTextComplet

export function mergePythonResult(
  raw: Record<string, unknown>,
): HybridAiResult {
  const scor = Number(raw.scor_combinat_ai)
  const scorPerp = raw.scor_perplexitate != null ? Number(raw.scor_perplexitate) : null
  const perpMedie = raw.perplexitate_medie != null ? Number(raw.perplexitate_medie) : null
  const perpStddev = raw.perplexitate_stddev != null ? Number(raw.perplexitate_stddev) : null
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
    scor_perplexitate: Number.isFinite(scorPerp as number) ? scorPerp : null,
    perplexitate_medie: Number.isFinite(perpMedie as number) ? perpMedie : null,
    perplexitate_stddev: Number.isFinite(perpStddev as number) ? perpStddev : null,
    source: "python",
    error: raw.error != null ? String(raw.error) : undefined,
  }
}
