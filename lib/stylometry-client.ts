import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"

export type StylometryScanSuccess = {
  ok: true
  metrics: StylometryMetrics
  baseline_used: StylometryMetrics
  deviation: number
  verdict: StylometryVerdict
}

export type StylometryScanFailure = {
  ok: false
  error: string
}

export type StylometryScanResult = StylometryScanSuccess | StylometryScanFailure

/** Calls `/api/analyze-stilometrie` — persists metrics to `analysis_scores` on the server. */
export async function fetchStylometryScan(params: {
  assignmentId: string
  submissionId: string
  analysisScoreId: string
  studentId: string
  text: string
}): Promise<StylometryScanResult> {
  const res = await fetch("/api/analyze-stilometrie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assignment_id: params.assignmentId,
      submission_id: params.submissionId,
      analysis_score_id: params.analysisScoreId,
      student_id: params.studentId,
      text: params.text,
    }),
  })

  const data = (await res.json()) as {
    metrics?: StylometryMetrics
    historic_baseline?: StylometryMetrics
    baseline_used?: StylometryMetrics
    deviation?: number
    verdict?: StylometryVerdict
    error?: string
  }

  const historicRef = data.historic_baseline ?? data.baseline_used

  if (
    !res.ok ||
    !data.metrics ||
    !historicRef ||
    data.deviation == null
  ) {
    return {
      ok: false,
      error:
        data.error ??
        (res.ok
          ? `HTTP ${res.status} — incomplete stylometry response`
          : res.statusText || `HTTP ${res.status}`),
    }
  }

  const deviation = data.deviation
  return {
    ok: true,
    metrics: data.metrics,
    baseline_used: historicRef,
    deviation,
    verdict: data.verdict ?? buildStylometryVerdict(deviation),
  }
}
