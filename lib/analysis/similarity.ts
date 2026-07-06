import { curata_si_sparge, gaseste_fraze_similare_ideatic } from "./text-utils"

/** Rezultat pereche suspectă — aliniat cu motorul Python. */
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
        cazuri_suspecte.push({ elev1: nume1, elev2: nume2, scor, fraze_elev1, fraze_elev2 })
      }
    }
  }

  cazuri_suspecte.sort((a, b) => b.scor - a.scor)
  return cazuri_suspecte
}

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

/** Split text into overlapping k-grams of words (shingles). Returned as 0-100 scale. */
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

/** Return the shingles that appear in both texts. */
export function getMatchingShingles(a: Set<string>, b: Set<string>): Set<string> {
  const common = new Set<string>()
  for (const s of a) if (b.has(s)) common.add(s)
  return common
}

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
