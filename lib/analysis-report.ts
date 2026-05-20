/**
 * Builds, persists, and loads analysis reports via Supabase.
 * Similarity core: cosine TF–IDF-like vectors + phrase Jaccard (see lib/analysisEngine.ts).
 */

import type { HistoricBaseline } from "./assignment-store"
import {
  analizeaza_clasa_avansat,
  computeFullScore,
  computePairwiseCosinePercentages,
  directedPhrasesFromCaz,
  findCazForUnorderedPair,
  generateShingles,
  calculateManhattanDeviation,
  computeStylometricVector,
  resolveHistoricProfile,
  type CazSuspect,
} from "./analysisEngine"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import {
  createAnalysisRun,
  saveAnalysisScores,
  savePeerMatches,
  updateSubmissionAnalysis,
  getLatestAnalysisRun,
  getAnalysisScoresWithPeers,
  getStudentBaselines,
  type StudentBaseline,
  type AnalysisScore,
  type PeerMatchInsert,
} from "@/lib/supabase/queries"

export interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistica"
  lexicalDiversity: number
  avgSentenceLength: number
  verbDensity: number
  adjectiveDensity: number
  punctuationUsage: number
  historicLexicalDiversity: number
  historicAvgSentenceLength: number
  historicVerbDensity: number
  historicAdjectiveDensity: number
  historicPunctuationUsage: number
  peerMatches: { name: string; similarity: number }[]
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
  /** Dedup unordered edges for Graful global (similarity ≥50%). */
  graphEdges?: { a: string; b: string; sim: number }[]
  graphNodes?: string[]
}

export interface SubmissionInput {
  id: string
  studentId: string
  studentName: string
  text: string
}

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

function stylometricLabel(deviation: number): StudentScore["stilometric"] {
  return deviation > 40 ? "Abatere Stilistica" : "Stil Consistent"
}

function computedToDbStilometric(
  studentName: string,
  text: string,
  dbBaseline: HistoricBaseline | null,
): number {
  const currentVec = computeStylometricVector(text)
  const historicVec = resolveHistoricProfile(studentName, dbBaseline)
  return calculateManhattanDeviation(currentVec, historicVec)
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

/** Motor + structură raport (înainte de INSERT). Execuție pe chei `student_id`. */
export function buildAnalysisReport(
  assignmentId: string,
  submissions: SubmissionInput[],
  baselinesByStudentId: Record<string, StudentBaseline>,
): AnalysisReport {
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

    const computed = computeFullScore(sub.studentName, sub.text ?? "", allTexts, {
      dbBaseline,
      engineSimilarityPct: maxByStudent[sub.studentId] ?? 0,
      enginePeerMatches: topPeersForUi,
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

/**
 * Persist analysis for an assignment using the given Supabase client (browser or server).
 */
export async function persistAnalysisReport(
  supabase: SupabaseClient,
  assignmentId: string,
  submissions: SubmissionInput[],
): Promise<AnalysisReport> {
  const baselinesByStudentId = await getStudentBaselines(supabase)
  const report = buildAnalysisReport(assignmentId, submissions, baselinesByStudentId)

  const run = await createAnalysisRun(assignmentId, supabase)

  const scoreRows = submissions.map((sub) => {
    const sc = report.scores[sub.studentName]
    const dbBaseline = baselineFromRow(baselinesByStudentId[sub.studentId])
    const stilometricDev = computedToDbStilometric(sub.studentName, sub.text ?? "", dbBaseline)

    return {
      analysis_run_id: run.id,
      student_id: sub.studentId,
      submission_id: sub.id,
      ai_score: sc?.aiScore ?? 0,
      similarity: sc?.similarity ?? 0,
      stilometric: stilometricDev,
      stilometric_consistent: stilometricDev <= 40,
      ttr: sc?.lexicalDiversity ?? null,
      asl: sc?.avgSentenceLength ?? null,
      verbs: sc?.verbDensity ?? null,
      adjs: sc?.adjectiveDensity ?? null,
      punct: sc?.punctuationUsage ?? null,
    }
  })

  const insertedScores = await saveAnalysisScores(scoreRows, supabase)

  const bazaByStudentId: Record<string, string> = {}
  for (const sub of submissions) {
    const t = (sub.text ?? "").trim()
    if (t) bazaByStudentId[sub.studentId] = t
  }
  const cazuri: CazSuspect[] = analizeaza_clasa_avansat(bazaByStudentId, 0.45)
  const { edgesGte50 } = computePairwiseCosinePercentages(bazaByStudentId)

  const insertedByStudentId = new Map(
    insertedScores.map((row) => [row.student_id, row]),
  )

  const peerRowsFlat: PeerMatchInsert[] = []

  for (const e of edgesGte50) {
    const insertedA = insertedByStudentId.get(e.sid1)
    const insertedB = insertedByStudentId.get(e.sid2)
    if (!insertedA?.id || !insertedB?.id) continue

    const caz = findCazForUnorderedPair(cazuri, e.sid1, e.sid2)
    const phrasesA =
      caz != null ? directedPhrasesFromCaz(caz, e.sid1) : { fraze_elev1: [], fraze_elev2: [] }
    const phrasesB =
      caz != null ? directedPhrasesFromCaz(caz, e.sid2) : { fraze_elev1: [], fraze_elev2: [] }

    peerRowsFlat.push({
      analysis_score_id: insertedA.id,
      peer_student_id: e.sid2,
      similarity: e.pct,
      fraze_elev1: phrasesA.fraze_elev1,
      fraze_elev2: phrasesA.fraze_elev2,
    })
    peerRowsFlat.push({
      analysis_score_id: insertedB.id,
      peer_student_id: e.sid1,
      similarity: e.pct,
      fraze_elev1: phrasesB.fraze_elev1,
      fraze_elev2: phrasesB.fraze_elev2,
    })
  }

  if (peerRowsFlat.length > 0) {
    await savePeerMatches(peerRowsFlat, supabase)
  }

  await Promise.all(
    submissions.map((sub) => {
      const sc = report.scores[sub.studentName]
      if (!sc) return Promise.resolve()
      return updateSubmissionAnalysis(sub.id, sc.aiScore, supabase)
    }),
  )

  return {
    ...report,
    ranAt: run.ran_at,
  }
}

/** Browser/client wrapper (folosește createBrowserClient). */
export async function buildAndPersistAnalysisReport(
  assignmentId: string,
  submissions: SubmissionInput[],
): Promise<AnalysisReport> {
  const supabase = createClient()
  return persistAnalysisReport(supabase, assignmentId, submissions)
}

type ScoreWithPeers = AnalysisScore & {
  peer_matches?: {
    similarity: number
    peer_student_id: string
    fraze_elev1?: unknown
    fraze_elev2?: unknown
    profiles?: { display_name?: string } | null
  }[]
}

function rebuildGraphFromRows(
  rows: ScoreWithPeers[],
): {
  graphEdges: { a: string; b: string; sim: number }[]
  graphNodes: string[]
} {
  const graphNodes: string[] = []
  const nseen = new Set<string>()
  for (const row of rows) {
    const name = row.student_name ?? ""
    if (name && !nseen.has(name)) {
      nseen.add(name)
      graphNodes.push(name)
    }
  }

  type EdgeAgg = { a: string; b: string; sim: number }
  const agg = new Map<string, EdgeAgg>()

  for (const row of rows) {
    const nameA = row.student_name
    if (!nameA) continue
    for (const pm of row.peer_matches ?? []) {
      if ((pm.similarity ?? 0) < 50) continue
      const nameB =
        pm.profiles?.display_name ??
        rows.find((r) => r.student_id === pm.peer_student_id)?.student_name ??
        ""
      if (!nameB) continue

      const [lo, hi] = nameA <= nameB ? [nameA, nameB] : [nameB, nameA]
      const key = `${lo}\0${hi}`
      const sim = Math.round(Number(pm.similarity))
      const prev = agg.get(key)
      if (!prev || sim > prev.sim) {
        agg.set(key, { a: lo, b: hi, sim })
      }
    }
  }

  return {
    graphEdges: [...agg.values()],
    graphNodes,
  }
}

/** Încarcă ultimul raport pentru o temă. */
export async function loadAnalysisReportForAssignment(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisReport | null> {
  const run = await getLatestAnalysisRun(assignmentId, supabaseClient)
  if (!run) return null

  const rows = await getAnalysisScoresWithPeers(run.id, supabaseClient)
  if (!rows.length) return null

  const baselinesByStudentId = await getStudentBaselines(supabaseClient)
  const scores: Record<string, StudentScore> = {}
  const { graphEdges, graphNodes } = rebuildGraphFromRows(rows as ScoreWithPeers[])

  for (const row of rows as ScoreWithPeers[]) {
    const studentName =
      row.student_name ?? `Student ${row.student_id.slice(0, 8)}`
    const dbBaseline = baselineFromRow(baselinesByStudentId[row.student_id])
    const historicVec = resolveHistoricProfile(studentName, dbBaseline)
    const deviation = row.stilometric ?? 0

    const peerMatches = (row.peer_matches ?? [])
      .filter((pm) => (pm.similarity ?? 0) >= 50)
      .map((pm) => ({
        name: pm.profiles?.display_name ?? "Unknown",
        similarity: Math.round(Number(pm.similarity)),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4)

    scores[studentName] = {
      aiScore: row.ai_score ?? 0,
      similarity: row.similarity ?? 0,
      stilometric: stylometricLabel(deviation),
      lexicalDiversity: row.ttr ?? 0,
      avgSentenceLength: row.asl ?? 0,
      verbDensity: row.verbs ?? 0,
      adjectiveDensity: row.adjs ?? 0,
      punctuationUsage: row.punct ?? 0,
      historicLexicalDiversity: historicVec.lexicalDiversity,
      historicAvgSentenceLength: historicVec.avgSentenceLength,
      historicVerbDensity: historicVec.verbDensity,
      historicAdjectiveDensity: historicVec.adjectiveDensity,
      historicPunctuationUsage: historicVec.punctuationUsage,
      peerMatches,
    }
  }

  return {
    assignmentId,
    ranAt: run.ran_at,
    scores,
    graphEdges,
    graphNodes,
  }
}
