import "server-only"

import type { HistoricBaseline } from "./assignment-store"
import {
  directedPhrasesFromCaz,
  findCazForUnorderedPair,
  calculateManhattanDeviation,
  computeRawStylometricPercentages,
  computeStylometricVector,
  resolveHistoricProfile,
  type CazSuspect,
} from "./analysisEngine"
import { stylometryMetricsToDbColumns } from "./stylometry-db-metrics"
import { buildAnalysisReport } from "./analysis-report-build"
import { runStylometryBatch } from "./stylometry-server"
import type { AiProgressCallback } from "./hybrid-ai-python"
import type { AnalysisReport, SubmissionInput } from "./analysis-report"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getOrCreateAnalysisRun,
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
  onAiProgress?: AiProgressCallback,
): Promise<AnalysisReport> {
  const baselinesByStudentId = await getStudentBaselines(
    supabase,
    submissions.map((s) => s.studentId),
  )
  const built = await buildAnalysisReport(
    assignmentId,
    submissions,
    baselinesByStudentId,
    onAiProgress,
  )
  const report = built.report

  // Radar stilometric — batched spaCy for the whole class in ONE Python spawn
  // (one `ro_core_news_sm` load), replacing the old per-submission client loop.
  const styloBatch = await runStylometryBatch(
    submissions.map((sub) => ({
      id: sub.id,
      text: sub.text ?? "",
      baseline: baselineFromRow(baselinesByStudentId[sub.studentId]),
    })),
  )

  const run = await getOrCreateAnalysisRun(assignmentId, supabase)

  const scoreRows = submissions.map((sub) => {
    const sc = report.scores[sub.studentName]
    const spa = styloBatch[sub.id]

    let stilometricDev: number
    let dbStylo: ReturnType<typeof stylometryMetricsToDbColumns>
    if (spa) {
      // Real spaCy metrics — identical to the old per-submission route output.
      stilometricDev = spa.deviation
      dbStylo = stylometryMetricsToDbColumns(spa.metrics)
    } else {
      // Fallback when Python/spaCy is unavailable: previous TS heuristic.
      const dbBaseline = baselineFromRow(baselinesByStudentId[sub.studentId])
      stilometricDev = computedToDbStilometric(sub.studentName, sub.text ?? "", dbBaseline)
      dbStylo = stylometryMetricsToDbColumns(computeRawStylometricPercentages(sub.text ?? ""))
    }

    return {
      analysis_run_id: run.id,
      student_id: sub.studentId,
      submission_id: sub.id,
      ai_score: sc?.aiScore ?? 0,
      similarity: sc?.similarity ?? 0,
      stilometric: stilometricDev,
      ttr: dbStylo.ttr,
      asl: dbStylo.asl,
      verbs: dbStylo.verbs,
      adjs: dbStylo.adjs,
      punct: dbStylo.punct,
    }
  })

  const insertedScores = await saveAnalysisScores(scoreRows, supabase)

  // Reuse the similarity pass already computed in buildAnalysisReport (no recompute).
  const cazuri: CazSuspect[] = built.cazuri
  const edgesGte50 = built.edgesGte50

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
    const affectedScoreIds = insertedScores.map((s) => s.id).filter(Boolean)
    await savePeerMatches(peerRowsFlat, supabase, affectedScoreIds)
  }

  await Promise.all(
    submissions.map((sub) => {
      const sc = report.scores[sub.studentName]
      if (!sc) return Promise.resolve()
      return updateSubmissionAnalysis(sub.id, sc.aiScore, supabase)
    }),
  )

  for (const sub of submissions) {
    const inserted = insertedByStudentId.get(sub.studentId)
    const sc = report.scores[sub.studentName]
    if (!sc || !inserted?.id) continue

    // Overwrite the UI stylometry fields with the batched spaCy result so the
    // radar renders accurate values straight from this single request.
    const spa = styloBatch[sub.id]
    const styloFields = spa
      ? {
          stylometryMetrics: spa.metrics,
          stylometryBaseline: spa.baseline_used,
          stilometricDeviation: spa.deviation,
          stilometric:
            spa.deviation >= 38
              ? ("Abatere Stilistica" as const)
              : ("Stil Consistent" as const),
          lexicalDiversity: spa.metrics.ttr,
          avgSentenceLength: spa.metrics.asl,
          verbDensity: spa.metrics.verbs,
          adjectiveDensity: spa.metrics.adjs,
          punctuationUsage: spa.metrics.punct,
          historicLexicalDiversity: spa.baseline_used.ttr,
          historicAvgSentenceLength: spa.baseline_used.asl,
          historicVerbDensity: spa.baseline_used.verbs,
          historicAdjectiveDensity: spa.baseline_used.adjs,
          historicPunctuationUsage: spa.baseline_used.punct,
        }
      : {}

    report.scores[sub.studentName] = {
      ...sc,
      ...styloFields,
      analysisScoreId: inserted.id,
      studentId: sub.studentId,
      submissionId: sub.id,
    }
  }

  return {
    ...report,
    ranAt: run.ran_at,
  }
}
