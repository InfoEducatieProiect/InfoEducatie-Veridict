import type { HistoricBaseline } from "../types/db-types"
import type { StylometricVector } from "./stylometry"

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
  if (vec.lexicalDiversity > 85) score += 25
  else if (vec.lexicalDiversity > 75) score += 12
  if (vec.avgSentenceLength > 80) score += 25
  else if (vec.avgSentenceLength > 60) score += 12
  if (vec.punctuationUsage < 20) score += 15
  score += Math.min(35, markerHits * 12)

  return Math.min(98, score)
}

export function historicVectorFromBaseline(baseline: HistoricBaseline): StylometricVector {
  return {
    lexicalDiversity: Math.min(100, Math.round(baseline.ttr * 1.1)),
    avgSentenceLength: Math.min(100, Math.max(0, Math.round(((baseline.asl - 5) / 25) * 100))),
    verbDensity: Math.min(100, Math.round(baseline.verbs * 2.5)),
    adjectiveDensity: Math.min(100, Math.round(baseline.adjs * 4)),
    punctuationUsage: Math.min(100, Math.round(baseline.punct * 3.5)),
  }
}

export function syntheticHistoricProfile(studentName: string): StylometricVector {
  let h = 0
  for (let i = 0; i < studentName.length; i++) h = (h * 31 + studentName.charCodeAt(i)) >>> 0
  const jitter = (base: number, range: number) => Math.min(100, Math.max(10,
    base + ((h >> (base % 8)) % range) - Math.floor(range / 2)
  ))
  return {
    lexicalDiversity: jitter(58, 12),
    avgSentenceLength: jitter(42, 14),
    verbDensity: jitter(48, 10),
    adjectiveDensity: jitter(44, 10),
    punctuationUsage: jitter(46, 12),
  }
}

export function resolveHistoricProfile(
  studentName: string,
  dbBaseline?: HistoricBaseline | null
): StylometricVector {
  if (dbBaseline) {
    return historicVectorFromBaseline(dbBaseline)
  }
  return syntheticHistoricProfile(studentName)
}
