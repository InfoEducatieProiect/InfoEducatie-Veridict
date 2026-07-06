import { fetchStylometryScan } from "./stylometry-client"
import { resolveForensicScoreIds } from "./forensic-score-ids"
import type { StylometryMetrics } from "./stylometry-types"
import type { StudentScore, AnalysisReport } from "../components/profesor/types"

export type ClassSubmissionRow = {
  id: string
  student_id: string
  studentName: string
  text: string
}

export function stilometricLabelFromDeviation(deviation: number): StudentScore["stilometric"] {
  return deviation >= 38 ? "Abatere Stilistica" : "Stil Consistent"
}

export function markStylometryAnalysisError(score: StudentScore): StudentScore {
  return { ...score, stilometric: "Eroare analiză" }
}

export function mergeStylometryIntoScore(
  score: StudentScore,
  payload: {
    metrics: StylometryMetrics
    baseline_used: StylometryMetrics
    deviation: number
  },
): StudentScore {
  const { metrics, baseline_used, deviation } = payload
  return {
    ...score,
    stylometryMetrics: metrics,
    stylometryBaseline: baseline_used,
    stilometricDeviation: deviation,
    stilometric: stilometricLabelFromDeviation(deviation),
    lexicalDiversity: metrics.ttr,
    avgSentenceLength: metrics.asl,
    verbDensity: metrics.verbs,
    adjectiveDensity: metrics.adjs,
    punctuationUsage: metrics.punct,
    historicLexicalDiversity: baseline_used.ttr,
    historicAvgSentenceLength: baseline_used.asl,
    historicVerbDensity: baseline_used.verbs,
    historicAdjectiveDensity: baseline_used.adjs,
    historicPunctuationUsage: baseline_used.punct,
  }
}

export async function runClassStylometryScan(
  assignmentId: string,
  currentReport: AnalysisReport,
  subs: ClassSubmissionRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<AnalysisReport> {
  const updatedScores: Record<string, StudentScore> = { ...currentReport.scores }
  const total = subs.length
  let done = 0

  for (const sub of subs) {
    const text = (sub.text ?? "").trim()
    const rScore = updatedScores[sub.studentName]
    if (!rScore || !text) {
      done += 1
      onProgress?.(done, total)
      continue
    }

    const { analysisScoreId, studentId } = resolveForensicScoreIds(rScore, {
      submissionId: sub.id,
      studentId: sub.student_id,
    })

    if (!analysisScoreId || !studentId) {
      console.error("[Veridict] Stylometry skip — missing IDs", { studentName: sub.studentName })
      done += 1
      onProgress?.(done, total)
      continue
    }

    try {
      const result = await fetchStylometryScan({ assignmentId, submissionId: sub.id, analysisScoreId, studentId, text })
      if (result.ok) {
        updatedScores[sub.studentName] = mergeStylometryIntoScore(rScore, {
          metrics: result.metrics,
          baseline_used: result.baseline_used,
          deviation: result.deviation,
        })
      } else {
        console.error(`[Veridict] Stylometry failed for ${sub.studentName}:`, result.error)
        updatedScores[sub.studentName] = markStylometryAnalysisError(rScore)
      }
    } catch (err) {
      console.error(`[Veridict] Stylometry error for ${sub.studentName}:`, err)
      updatedScores[sub.studentName] = markStylometryAnalysisError(rScore)
    }

    done += 1
    onProgress?.(done, total)
  }

  return { ...currentReport, scores: updatedScores }
}
