import "server-only"

import { spawn } from "child_process"
import path from "path"
import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { StudentBaseline } from "@/lib/supabase/queries"
import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"

export type { StylometryMetrics, StylometryVerdict } from "@/lib/stylometry-types"
export { buildStylometryVerdict } from "@/lib/stylometry-types"

const PYTHON_TIMEOUT_MS = Number(process.env.STYLOMETRY_PYTHON_TIMEOUT_MS ?? 60_000)
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
  return {
    ttr: round2(Number(row.ttr ?? 0)),
    asl: round2(Number(row.asl ?? 0)),
    verbs: round2(Number(row.verbs ?? 0)),
    adjs: round2(Number(row.adjs ?? 0)),
    punct: round2(Number(row.punct ?? 0)),
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
 */
async function persistCurrentWorkToAnalysisScore(
  analysisScoreId: string,
  current: StylometryMetrics,
  deviation: number,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from("analysis_scores")
    .update({
      ttr: current.ttr,
      asl: current.asl,
      verbs: current.verbs,
      adjs: current.adjs,
      punct: current.punct,
      stilometric: deviation,
    })
    .eq("id", analysisScoreId)

  if (error) throw error
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
): Promise<StylometryAnalysisResult> {
  const supabase = supabaseClient ?? (await createClient())

  const historicBaseline = await loadHistoricBaselineFromDb(studentId, supabase)
  const pythonOut = await runStylometryPython(text, historicBaseline)

  const referenceBaseline: StylometryMetrics =
    historicBaseline ?? { ...pythonOut.metrics }
  const deviation = pythonOut.deviation

  await persistCurrentWorkToAnalysisScore(
    analysisScoreId,
    pythonOut.metrics,
    deviation,
    supabase,
  )

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
