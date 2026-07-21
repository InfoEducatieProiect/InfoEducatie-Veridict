import type { AnalysisReport } from "@/components/profesor/types"

/**
 * POSTs `/api/analyze-ai` and consumes its NDJSON stream, reporting progress as
 * it arrives. Transport only — callers own the side effects (SWR revalidation,
 * report caching, UI state).
 *
 * Throws on transport failure, on a `{type:"error"}` frame, or if the stream
 * ends without a report.
 */
export async function runAssignmentAnalysis(
  assignmentId: string,
  onProgress?: (progress: { done: number; total: number }) => void,
): Promise<AnalysisReport> {
  const res = await fetch("/api/analyze-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignment_id: assignmentId }),
  })
  // Validation/auth failures come back as plain JSON (non-2xx, not a stream).
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }

  // Success = NDJSON stream: {type:"progress"|"report"|"error", ...} per line.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let finalReport: AnalysisReport | null = null
  let streamError: string | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      let evt: { type?: string; done?: number; total?: number; report?: AnalysisReport; error?: string }
      try { evt = JSON.parse(line) } catch { continue }
      if (evt.type === "progress") {
        onProgress?.({ done: evt.done ?? 0, total: evt.total ?? 0 })
      } else if (evt.type === "report") {
        finalReport = evt.report ?? null
      } else if (evt.type === "error") {
        streamError = evt.error ?? "Analysis failed"
      }
    }
  }

  if (streamError) throw new Error(streamError)
  if (!finalReport) throw new Error("Missing report in response")
  return finalReport
}
