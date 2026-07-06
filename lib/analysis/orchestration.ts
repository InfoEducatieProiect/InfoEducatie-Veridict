import type { HistoricBaseline } from "../types/db-types"
import type { StudentScore } from "../types/academic-types"
import {
  generateShingles,
  calculateJaccard,
  calculateCosineSimilarity,
  peerSimilarityFromCazuri,
  type CazSuspect,
} from "./similarity"
import { computeStylometricVector, calculateManhattanDeviation } from "./stylometry"
import { estimateAiScore, resolveHistoricProfile } from "./ai-heuristics"

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
    engineSimilarityPct?: number
    enginePeerMatches?: { name: string; similarity: number }[]
    hybridAiScore?: number
  }
): ComputedStudentScore {
  const myShingles = generateShingles(text)
  const currentVec = computeStylometricVector(text)
  const historicVec = resolveHistoricProfile(studentName, options?.dbBaseline)
  const aiScore =
    options?.hybridAiScore != null && Number.isFinite(options.hybridAiScore)
      ? Math.max(0, Math.min(99.4, Math.round(options.hybridAiScore * 10) / 10))
      : estimateAiScore(text, currentVec)
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
