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
  metrics: StylometryMetrics
  deviation: number
  baseline_used: StylometryMetrics
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

function averageMetrics(rows: StylometryMetrics[]): StylometryMetrics | null {
  if (!rows.length) return null
  const sum = { ttr: 0, asl: 0, verbs: 0, adjs: 0, punct: 0 }
  for (const row of rows) {
    for (const k of METRIC_KEYS) {
      sum[k] += row[k]
    }
  }
  const n = rows.length
  return {
    ttr: round2(sum.ttr / n),
    asl: round2(sum.asl / n),
    verbs: round2(sum.verbs / n),
    adjs: round2(sum.adjs / n),
    punct: round2(sum.punct / n),
  }
}

function consolidateBaseline(
  existing: StylometryMetrics | null,
  current: StylometryMetrics,
): StylometryMetrics {
  if (!existing) return current
  return {
    ttr: round2((existing.ttr + current.ttr) / 2),
    asl: round2((existing.asl + current.asl) / 2),
    verbs: round2((existing.verbs + current.verbs) / 2),
    adjs: round2((existing.adjs + current.adjs) / 2),
    punct: round2((existing.punct + current.punct) / 2),
  }
}

async function resolveBaselineForStudent(
  studentId: string,
  supabase: SupabaseClient,
): Promise<StylometryMetrics | null> {
  const { data: baselineRow, error: baselineErr } = await supabase
    .from("student_baselines")
    .select("ttr, asl, verbs, adjs, punct")
    .eq("student_id", studentId)
    .maybeSingle()

  if (baselineErr) throw baselineErr

  const fromBaselines = metricsFromRow(baselineRow as StudentBaseline | null)
  if (fromBaselines) return fromBaselines

  const { data: historyRows, error: histErr } = await supabase
    .from("analysis_scores")
    .select("ttr, asl, verbs, adjs, punct")
    .eq("student_id", studentId)
    .not("stilometric", "is", null)
    .not("ttr", "is", null)

  if (histErr) throw histErr

  const historical = (historyRows ?? [])
    .map((r) => metricsFromRow(r as Partial<Record<StylometryMetricKey, number>>))
    .filter((m): m is StylometryMetrics => m !== null)

  return averageMetrics(historical)
}

function runStylometryPython(
  text: string,
  baseline: StylometryMetrics | null,
): Promise<{
  metrics: StylometryMetrics
  deviation: number
  baseline_used: StylometryMetrics
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
        const baselineUsed = metricsFromRow(
          parsed.baseline_used as Partial<Record<StylometryMetricKey, number>>,
        )
        if (!metrics || !baselineUsed) {
          reject(new Error("Invalid stylometry JSON from Python"))
          return
        }
        resolve({
          metrics,
          deviation: round2(Number(parsed.deviation ?? 0)),
          baseline_used: baselineUsed,
        })
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
        baseline: baseline ?? null,
      }),
    )
    child.stdin.end()
  })
}

/**
 * Runs spaCy stylometry, persists to analysis_scores + student_baselines.
 */
export async function runStylometryAnalysis(
  analysisScoreId: string,
  studentId: string,
  submissionId: string,
  text: string,
  supabaseClient?: SupabaseClient,
): Promise<StylometryAnalysisResult> {
  const supabase = supabaseClient ?? (await createClient())

  const baselineInput = await resolveBaselineForStudent(studentId, supabase)
  const pythonOut = await runStylometryPython(text, baselineInput)

  const { error: scoreErr } = await supabase
    .from("analysis_scores")
    .update({
      ttr: pythonOut.metrics.ttr,
      asl: pythonOut.metrics.asl,
      verbs: pythonOut.metrics.verbs,
      adjs: pythonOut.metrics.adjs,
      punct: pythonOut.metrics.punct,
      stilometric: pythonOut.deviation,
    })
    .eq("id", analysisScoreId)

  if (scoreErr) throw scoreErr

  const { data: existingBaseline } = await supabase
    .from("student_baselines")
    .select("ttr, asl, verbs, adjs, punct")
    .eq("student_id", studentId)
    .maybeSingle()

  const consolidated = consolidateBaseline(
    metricsFromRow(existingBaseline as StudentBaseline | null),
    pythonOut.metrics,
  )

  const { error: upsertErr } = await supabase.from("student_baselines").upsert(
    {
      student_id: studentId,
      ttr: consolidated.ttr,
      asl: consolidated.asl,
      verbs: consolidated.verbs,
      adjs: consolidated.adjs,
      punct: consolidated.punct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id" },
  )

  if (upsertErr) throw upsertErr

  return {
    metrics: pythonOut.metrics,
    deviation: pythonOut.deviation,
    baseline_used: pythonOut.baseline_used,
    verdict: buildStylometryVerdict(pythonOut.deviation),
    analysis_score_id: analysisScoreId,
    student_id: studentId,
    submission_id: submissionId,
  }
}
