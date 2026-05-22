/**
 * Canonical DB/UI scale for analysis_scores stylometry columns:
 * - ttr, verbs, adjs, punct → percentage 0–100 (spaCy: count/total_words*100)
 * - asl → average sentence length in words (not 0–100 chart scale)
 */

import type { StylometryMetrics } from "@/lib/stylometry-types"

export type StylometryDbMetrics = StylometryMetrics

const CHART_TO_RAW_DIVISOR = {
  verbs: 3,
  adjs: 3.5,
  punct: 2,
} as const

type DensityKey = keyof typeof CHART_TO_RAW_DIVISOR

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Normalize a density field to percentage 0–100 for DB/UI. */
export function coercePercentMetric(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 0 && n <= 1) return round1(n * 100)
  return round1(Math.min(100, n))
}

/**
 * Undo legacy AI chart scaling (computeStylometricVector) mistakenly stored in DB.
 * Chart: verbs = min(100, ratio*300) → raw% ≈ chart/3
 */
export function denormalizeLegacyChartMetric(
  key: DensityKey,
  stored: number,
): number {
  const v = coercePercentMetric(stored)
  if (v <= 28) return v
  const estimated = v / CHART_TO_RAW_DIVISOR[key]
  if (estimated > 0 && estimated <= 45) {
    return round1(estimated)
  }
  return v
}

/** Undo legacy normalized 0–100 ASL stored by AI persist; keep spaCy word counts. */
export function denormalizeLegacyAsl(stored: number): number {
  const n = Number(stored)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 40) {
    return round1(((n / 100) * 25) + 5)
  }
  return round1(n)
}

export function parseStylometryMetricsFromDb(row: {
  ttr?: number | null
  asl?: number | null
  verbs?: number | null
  adjs?: number | null
  punct?: number | null
} | null | undefined): StylometryDbMetrics | null {
  if (!row) return null
  const hasAny =
    row.ttr != null ||
    row.asl != null ||
    row.verbs != null ||
    row.adjs != null ||
    row.punct != null
  if (!hasAny) return null

  const mapped: StylometryDbMetrics = {
    ttr: coercePercentMetric(row.ttr),
    asl: denormalizeLegacyAsl(Number(row.asl ?? 0)),
    verbs: denormalizeLegacyChartMetric("verbs", Number(row.verbs ?? 0)),
    adjs: denormalizeLegacyChartMetric("adjs", Number(row.adjs ?? 0)),
    punct: denormalizeLegacyChartMetric("punct", Number(row.punct ?? 0)),
  }

  console.log("[Stylometry Debug] parseStylometryMetricsFromDb", {
    rawFromDb: {
      ttr: row.ttr,
      asl: row.asl,
      verbs: row.verbs,
      adjs: row.adjs,
      punct: row.punct,
    },
    mappedToUi: mapped,
  })

  return mapped
}

/** Format metrics before writing to analysis_scores (spaCy scale). */
export function stylometryMetricsToDbColumns(
  metrics: StylometryMetrics,
): StylometryDbMetrics {
  const cols = {
    ttr: coercePercentMetric(metrics.ttr),
    asl: round1(metrics.asl),
    verbs: coercePercentMetric(metrics.verbs),
    adjs: coercePercentMetric(metrics.adjs),
    punct: coercePercentMetric(metrics.punct),
  }
  console.log("[Stylometry Debug] stylometryMetricsToDbColumns", {
    input: metrics,
    dbColumns: cols,
  })
  return cols
}
