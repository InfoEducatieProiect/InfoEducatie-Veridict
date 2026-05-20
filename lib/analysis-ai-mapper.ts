import "server-only"

import type { SubmissionInput } from "./analysis-report"

/**
 * Schema-agnostic document unit for the hybrid AI pipeline.
 * Maps cleanly to any store that exposes id, author key, display label, and body text.
 */
export interface AnalyzableDocument {
  recordId: string
  authorKey: string
  displayName: string
  body: string
}

export interface RawAnalyzableRow {
  id: string
  author_id: string
  author_name?: string | null
  body?: string | null
  submitted_at?: string | null
}

const DEFAULT_AUTHOR_PREFIX = "Author"

/**
 * Normalizes arbitrary submission-like rows into analyzable documents.
 * Filters to rows with non-empty body and optional submission timestamp.
 */
export function mapRowsToAnalyzableDocuments(
  rows: RawAnalyzableRow[],
  options?: { requireSubmitted?: boolean },
): AnalyzableDocument[] {
  const requireSubmitted = options?.requireSubmitted ?? true

  return rows
    .filter((row) => {
      const hasBody = typeof row.body === "string" && row.body.trim().length > 0
      if (!hasBody) return false
      if (requireSubmitted && row.submitted_at == null) return false
      return true
    })
    .map((row) => ({
      recordId: String(row.id),
      authorKey: String(row.author_id),
      displayName:
        (row.author_name?.trim()?.length ?? 0) > 0
          ? (row.author_name as string).trim()
          : `${DEFAULT_AUTHOR_PREFIX}_${String(row.author_id).slice(0, 8)}`,
      body: (row.body as string).trim(),
    }))
}

export function mapDocumentsToSubmissionInputs(
  docs: AnalyzableDocument[],
): SubmissionInput[] {
  return docs.map((d) => ({
    id: d.recordId,
    studentId: d.authorKey,
    studentName: d.displayName,
    text: d.body,
  }))
}

/** Score payload for persisting back to analysis_scores / submissions. */
export interface PersistableAiScore {
  recordId: string
  aiScore: number
}

export function extractAiScoresFromReport(
  scoresByDisplayName: Record<string, { aiScore: number }>,
  docs: AnalyzableDocument[],
): PersistableAiScore[] {
  return docs.map((d) => ({
    recordId: d.recordId,
    aiScore: scoresByDisplayName[d.displayName]?.aiScore ?? 0,
  }))
}
