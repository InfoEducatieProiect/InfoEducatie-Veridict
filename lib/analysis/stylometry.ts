export interface StylometricVector {
  /** Type-Token Ratio ×100 — lexical diversity */
  lexicalDiversity: number
  /** Normalised average sentence length (clamped to 0-100) */
  avgSentenceLength: number
  /** Estimated verb density (words ending in Romanian verb suffixes) */
  verbDensity: number
  /** Estimated adjective density */
  adjectiveDensity: number
  /** Punctuation marks per 100 words */
  punctuationUsage: number
}

const VERB_SUFFIXES = ["ează", "esc", "ești", "ește", "ăm", "ați", "ează",
  "ind", "ând", "at", "it", "ut", "ea", "ia", "e", "a"]

const ADJ_SUFFIXES = ["ică", "ică", "esc", "al", "ală", "ar", "ară",
  "os", "oasă", "iu", "ie", "iv", "ivă", "ent", "entă"]

function endsWith(word: string, suffixes: string[]): boolean {
  return suffixes.some((s) => word.endsWith(s))
}

/**
 * Raw spaCy-scale percentages for DB storage (NOT 0–100 chart-normalized).
 * Matches scripts/analiza_stilometrie.py semantics.
 */
export function computeRawStylometricPercentages(text: string): {
  ttr: number
  asl: number
  verbs: number
  adjs: number
  punct: number
} {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 4)
  const words = text
    .toLowerCase()
    .replace(/[^\w\săîâțș]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)

  const totalWords = words.length || 1
  const uniqueWords = new Set(words).size
  const punctCount = (text.match(/[.,;:!?()„"–—-]/g) ?? []).length

  const ttr = Math.round((uniqueWords / totalWords) * 1000) / 10
  const asl =
    sentences.length > 0
      ? Math.round((words.length / sentences.length) * 10) / 10
      : 0
  const verbCount = words.filter((w) => endsWith(w, VERB_SUFFIXES)).length
  const adjCount = words.filter((w) => endsWith(w, ADJ_SUFFIXES)).length
  const verbs = Math.round((verbCount / totalWords) * 1000) / 10
  const adjs = Math.round((adjCount / totalWords) * 1000) / 10
  const punct = Math.round((punctCount / totalWords) * 1000) / 10

  return { ttr, asl, verbs, adjs, punct }
}

export function computeStylometricVector(text: string): StylometricVector {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 4)
  const words = text
    .toLowerCase()
    .replace(/[^\w\săîâțș]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)

  const totalWords = words.length || 1
  const uniqueWords = new Set(words).size
  const punctCount = (text.match(/[.,;:!?()„"–—-]/g) ?? []).length

  const ttr = Math.round((uniqueWords / totalWords) * 100)

  const avgLen =
    sentences.length > 0
      ? sentences.reduce((s, sent) => s + sent.trim().split(/\s+/).length, 0) / sentences.length
      : 10
  const normAvgLen = Math.min(100, Math.max(0, Math.round(((avgLen - 5) / 25) * 100)))

  const verbCount = words.filter((w) => endsWith(w, VERB_SUFFIXES)).length
  const adjCount = words.filter((w) => endsWith(w, ADJ_SUFFIXES)).length

  const verbDensity = Math.min(100, Math.round((verbCount / totalWords) * 300))
  const adjDensity = Math.min(100, Math.round((adjCount / totalWords) * 350))
  const punctDensity = Math.min(100, Math.round((punctCount / totalWords) * 200))

  return {
    lexicalDiversity: ttr,
    avgSentenceLength: normAvgLen,
    verbDensity,
    adjectiveDensity: adjDensity,
    punctuationUsage: punctDensity,
  }
}

/**
 * Formula: 1/5 × Σ( |V_c - V_h| / max(V_c, V_h) ) × 100
 * Returns a percentage 0-100.
 */
export function calculateManhattanDeviation(
  current: StylometricVector,
  historic: StylometricVector
): number {
  const keys: (keyof StylometricVector)[] = [
    "lexicalDiversity",
    "avgSentenceLength",
    "verbDensity",
    "adjectiveDensity",
    "punctuationUsage",
  ]
  let sum = 0
  for (const k of keys) {
    const vc = current[k]
    const vh = historic[k]
    const mx = Math.max(vc, vh, 1)
    sum += Math.abs(vc - vh) / mx
  }
  return Math.min(100, Math.round((sum / 5) * 100))
}
