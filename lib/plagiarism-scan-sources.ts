import type { SupabaseClient } from "@supabase/supabase-js"
import type { PlagiarismWebReport } from "@/lib/plagiarism-web"

export interface ScanSourceRow {
  submission_id?: string
  url: string
  similarity_score: number
}

export function dedupeScanSources(rows: ScanSourceRow[]): ScanSourceRow[] {
  const byUrl = new Map<string, ScanSourceRow>()
  for (const row of rows) {
    const url = row.url.trim()
    if (!url) continue
    const score = Number(row.similarity_score)
    const prev = byUrl.get(url)
    if (!prev || score > Number(prev.similarity_score)) {
      byUrl.set(url, { url, similarity_score: score })
    }
  }
  return [...byUrl.values()].sort(
    (a, b) => b.similarity_score - a.similarity_score,
  )
}

export function buildVerdictFromPercent(topScor: number): string {
  if (topScor >= 40) {
    return `❌ ALERTĂ DETECTATĂ: Text preluat de pe internet (Similitudine Cosinus: ${topScor.toFixed(1)}%).`
  }
  if (topScor >= 15) {
    return `❓ SUSPECT: Structură parțial similară sau parafrazare inteligentă (${topScor.toFixed(1)}%).`
  }
  return `✅ TEXT AUTENTIC: Text original în raport cu indexul public online.`
}

export function plagiarismReportFromScanSources(
  sources: ScanSourceRow[],
): PlagiarismWebReport {
  const deduped = dedupeScanSources(sources)
  const plagiarism_urls = deduped.map((row) => ({
    url: row.url,
    scor: Number(row.similarity_score),
  }))

  const topScor = plagiarism_urls[0]?.scor ?? 0

  return {
    verdict: buildVerdictFromPercent(topScor),
    scor_maxim: topScor / 100,
    sursa_principala: plagiarism_urls[0]?.url ?? null,
    plagiarism_urls,
  }
}

export async function fetchScanSourcesForSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<ScanSourceRow[]> {
  const { data, error } = await supabase
    .from("scan_sources")
    .select("url, similarity_score")
    .eq("submission_id", submissionId)
    .order("similarity_score", { ascending: false })

  if (error) throw error
  return dedupeScanSources((data ?? []) as ScanSourceRow[])
}

export async function fetchScanSourcesMapBySubmissionIds(
  supabase: SupabaseClient,
  submissionIds: string[],
): Promise<Map<string, ScanSourceRow[]>> {
  const map = new Map<string, ScanSourceRow[]>()
  const ids = [...new Set(submissionIds.filter(Boolean))]
  if (!ids.length) return map

  const { data, error } = await supabase
    .from("scan_sources")
    .select("submission_id, url, similarity_score")
    .in("submission_id", ids)
    .order("similarity_score", { ascending: false })

  if (error) throw error

  const grouped = new Map<string, ScanSourceRow[]>()
  for (const row of data ?? []) {
    const sid = String((row as ScanSourceRow & { submission_id: string }).submission_id)
    const list = grouped.get(sid) ?? []
    list.push({
      url: String(row.url),
      similarity_score: Number(row.similarity_score),
    })
    grouped.set(sid, list)
  }

  for (const [sid, rows] of grouped) {
    map.set(sid, dedupeScanSources(rows))
  }
  return map
}

export function maxSimilarityFromRows(rows: ScanSourceRow[]): number {
  if (!rows.length) return 0
  return rows.reduce((m, r) => Math.max(m, Number(r.similarity_score)), 0)
}

export function plagiarismScorToPercent(value: number): number {
  if (value <= 0) return 0
  if (value <= 1) return Math.round(value * 1000) / 10
  return value
}
