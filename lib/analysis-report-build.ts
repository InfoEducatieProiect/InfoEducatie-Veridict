import "server-only"

import type { HistoricBaseline } from "./assignment-store"
import {
  analizeaza_clasa_avansat,
  computeFullScore,
  computePairwiseCosinePercentages,
  generateShingles,
  type CazSuspect,
} from "./analysisEngine"
import { runHybridAiBatch } from "./hybrid-ai-python"
import type { StudentBaseline } from "@/lib/supabase/queries"
import type { AnalysisReport, StudentScore, SubmissionInput } from "./analysis-report"

function baselineFromRow(row: StudentBaseline | undefined): HistoricBaseline | null {
  if (!row || row.ttr == null || row.asl == null || row.verbs == null || row.adjs == null || row.punct == null) {
    return null
  }
  return {
    ttr: row.ttr,
    asl: row.asl,
    verbs: row.verbs,
    adjs: row.adjs,
    punct: row.punct,
  }
}

function buildPeersByStudentFromEdges(
  edgesGte50: { sid1: string; sid2: string; pct: number }[],
): Record<string, { peerId: string; pct: number }[]> {
  const out: Record<string, { peerId: string; pct: number }[]> = {}
  for (const e of edgesGte50) {
    if (!out[e.sid1]) out[e.sid1] = []
    if (!out[e.sid2]) out[e.sid2] = []
    out[e.sid1].push({ peerId: e.sid2, pct: e.pct })
    out[e.sid2].push({ peerId: e.sid1, pct: e.pct })
  }
  return out
}

function buildGraphEdges(
  edgesGte50: { sid1: string; sid2: string; pct: number }[],
  idToName: Map<string, string>,
): { a: string; b: string; sim: number }[] {
  const seen = new Set<string>()
  const listed: { a: string; b: string; sim: number }[] = []
  for (const e of edgesGte50) {
    const na = idToName.get(e.sid1) ?? e.sid1
    const nb = idToName.get(e.sid2) ?? e.sid2
    const [a, b] = na <= nb ? [na, nb] : [nb, na]
    const key = `${a}\0${b}`
    if (seen.has(key)) continue
    seen.add(key)
    listed.push({ a, b, sim: e.pct })
  }
  return listed
}

/** Hybrid AI + peer/stylometric report (server-only, before INSERT). */
export async function buildAnalysisReport(
  assignmentId: string,
  submissions: SubmissionInput[],
  baselinesByStudentId: Record<string, StudentBaseline>,
): Promise<AnalysisReport> {
  const hybridBySubmissionId = await runHybridAiBatch(
    submissions.map((s) => ({ id: s.id, text: s.text ?? "" })),
  )

  const bazaByStudentId: Record<string, string> = {}
  for (const sub of submissions) {
    const t = (sub.text ?? "").trim()
    if (t) bazaByStudentId[sub.studentId] = t
  }

  const cazuri: CazSuspect[] = analizeaza_clasa_avansat(bazaByStudentId, 0.45)
  const { maxByStudent, edgesGte50 } = computePairwiseCosinePercentages(bazaByStudentId)
  const peersByStudent = buildPeersByStudentFromEdges(edgesGte50)

  const idToName = new Map(submissions.map((s) => [s.studentId, s.studentName]))

  const graphNodes: string[] = []
  const nameSeen = new Set<string>()
  for (const s of submissions) {
    if (!nameSeen.has(s.studentName)) {
      nameSeen.add(s.studentName)
      graphNodes.push(s.studentName)
    }
  }

  const graphEdges = buildGraphEdges(edgesGte50, idToName)

  const allTexts = submissions.map((s) => ({
    name: s.studentName,
    text: s.text ?? "",
    shingles: generateShingles(s.text ?? ""),
  }))

  const scores: Record<string, StudentScore> = {}

  for (const sub of submissions) {
    const dbBaseline = baselineFromRow(baselinesByStudentId[sub.studentId])
    const plist = [...(peersByStudent[sub.studentId] ?? [])].sort((x, y) => y.pct - x.pct)
    const topPeersForUi = plist.slice(0, 4).map((p) => ({
      name: idToName.get(p.peerId) ?? "?",
      similarity: p.pct,
    }))

    const hybrid = hybridBySubmissionId[sub.id]
    const computed = computeFullScore(sub.studentName, sub.text ?? "", allTexts, {
      dbBaseline,
      engineSimilarityPct: maxByStudent[sub.studentId] ?? 0,
      enginePeerMatches: topPeersForUi,
      hybridAiScore: hybrid?.scor_combinat_ai,
    })

    scores[sub.studentName] = {
      aiScore: computed.aiScore,
      similarity: computed.similarity,
      stilometric:
        computed.stilometric === "Abatere Stilistică"
          ? "Abatere Stilistica"
          : "Stil Consistent",
      lexicalDiversity: computed.lexicalDiversity,
      avgSentenceLength: computed.avgSentenceLength,
      verbDensity: computed.verbDensity,
      adjectiveDensity: computed.adjectiveDensity,
      punctuationUsage: computed.punctuationUsage,
      historicLexicalDiversity: computed.historicLexicalDiversity,
      historicAvgSentenceLength: computed.historicAvgSentenceLength,
      historicVerbDensity: computed.historicVerbDensity,
      historicAdjectiveDensity: computed.historicAdjectiveDensity,
      historicPunctuationUsage: computed.historicPunctuationUsage,
      peerMatches: topPeersForUi,
    }
  }

  return {
    assignmentId,
    ranAt: new Date().toISOString(),
    scores,
    graphEdges,
    graphNodes,
  }
}
