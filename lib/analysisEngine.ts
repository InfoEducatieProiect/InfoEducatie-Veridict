// ─── Veridict Analysis Engine ─────────────────────────────────────────────────
// Pure TypeScript implementations of the forensic text-analysis algorithms.
// No external NLP dependency — all metrics are derived directly from the string.

import type { StudentScore, HistoricBaseline } from "./assignment-store"

// ─── SECTION 2: COMPUTATIONAL LINGUISTICS ENGINE ─────────────────────────────
// Exact implementations as specified, using Romanian-aware character matching.

/**
 * Sanitizes and tokenizes text into an array of Romanian word characters.
 * Matches [a-z] plus Romanian diacritics: ă â î ș ț (and their uppercase forms).
 */
export function curata_si_sparge(text: string): string[] {
  return text.toLowerCase().match(/\b[a-zăâîșț_]+\b/g) || []
}

/**
 * Generates a Set of WORD-level k-grams (k=1 = individual words by default).
 * k=1 produces the highest recall for paraphrased idea detection, as specified
 * in the architectural directive (Section 3, Bug Fix): word-level n-grams instead
 * of character shingles to resolve the "high vocabulary similarity but 0 highlighted
 * phrases" discrepancy.
 */
export function genereaza_shingles_cuvinte(text: string, k: number = 1): Set<string> {
  const cuvinte = curata_si_sparge(text)
  const shingles = new Set<string>()
  if (cuvinte.length < k) return shingles
  for (let i = 0; i <= cuvinte.length - k; i++) {
    shingles.add(cuvinte.slice(i, i + k).join(" "))
  }
  return shingles
}

/**
 * @deprecated Use genereaza_shingles_cuvinte for phrase detection.
 * Kept for backward compat with analizeaza_clasa_avansat Cosine engine.
 * Generates a Set of character-level k-grams from concatenated token stream.
 */
export function genereaza_shingles(text: string, k = 4): Set<string> {
  const text_curat = curata_si_sparge(text).join("")
  const shingles = new Set<string>()
  if (text_curat.length < k) return shingles
  for (let i = 0; i <= text_curat.length - k; i++) {
    shingles.add(text_curat.substring(i, i + k))
  }
  return shingles
}

/**
 * Jaccard similarity between two shingle sets, returns a value in [0, 1].
 */
export function calculeaza_jaccard(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0
  const intersectie = new Set([...set1].filter((x) => set2.has(x)))
  const uniune = new Set([...set1, ...set2])
  return intersectie.size / uniune.size
}

/**
 * Splits text into sentences, filters out short fragments.
 */
export function extrage_propozitii(text: string): string[] {
  return text.split(/[.!?;\n]+/).map((p) => p.trim()).filter((p) => p.length > 15)
}

/**
 * Identifică fraze din text1 cu structură similară ideatic cu bucăți din text2
 * (Jaccard pe shingles de caractere k=4). Prag implicit 0.25 — aliniat cu motorul Python.
 */
export function gaseste_fraze_similare_ideatic(
  text1: string,
  text2: string,
  prag_fraza = 0.25
): string[] {
  const propozitii_t2 = extrage_propozitii(text2)
  const shingles_t2 = propozitii_t2.map((p) => genereaza_shingles(p))

  const fraze_suspecte: string[] = []
  for (const p1 of extrage_propozitii(text1)) {
    const s1 = genereaza_shingles(p1)
    if (s1.size === 0) continue
    for (const s2 of shingles_t2) {
      if (calculeaza_jaccard(s1, s2) >= prag_fraza) {
        fraze_suspecte.push(p1)
        break
      }
    }
  }
  return fraze_suspecte
}

// ─── SECTION 1: HYBRID COGNITIVE SIMILARITY ENGINE ──────────────────────────
// Production-grade implementation combining Cosine Vector Similarity with
// Jaccard Sentence Shingling for accurate plagiarism detection.

/** Rezultat pereche suspectă — aliniat cu motorul Python (nume elev, scor 0–1). */
export interface CazSuspect {
  elev1: string
  elev2: string
  scor: number
  fraze_elev1: string[]
  fraze_elev2: string[]
}

/**
 * Motor hibrid Cosinus + Jaccard pe fraze (parafrază).
 * `baza_date_elevi`: map nume elev → text lucrare.
 * `prag_suspect`: prag cosinus global (implicit 0.45).
 */
export function analizeaza_clasa_avansat(
  baza_date_elevi: Record<string, string>,
  prag_suspect = 0.45
): CazSuspect[] {
  const texte_tokenizate: Record<string, string[]> = {}
  for (const [nume, text] of Object.entries(baza_date_elevi)) {
    texte_tokenizate[nume] = curata_si_sparge(text)
  }

  const vocabular_global = [
    ...new Set(Object.values(texte_tokenizate).flatMap((words) => words)),
  ]

  const profile_elevi: Record<string, { vector: number[]; norma: number }> = {}
  for (const [nume, cuvinte] of Object.entries(texte_tokenizate)) {
    const vector = vocabular_global.map((cuvant) => cuvinte.filter((w) => w === cuvant).length)
    const norma = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    profile_elevi[nume] = { vector, norma }
  }

  const cazuri_suspecte: CazSuspect[] = []
  const nume_elevi = Object.keys(baza_date_elevi)

  for (let i = 0; i < nume_elevi.length; i++) {
    for (let j = i + 1; j < nume_elevi.length; j++) {
      const nume1 = nume_elevi[i]
      const nume2 = nume_elevi[j]
      const p1 = profile_elevi[nume1]
      const p2 = profile_elevi[nume2]

      if (!p1 || !p2 || p1.norma === 0 || p2.norma === 0) continue

      let produs_scalar = 0
      for (let k = 0; k < vocabular_global.length; k++) {
        produs_scalar += p1.vector[k] * p2.vector[k]
      }
      const scor = produs_scalar / (p1.norma * p2.norma)

      const fraze_elev1 = gaseste_fraze_similare_ideatic(
        baza_date_elevi[nume1],
        baza_date_elevi[nume2]
      )
      const fraze_elev2 = gaseste_fraze_similare_ideatic(
        baza_date_elevi[nume2],
        baza_date_elevi[nume1]
      )

      if (scor >= prag_suspect || (fraze_elev1.length > 0 && fraze_elev2.length > 0)) {
        cazuri_suspecte.push({
          elev1: nume1,
          elev2: nume2,
          scor,
          fraze_elev1,
          fraze_elev2,
        })
      }
    }
  }

  cazuri_suspecte.sort((a, b) => b.scor - a.scor)
  return cazuri_suspecte
}

/**
 * Profiles TF vectors + norms for cosine similarity (same math as analizeaza_clasa_avansat).
 * Keys of `studentTexts` must be stable identifiers (e.g. UUID `student_id`).
 */
export function buildCosineProfilesForStudents(studentTexts: Record<string, string>): {
  ids: string[]
  vocabular_global: string[]
  profile_elevi: Record<string, { vector: number[]; norma: number }>
} {
  const texte_tokenizate: Record<string, string[]> = {}
  for (const [id, text] of Object.entries(studentTexts)) {
    const t = (text ?? "").trim()
    if (!t) continue
    texte_tokenizate[id] = curata_si_sparge(text)
  }
  const ids = Object.keys(texte_tokenizate)
  const vocabular_global = [
    ...new Set(Object.values(texte_tokenizate).flatMap((words) => words)),
  ]
  const profile_elevi: Record<string, { vector: number[]; norma: number }> = {}
  for (const id of ids) {
    const cuvinte = texte_tokenizate[id]
    const vector = vocabular_global.map((cuvant) => cuvinte.filter((w) => w === cuvant).length)
    const norma = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    profile_elevi[id] = { vector, norma }
  }
  return { ids, vocabular_global, profile_elevi }
}

/**
 * Pentru fiecare elev: similaritate maximă cosinus ×100 vs orice alt elev.
 * Muchii cosinus ≥50% între ID-uri — folosit la `peer_matches` și graful UI.
 */
export function computePairwiseCosinePercentages(studentTexts: Record<string, string>): {
  maxByStudent: Record<string, number>
  edgesGte50: { sid1: string; sid2: string; pct: number }[]
} {
  const { ids, vocabular_global, profile_elevi } = buildCosineProfilesForStudents(studentTexts)
  const maxByStudent: Record<string, number> = {}
  for (const id of ids) maxByStudent[id] = 0

  const edgesGte50: { sid1: string; sid2: string; pct: number }[] = []

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i]
      const id2 = ids[j]
      const p1 = profile_elevi[id1]
      const p2 = profile_elevi[id2]
      if (!p1 || !p2 || p1.norma === 0 || p2.norma === 0) continue

      let produs_scalar = 0
      for (let k = 0; k < vocabular_global.length; k++) {
        produs_scalar += p1.vector[k] * p2.vector[k]
      }
      const scor = produs_scalar / (p1.norma * p2.norma)
      const pct = Math.round(scor * 100)
      maxByStudent[id1] = Math.max(maxByStudent[id1] ?? 0, pct)
      maxByStudent[id2] = Math.max(maxByStudent[id2] ?? 0, pct)
      if (pct >= 50) edgesGte50.push({ sid1: id1, sid2: id2, pct })
    }
  }

  edgesGte50.sort((a, b) => b.pct - a.pct)
  return { maxByStudent, edgesGte50 }
}

/** Fraze pentru perechea ordonată (from → peer), din obiectul `CazSuspect`. */
export function directedPhrasesFromCaz(caz: CazSuspect, fromStudentKey: string): {
  fraze_elev1: string[]
  fraze_elev2: string[]
} {
  if (caz.elev1 === fromStudentKey) {
    return { fraze_elev1: caz.fraze_elev1, fraze_elev2: caz.fraze_elev2 }
  }
  if (caz.elev2 === fromStudentKey) {
    return { fraze_elev1: caz.fraze_elev2, fraze_elev2: caz.fraze_elev1 }
  }
  return { fraze_elev1: [], fraze_elev2: [] }
}

export function findCazForUnorderedPair(
  cazuri: CazSuspect[],
  id1: string,
  id2: string
): CazSuspect | undefined {
  return cazuri.find(
    (c) =>
      (c.elev1 === id1 && c.elev2 === id2) || (c.elev1 === id2 && c.elev2 === id1),
  )
}

/** Derivește similaritatea per elev și peerMatches din cazurile clasei. */
export function peerSimilarityFromCazuri(
  studentName: string,
  cazuri: CazSuspect[]
): { similarity: number; peerMatches: { name: string; similarity: number }[] } {
  const peerMatches: { name: string; similarity: number }[] = []

  for (const caz of cazuri) {
    if (caz.elev1 === studentName) {
      peerMatches.push({ name: caz.elev2, similarity: Math.round(caz.scor * 100) })
    } else if (caz.elev2 === studentName) {
      peerMatches.push({ name: caz.elev1, similarity: Math.round(caz.scor * 100) })
    }
  }

  peerMatches.sort((a, b) => b.similarity - a.similarity)
  const topPeers = peerMatches.slice(0, 4)
  return {
    similarity: topPeers.length > 0 ? topPeers[0].similarity : 0,
    peerMatches: topPeers,
  }
}

// ─── 1. Shingle-based Jaccard Similarity ─────────────────────────────────────

/** Split text into overlapping k-grams of words (shingles). */
export function generateShingles(text: string, k = 4): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\săîâțș]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
  const shingles = new Set<string>()
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(" "))
  }
  return shingles
}

/** Jaccard similarity between two shingle sets, returned as 0-100. */
export function calculateJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const s of a) if (b.has(s)) intersection++
  const union = a.size + b.size - intersection
  return Math.round((intersection / union) * 100)
}

/** Return the shingles that appear in both texts (used for highlighting). */
export function getMatchingShingles(a: Set<string>, b: Set<string>): Set<string> {
  const common = new Set<string>()
  for (const s of a) if (b.has(s)) common.add(s)
  return common
}

// ─── 2. Cosine Similarity (TF word vectors) ──────────────────────────────────

function buildWordVector(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\săîâțș]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
  return freq
}

/** Cosine similarity between two texts, returned as 0-100. */
export function calculateCosineSimilarity(text1: string, text2: string): number {
  const v1 = buildWordVector(text1)
  const v2 = buildWordVector(text2)
  let dot = 0
  let mag1 = 0
  let mag2 = 0
  for (const [w, c] of v1) {
    dot += c * (v2.get(w) ?? 0)
    mag1 += c * c
  }
  for (const c of v2.values()) mag2 += c * c
  if (mag1 === 0 || mag2 === 0) return 0
  return Math.round((dot / (Math.sqrt(mag1) * Math.sqrt(mag2))) * 100)
}

// ─── 3. Stylometric Vector ───────────────────────────────────────────────────

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

// Romanian verb suffixes (simplified POS approximation)
const VERB_SUFFIXES = ["ează", "esc", "ești", "ește", "ăm", "ați", "ează",
  "ind", "ând", "at", "it", "ut", "ea", "ia", "e", "a"]

// Romanian adjective / qualifier suffixes
const ADJ_SUFFIXES = ["ică", "ică", "esc", "al", "ală", "ar", "ară",
  "os", "oasă", "iu", "ie", "iv", "ivă", "ent", "entă"]

function endsWith(word: string, suffixes: string[]): boolean {
  return suffixes.some((s) => word.endsWith(s))
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
      ? sentences.reduce((s, sent) => s + sent.trim().split(/\s+/).length, 0) /
        sentences.length
      : 10
  // Normalise: 5 words/sentence → 20, 30 words/sentence → 100
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

// ─── 4. Manhattan Distance (deviation %) ─────────────────────────────────────

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

// ─── 5. AI-score heuristic ───────────────────────────────────────────────────

/**
 * Heuristic AI-probability score based on:
 * - very high TTR (AI uses varied vocabulary)
 * - very long average sentences
 * - very low punctuation density
 * - presence of academic meta-discourse markers
 */
export function estimateAiScore(text: string, vec: StylometricVector): number {
  const AI_MARKERS = [
    "în concluzie", "de asemenea", "în acest sens", "este important să",
    "se poate observa", "din perspectivă", "structural-arhetipală",
    "valențe cosmogonice", "rezonanță metafizică", "stratificarea axiologică",
    "transcende", "vectorilor de semnificație",
  ]
  const lower = text.toLowerCase()
  const markerHits = AI_MARKERS.filter((m) => lower.includes(m)).length

  let score = 0
  // High vocabulary diversity (>85 TTR) → signal
  if (vec.lexicalDiversity > 85) score += 25
  else if (vec.lexicalDiversity > 75) score += 12
  // Very long sentences
  if (vec.avgSentenceLength > 80) score += 25
  else if (vec.avgSentenceLength > 60) score += 12
  // AI tends to use fewer contractions / punctuation
  if (vec.punctuationUsage < 20) score += 15
  // AI marker phrases
  score += Math.min(35, markerHits * 12)

  return Math.min(98, score)
}

// ─── 6. Historic profile baseline ────────────────────────────────────────────

/** Convertește baseline din `student_baselines` la scala 0–100 a graficului. */
export function historicVectorFromBaseline(baseline: HistoricBaseline): StylometricVector {
  return {
    lexicalDiversity: Math.min(100, Math.round(baseline.ttr * 1.1)),
    avgSentenceLength: Math.min(100, Math.max(0, Math.round(((baseline.asl - 5) / 25) * 100))),
    verbDensity: Math.min(100, Math.round(baseline.verbs * 2.5)),
    adjectiveDensity: Math.min(100, Math.round(baseline.adjs * 4)),
    punctuationUsage: Math.min(100, Math.round(baseline.punct * 3.5)),
  }
}

/**
 * Profil istoric: baseline din DB dacă există, altfel profil sintetic determinist din nume.
 */
export function resolveHistoricProfile(
  studentName: string,
  dbBaseline?: HistoricBaseline | null
): StylometricVector {
  if (dbBaseline) {
    return historicVectorFromBaseline(dbBaseline)
  }
  return syntheticHistoricProfile(studentName)
}

/** Profil sintetic determinist (fără mock-uri locale) când lipsește baseline în DB. */
export function syntheticHistoricProfile(studentName: string): StylometricVector {
  // Fallback: Seed a simple hash from the name for determinism
  let h = 0
  for (let i = 0; i < studentName.length; i++) h = (h * 31 + studentName.charCodeAt(i)) >>> 0
  const jitter = (base: number, range: number) => Math.min(100, Math.max(10,
    base + ((h >> (base % 8)) % range) - Math.floor(range / 2)
  ))
  // Typical high-school student baseline: moderate TTR, medium sentences, mixed density
  return {
    lexicalDiversity: jitter(58, 12),
    avgSentenceLength: jitter(42, 14),
    verbDensity: jitter(48, 10),
    adjectiveDensity: jitter(44, 10),
    punctuationUsage: jitter(46, 12),
  }
}

// ─── 7. Full per-student score computation ───────────────────────────────────

export interface ComputedStudentScore extends StudentScore {
  shingles: Set<string>
}

export function computeFullScore(
  studentName: string,
  text: string,
  allTexts: { name: string; text: string; shingles: Set<string> }[],
  options?: {
    cazuriSimilaritate?: CazSuspect[]
    dbBaseline?: HistoricBaseline | null
    /** Când sunt setate, înlocuiesc similaritatea din cazuri (cosinus maxim / peer-uri ≥50%). */
    engineSimilarityPct?: number
    enginePeerMatches?: { name: string; similarity: number }[]
  }
): ComputedStudentScore {
  const myShingles = generateShingles(text)
  const currentVec = computeStylometricVector(text)
  const historicVec = resolveHistoricProfile(studentName, options?.dbBaseline)
  const aiScore = estimateAiScore(text, currentVec)
  const manhattanDev = calculateManhattanDeviation(currentVec, historicVec)
  const stilometric: StudentScore["stilometric"] =
    manhattanDev > 40 ? "Abatere Stilistică" : "Stil Consistent"

  let similarity: number
  let peerMatches: { name: string; similarity: number }[]
  if (
    options?.enginePeerMatches != null &&
    options?.engineSimilarityPct != null
  ) {
    similarity = options.engineSimilarityPct
    peerMatches = [...options.enginePeerMatches]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4)
  } else if (options?.cazuriSimilaritate) {
    const r = peerSimilarityFromCazuri(studentName, options.cazuriSimilaritate)
    similarity = r.similarity
    peerMatches = r.peerMatches
  } else {
    const matches: { name: string; similarity: number }[] = []
    for (const other of allTexts) {
      if (other.name === studentName) continue
      const cosine = calculateCosineSimilarity(text, other.text)
      const jaccard = calculateJaccard(myShingles, other.shingles)
      const sim = Math.max(cosine, jaccard)
      if (sim >= 25) matches.push({ name: other.name, similarity: sim })
    }
    matches.sort((a, b) => b.similarity - a.similarity)
    const topPeers = matches.slice(0, 4)
    similarity = topPeers.length > 0 ? topPeers[0].similarity : 0
    peerMatches = topPeers
  }

  return {
    aiScore,
    similarity,
    stilometric,
    lexicalDiversity: currentVec.lexicalDiversity,
    avgSentenceLength: currentVec.avgSentenceLength,
    verbDensity: currentVec.verbDensity,
    adjectiveDensity: currentVec.adjectiveDensity,
    punctuationUsage: currentVec.punctuationUsage,
    historicLexicalDiversity: historicVec.lexicalDiversity,
    historicAvgSentenceLength: historicVec.avgSentenceLength,
    historicVerbDensity: historicVec.verbDensity,
    historicAdjectiveDensity: historicVec.adjectiveDensity,
    historicPunctuationUsage: historicVec.punctuationUsage,
    peerMatches,
    shingles: myShingles,
  }
}

// ─── 8. Adaptive sentence-level similar phrase finder ────────────────────────

/**
 * Implements the adaptive-threshold algorithm described in the spec:
 *
 * Step 1 — Compute the global Cosine Similarity between the two documents.
 * Step 2 — If globalCosine >= 50 → strict mode: sentence Jaccard threshold = 0.25
 *          If globalCosine is 30–49 → DYNAMIC FALLBACK:
 *            a) Lower sentence Jaccard threshold to 0.12 (catches restructured phrases)
 *            b) Use a sliding-window content-word overlap algorithm as a secondary signal
 *          Below 30 → no highlighting needed (caller may still call, returns empty)
 *
 * This ensures that yellow edges (30–50% global cosine / paraphrased) produce
 * visible highlights just like red/orange edges do.
 *
 * @param text1   The reference text (Panel A)
 * @param text2   The comparison text (Panel B)
 * @param globalCosine  Pre-computed global cosine similarity (0–100). If omitted,
 *                      it is computed internally from the two texts.
 */
export function getSimilarPhrases(
  text1: string,
  text2: string,
  globalCosine?: number
): string[] {
  // Step 1 — compute global cosine if not provided
  const cosine = globalCosine ?? calculateCosineSimilarity(text1, text2)

  // Step 2 — choose operating mode
  const strictMode = cosine >= 50
  const dynamicMode = cosine >= 30 && cosine < 50

  // Below 30% → no sentences will be flagged
  if (!strictMode && !dynamicMode) return []

  const jaccardThreshold = strictMode ? 0.25 : 0.12
  const wordOverlapThreshold = strictMode ? 0.50 : 0.35

  // ── Helpers ─────────────���────────────────────────────────────────────────────

  const splitSentences = (t: string): string[] =>
    t.split(/[.!?;\n]+/).map((s) => s.trim()).filter((s) => s.length > 12)

  /** Character-level trigrams (k=3) — more sensitive than 4-grams for paraphrasing */
  const charShingles = (s: string): Set<string> => {
    const clean = s
      .toLowerCase()
      .replace(/[^a-z\u0103\u00e2\u00ee\u015f\u0163 ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
    const out = new Set<string>()
    for (let i = 0; i <= clean.length - 3; i++) out.add(clean.slice(i, i + 3))
    return out
  }

  const jaccardChar = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0
    let inter = 0
    for (const s of a) if (b.has(s)) inter++
    return inter / (a.size + b.size - inter)
  }

  /**
   * Content-word overlap: counts content words (len > 3) shared between two
   * sentences, divided by the shorter set length.
   * This is the "sliding-window word-match" fallback for paraphrased yellow pairs.
   */
  const contentWordOverlap = (s1: string, s2: string): number => {
    const contentWords = (s: string) =>
      new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
    const w1 = contentWords(s1)
    const w2 = contentWords(s2)
    if (w1.size === 0 || w2.size === 0) return 0
    let inter = 0
    for (const w of w1) if (w2.has(w)) inter++
    return inter / Math.min(w1.size, w2.size)
  }

  /**
   * Bigram-level key-phrase overlap (dynamic mode only):
   * Detects shared 2-word phrases which survive heavy paraphrasing.
   */
  const bigramOverlap = (s1: string, s2: string): number => {
    const bigrams = (s: string): Set<string> => {
      const words = s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean)
      const bg = new Set<string>()
      for (let i = 0; i < words.length - 1; i++) bg.add(`${words[i]} ${words[i + 1]}`)
      return bg
    }
    const b1 = bigrams(s1)
    const b2 = bigrams(s2)
    if (b1.size === 0 || b2.size === 0) return 0
    let inter = 0
    for (const b of b1) if (b2.has(b)) inter++
    return inter / Math.min(b1.size, b2.size)
  }

  // ── Main detection loop ────────────────────���──────────────────────────────

  const sentsT2 = splitSentences(text2)
  const shinglesT2 = sentsT2.map(charShingles)
  const suspicious: string[] = []

  for (const s1 of splitSentences(text1)) {
    const sh1 = charShingles(s1)
    if (sh1.size === 0) continue

    let matched = false
    for (let i = 0; i < sentsT2.length; i++) {
      const jScore = jaccardChar(sh1, shinglesT2[i])

      if (jScore >= jaccardThreshold) {
        matched = true
        break
      }

      // Dynamic fallback: use word-overlap + bigram signals for yellow pairs
      if (dynamicMode) {
        const wScore = contentWordOverlap(s1, sentsT2[i])
        const bScore = bigramOverlap(s1, sentsT2[i])
        if (wScore >= wordOverlapThreshold || bScore >= 0.20) {
          matched = true
          break
        }
      }
    }

    if (matched) suspicious.push(s1)
  }

  return suspicious
}

/**
 * Given a list of suspicious sentence strings, locate their character-level
 * [{start, end, severity}] spans within the full text for highlighting.
 *
 * severity "yellow" → paraphrased (30–50% global cosine)
 * severity "orange" → similar (50–65%)
 * severity "red"    → near-identical (>65%)
 */
export function spansFromSentences(
  text: string,
  sentences: string[],
  severity: "yellow" | "orange" | "red"
): { start: number; end: number; severity: "yellow" | "orange" | "red" }[] {
  const spans: { start: number; end: number; severity: "yellow" | "orange" | "red" }[] = []
  for (const sent of sentences) {
    if (sent.length < 5) continue
    const escaped = sent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      const regex = new RegExp(escaped, "i")
      const m = regex.exec(text)
      if (m) spans.push({ start: m.index, end: m.index + m[0].length, severity })
    } catch {
      // Skip sentences with regex-breaking characters
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

// ─── 10. Shingle-based segment locator (fallback) ────────────────────────────

/**
 * Given a text and a set of matching shingles, return character-level
 * [{start, end, severity}] spans for highlighting.
 */
export function locateMatchingSpans(
  text: string,
  matchingShingles: Set<string>,
  severity: "yellow" | "orange" | "red"
): { start: number; end: number; severity: "yellow" | "orange" | "red" }[] {
  if (matchingShingles.size === 0) return []

  const lower = text.toLowerCase().replace(/[^\w\săîâțș]/gi, " ")
  const spans: { start: number; end: number; severity: "yellow" | "orange" | "red" }[] = []

  for (const shingle of matchingShingles) {
    // Find the shingle words as a subsequence in the original text
    const shingleWords = shingle.split(" ")
    const pattern = shingleWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")
    const regex = new RegExp(pattern, "gi")
    let m: RegExpExecArray | null
    while ((m = regex.exec(lower)) !== null) {
      const start = m.index
      const end = start + m[0].length
      // Merge overlapping spans
      const existing = spans.find((s) => s.start <= end && s.end >= start)
      if (existing) {
        existing.start = Math.min(existing.start, start)
        existing.end = Math.max(existing.end, end)
      } else {
        spans.push({ start, end, severity })
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}
