import type { StudentScore } from "./types/academic-types"

export interface SursaWeb {
  url: string
  scor: number
}

export interface RaportPlagiatWeb {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  top_surse: SursaWeb[]
}

type TFn = (key: string, vars?: Record<string, string | number>) => string

export function hitScorPct(item: { scor?: number; score?: number }): number {
  const raw = item.scor ?? item.score ?? 0
  return raw > 1 ? Math.round(raw) : Math.round(raw * 100)
}

export function hitScorUnit(item: { scor?: number; score?: number }): number {
  const raw = item.scor ?? item.score ?? 0
  return raw > 1 ? raw / 100 : raw
}

export function translateVerdict(verdict: string, scorMaximPct: number, t: TFn): string {
  if (verdict.startsWith("✅")) return t("forensic.webVerdictAuthentic")
  if (verdict.startsWith("❌")) return t("forensic.webVerdictDetected", { pct: scorMaximPct })
  if (verdict.startsWith("❓")) return t("forensic.webVerdictSuspect", { pct: scorMaximPct })
  return verdict
}

export function apiReportToUi(raw: {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  plagiarism_urls?: { url: string; scor?: number; score?: number }[]
  top_surse?: { url: string; scor?: number; score?: number }[]
}): RaportPlagiatWeb {
  const hits = raw.plagiarism_urls?.length
    ? raw.plagiarism_urls
    : raw.top_surse ?? []
  return {
    verdict: raw.verdict,
    scor_maxim: raw.scor_maxim,
    sursa_principala: raw.sursa_principala,
    top_surse: hits.map((u) => ({
      url: u.url,
      scor: hitScorUnit(u),
    })),
  }
}

export function cachedScoreToUi(score: StudentScore): RaportPlagiatWeb | null {
  const pw = score.plagiarismWeb
  if (!pw) return null
  return apiReportToUi(pw)
}
