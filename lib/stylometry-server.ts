import "server-only"

import { spawn } from "child_process"
import path from "path"
import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertAveragedBaseline, type StudentBaseline } from "@/lib/supabase/queries"
import {
  parseStylometryMetricsFromDb,
  stylometryMetricsToDbColumns,
} from "@/lib/stylometry-db-metrics"
import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"

export type { StylometryMetrics, StylometryVerdict } from "@/lib/stylometry-types"
export { buildStylometryVerdict } from "@/lib/stylometry-types"

const PYTHON_TIMEOUT_MS = Number(process.env.STYLOMETRY_PYTHON_TIMEOUT_MS ?? 60_000)
// Batch spawns ONE process for the whole class (model loads once) — allow more headroom.
const BATCH_TIMEOUT_MS = Number(process.env.STYLOMETRY_BATCH_TIMEOUT_MS ?? 300_000)
const PYTHON_BIN = process.env.PYTHON_PATH ?? "python"

const METRIC_KEYS = ["ttr", "asl", "verbs", "adjs", "punct"] as const

type StylometryMetricKey = (typeof METRIC_KEYS)[number]

export interface StylometryAnalysisResult {
  /** Metricile lucrării curente — salvate în `analysis_scores`. */
  metrics: StylometryMetrics
  /** Amprenta istorică de referință — citită din `student_baselines`. */
  historic_baseline: StylometryMetrics
  /** Alias pentru compatibilitate UI (`baseline_used`). */
  baseline_used: StylometryMetrics
  deviation: number
  /** True dacă nu există încă rând în `student_baselines` (doar citire; fără scriere la analiză). */
  baseline_initialized: boolean
  verdict: StylometryVerdict
  analysis_score_id: string
  student_id: string
  submission_id: string
}

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "analiza_stilometrie.py")
}

function pythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function metricsFromRow(
  row: Partial<Record<StylometryMetricKey, number | null>> | null | undefined,
): StylometryMetrics | null {
  if (!row) return null
  const hasAny = METRIC_KEYS.some((k) => row[k] != null && Number.isFinite(Number(row[k])))
  if (!hasAny) return null
  const parsed = parseStylometryMetricsFromDb(row as Record<string, number | null>)
  if (!parsed) return null
  return {
    ttr: round2(parsed.ttr),
    asl: round2(parsed.asl),
    verbs: round2(parsed.verbs),
    adjs: round2(parsed.adjs),
    punct: round2(parsed.punct),
  }
}

/**
 * Citește amprenta istorică globală — EXCLUSIV din `student_baselines`.
 * Nu folosește `analysis_scores` ca sursă de baseline.
 */
export async function loadHistoricBaselineFromDb(
  studentId: string,
  supabase: SupabaseClient,
): Promise<StylometryMetrics | null> {
  const { data, error } = await supabase
    .from("student_baselines")
    .select("ttr, asl, verbs, adjs, punct")
    .eq("student_id", studentId)
    .maybeSingle()

  if (error) throw error
  return metricsFromRow(data as StudentBaseline | null)
}

/**
 * Persistă metricile lucrării curente + deviația în `analysis_scores` pentru acest submission.
 * Plan A: update by analysisScoreId (fast path — always valid after getOrCreateAnalysisRun).
 * Plan B: update directly by submission_id DESC without an extra SELECT (fallback).
 */
async function persistCurrentWorkToAnalysisScore(
  analysisScoreId: string,
  current: StylometryMetrics,
  deviation: number,
  supabase: SupabaseClient,
  submissionId?: string,
): Promise<void> {
  const dbCols = stylometryMetricsToDbColumns(current)
  const payload = { ...dbCols, stilometric: deviation }

  if (analysisScoreId && analysisScoreId !== "undefined") {
    const { error, count } = await supabase
      .from("analysis_scores")
      .update(payload)
      .eq("id", analysisScoreId)

    if (error) throw error
    if ((count ?? 1) > 0) return
  }

  if (submissionId) {
    const { data: row } = await supabase
      .from("analysis_scores")
      .select("id")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (row?.id) {
      const { error } = await supabase
        .from("analysis_scores")
        .update(payload)
        .eq("id", row.id)
      if (error) throw error
      return
    }
  }

  throw new Error(
    `[stylometry] No analysis_scores row found for analysisScoreId=${analysisScoreId} submissionId=${submissionId}`,
  )
}

function runStylometryPython(
  text: string,
  historicBaseline: StylometryMetrics | null,
): Promise<{
  metrics: StylometryMetrics
  deviation: number
}> {
  return new Promise((resolve, reject) => {
    const trimmed = (text ?? "").trim()
    if (!trimmed) {
      reject(new Error("empty_text"))
      return
    }

    const child = spawn(PYTHON_BIN, [scriptPath()], {
      stdio: ["pipe", "pipe", "pipe"],
      env: pythonEnv(),
    })

    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Stylometry script timed out after ${PYTHON_TIMEOUT_MS}ms`))
    }, PYTHON_TIMEOUT_MS)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(
          new Error(
            `Stylometry script exited ${code}${stderr ? `: ${stderr.slice(-600)}` : ""}`,
          ),
        )
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>
        if (parsed.error) {
          reject(new Error(String(parsed.error)))
          return
        }
        const metrics = metricsFromRow(
          parsed.metrics as Partial<Record<StylometryMetricKey, number>>,
        )
        if (!metrics) {
          reject(new Error("Invalid stylometry JSON from Python"))
          return
        }
        const deviation = round2(Number(parsed.deviation ?? 0))
        resolve({ metrics, deviation })
      } catch (e) {
        reject(
          new Error(
            `Failed to parse stylometry output: ${e instanceof Error ? e.message : String(e)}`,
          ),
        )
      }
    })

    child.stdin.write(
      JSON.stringify({
        text: trimmed,
        baseline: historicBaseline,
      }),
    )
    child.stdin.end()
  })
}

export interface StylometryBatchItem {
  id: string
  text: string
  /** Historic baseline from `student_baselines`, or null. */
  baseline: StylometryMetrics | null
}

export interface StylometryBatchEntry {
  metrics: StylometryMetrics
  deviation: number
  baseline_used: StylometryMetrics
}

/**
 * Batched spaCy stylometry — ONE Python spawn (one `ro_core_news_sm` load) for
 * the whole class, mirroring `runHybridAiBatch`. Returns a map keyed by item id;
 * items that failed inside Python are simply omitted so the caller can fall back.
 * On a spawn/parse/timeout failure the returned map is empty (caller falls back).
 */
export async function runStylometryBatch(
  items: StylometryBatchItem[],
): Promise<Record<string, StylometryBatchEntry>> {
  const payload = items
    .map((it) => ({
      id: it.id,
      text: (it.text ?? "").trim(),
      baseline: it.baseline,
    }))
    .filter((it) => it.id && it.text.length > 0)

  if (payload.length === 0) return {}

  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [scriptPath()], {
      stdio: ["pipe", "pipe", "pipe"],
      env: pythonEnv(),
    })

    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      console.warn(`[stylometry-batch] timed out after ${BATCH_TIMEOUT_MS}ms`)
      resolve({})
    }, BATCH_TIMEOUT_MS)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      console.warn("[stylometry-batch] spawn failed:", err instanceof Error ? err.message : err)
      resolve({})
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.warn(
          `[stylometry-batch] exited ${code}${stderr ? `: ${stderr.slice(-600)}` : ""}`,
        )
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as {
          results?: Array<Record<string, unknown>>
          error?: string
        }
        if (parsed.error) {
          console.warn("[stylometry-batch] python error:", parsed.error)
          resolve({})
          return
        }
        const out: Record<string, StylometryBatchEntry> = {}
        for (const row of parsed.results ?? []) {
          const id = String(row.id ?? "")
          if (!id || row.error) continue
          const metrics = metricsFromRow(
            row.metrics as Partial<Record<StylometryMetricKey, number>>,
          )
          const baselineUsed = metricsFromRow(
            row.baseline_used as Partial<Record<StylometryMetricKey, number>>,
          )
          if (!metrics) continue
          out[id] = {
            metrics,
            deviation: round2(Number(row.deviation ?? 0)),
            baseline_used: baselineUsed ?? metrics,
          }
        }
        resolve(out)
      } catch (e) {
        console.warn(
          "[stylometry-batch] parse failed:",
          e instanceof Error ? e.message : String(e),
        )
        resolve({})
      }
    })

    child.stdin.write(JSON.stringify({ texts: payload }))
    child.stdin.end()
  })
}

/**
 * Flux corect:
 * 1. Citește baseline din `student_baselines` (read-only; sau null)
 * 2. Python extrage metricile textului curent + deviație față de baseline
 * 3. Scrie metricile curente + `stilometric` în `analysis_scores` (singura scriere)
 */
export async function runStylometryAnalysis(
  analysisScoreId: string,
  studentId: string,
  submissionId: string,
  text: string,
  supabaseClient?: SupabaseClient,
  assignmentType: "tema" | "test" = "tema",
): Promise<StylometryAnalysisResult> {
  const supabase = supabaseClient ?? (await createClient())

  const historicBaseline = await loadHistoricBaselineFromDb(studentId, supabase)
  const pythonOut = await runStylometryPython(text, historicBaseline)

  const referenceBaseline: StylometryMetrics =
    historicBaseline ?? { ...pythonOut.metrics }
  // Deviation is always measured against the PREVIOUS baseline (or 0 when none).
  // For a TEST this is informational; the test then updates the baseline below.
  const deviation = pythonOut.deviation

  // Aici am adăugat submissionId la finalul apelului ca să funcționeze Planul B
  await persistCurrentWorkToAnalysisScore(
    analysisScoreId,
    pythonOut.metrics,
    deviation,
    supabase,
    submissionId,
  )

  // TEST: fold these metrics into the student's baseline (true running average).
  if (assignmentType === "test") {
    const { data: existingRow } = await supabase
      .from("student_baselines")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle()
    try {
      await upsertAveragedBaseline(
        studentId,
        pythonOut.metrics,
        existingRow as StudentBaseline | null,
        supabase,
      )
    } catch (e) {
      console.warn(
        `[baseline] failed to update baseline for student ${studentId}:`,
        e instanceof Error ? e.message : e,
      )
    }
  }

  return {
    metrics: pythonOut.metrics,
    historic_baseline: referenceBaseline,
    baseline_used: referenceBaseline,
    deviation,
    baseline_initialized: historicBaseline == null,
    verdict: buildStylometryVerdict(deviation),
    analysis_score_id: analysisScoreId,
    student_id: studentId,
    submission_id: submissionId,
  }
}
