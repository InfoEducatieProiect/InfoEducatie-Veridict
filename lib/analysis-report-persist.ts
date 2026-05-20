import "server-only"

import type { HistoricBaseline } from "./assignment-store"
import {
  analizeaza_clasa_avansat,
  computePairwiseCosinePercentages,
  directedPhrasesFromCaz,
  findCazForUnorderedPair,
  calculateManhattanDeviation,
  computeStylometricVector,
  resolveHistoricProfile,
  type CazSuspect,
} from "./analysisEngine"
import { buildAnalysisReport } from "./analysis-report-build"
import type { AnalysisReport, SubmissionInput } from "./analysis-report"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createAnalysisRun,
  saveAnalysisScores,
  savePeerMatches,
  updateSubmissionAnalysis,
  getStudentBaselines,
  type StudentBaseline,
  type PeerMatchInsert,
} from "@/lib/supabase/queries"

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

function computedToDbStilometric(
  studentName: string,
  text: string,
  dbBaseline: HistoricBaseline | null,
): number {
  const currentVec = computeStylometricVector(text)
  const historicVec = resolveHistoricProfile(studentName, dbBaseline)
  return calculateManhattanDeviation(currentVec, historicVec)
}

export async function persistAnalysisReport(
  supabase: SupabaseClient,
  assignmentId: string,
  submissions: SubmissionInput[],
): Promise<AnalysisReport> {
  const baselinesByStudentId = await getStudentBaselines(supabase)
  const report = await buildAnalysisReport(
    assignmentId,
    submissions,
    baselinesByStudentId,
  )

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
