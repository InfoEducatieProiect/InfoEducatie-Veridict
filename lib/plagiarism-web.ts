/**
 * Types for global web plagiarism (Gemini + cosine similarity).
 */

export interface PlagiarismUrlHit {
  url: string
  /** Cosine similarity percentage 0–100 */
  scor: number
}

export interface PlagiarismWebReport {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  plagiarism_urls: PlagiarismUrlHit[]
}

function parseUrlHits(raw: unknown): PlagiarismUrlHit[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
    .map((u) => {
      const scorRaw = u.scor ?? u.score ?? 0
      const scorNum = Number(scorRaw)
      return {
        url: String(u.url ?? ""),
        scor: scorNum <= 1 && scorNum > 0 ? Math.round(scorNum * 1000) / 10 : scorNum,
      }
    })
    .filter((u) => u.url.length > 0 && u.scor > 0)
}

export function parsePlagiarismWebReport(raw: unknown): PlagiarismWebReport | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  let urls = parseUrlHits(o.plagiarism_urls)
  if (!urls.length) urls = parseUrlHits(o.top_surse)
  return {
    verdict: String(o.verdict ?? ""),
    scor_maxim: Number(o.scor_maxim ?? 0),
    sursa_principala:
      o.sursa_principala == null ? null : String(o.sursa_principala),
    plagiarism_urls: urls,
  }
}

/** True when scan found sources or non-zero similarity (not a stale empty failure). */
export function isPlagiarismCacheValid(report: PlagiarismWebReport): boolean {
  if (report.plagiarism_urls.length > 0) return true
  if (report.scor_maxim > 0) return true
  const v = report.verdict.toLowerCase()
  if (v.includes("incomplet") || v.includes("verifica gemini")) return false
  return false
}
