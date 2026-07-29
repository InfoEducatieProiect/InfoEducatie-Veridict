export interface ForensicScoreRef {
  id?: string
  analysisScoreId?: string
  analysis_score_id?: string
  studentId?: string
  student_id?: string
  submissionId?: string
  submission_id?: string
}

export function resolveForensicScoreIds(
  score: ForensicScoreRef,
  fallback: { submissionId: string; studentId?: string },
): {
  analysisScoreId: string
  studentId: string
  submissionId: string
} {
  const analysisScoreId =
    score.id?.trim() ||
    score.analysisScoreId?.trim() ||
    score.analysis_score_id?.trim() ||
    ""

  const studentId =
    score.student_id?.trim() ||
    score.studentId?.trim() ||
    fallback.studentId?.trim() ||
    ""

  const submissionId =
    score.submission_id?.trim() ||
    score.submissionId?.trim() ||
    fallback.submissionId.trim()

  return { analysisScoreId, studentId, submissionId }
}
