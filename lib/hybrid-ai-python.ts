import "server-only"

import { spawn } from "child_process"
import path from "path"
import {
  analizeazaTextComplet,
  detecteazaLimba,
  mergePythonResult,
  type HybridAiResult,
} from "./hybrid-ai-detection"

/** TS fallback: auto-detect language (never hard-default to RO). */
function fallbackAnalyze(text: string): HybridAiResult {
  const limba = detecteazaLimba(text)
  return analizeazaTextComplet(text, 50, limba)
}

export interface TextAnalysisInput {
  id: string
  text: string
}

const PYTHON_TIMEOUT_MS = Number(process.env.AI_PYTHON_TIMEOUT_MS ?? 600_000)
const PYTHON_BIN = process.env.PYTHON_PATH ?? "python"

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "ai_detector.py")
}

function runPythonBatch(
  texts: TextAnalysisInput[],
): Promise<Record<string, HybridAiResult>> {
  return new Promise((resolve, reject) => {
    const script = scriptPath()
    const child = spawn(PYTHON_BIN, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TOKENIZERS_PARALLELISM: "false" },
    })

    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Python AI detector timed out after ${PYTHON_TIMEOUT_MS}ms`))
    }, PYTHON_TIMEOUT_MS)

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
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
            `Python exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        )
        return
      }
      try {
        const parsed = JSON.parse(stdout) as {
          results?: Record<string, unknown>[]
          error?: string
        }
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }
        const out: Record<string, HybridAiResult> = {}
        for (const row of parsed.results ?? []) {
          const id = String(row.id ?? "")
          if (!id) continue
          if (row.error) {
            const t = texts.find((x) => x.id === id)?.text ?? ""
            out[id] = fallbackAnalyze(t)
            continue
          }
          out[id] = mergePythonResult(row)
        }
        resolve(out)
      } catch (e) {
        reject(
          new Error(
            `Failed to parse Python output: ${e instanceof Error ? e.message : String(e)}`,
          ),
        )
      }
    })

    child.stdin.write(JSON.stringify({ texts }))
    child.stdin.end()
  })
}

/**
 * Batch hybrid AI scores keyed by submission id.
 * Falls back to TypeScript heuristics if Python/RoBERTa is unavailable.
 */
export async function runHybridAiBatch(
  texts: TextAnalysisInput[],
): Promise<Record<string, HybridAiResult>> {
  const nonEmpty = texts.filter((t) => (t.text ?? "").trim().length > 0)
  if (nonEmpty.length === 0) return {}

  try {
    const pythonResults = await runPythonBatch(nonEmpty)
    const merged: Record<string, HybridAiResult> = {}
    for (const t of nonEmpty) {
      merged[t.id] = pythonResults[t.id] ?? fallbackAnalyze(t.text)
    }
    return merged
  } catch (err) {
    console.warn(
      "[hybrid-ai] Python/RoBERTa unavailable, using TS heuristic fallback:",
      err instanceof Error ? err.message : err,
    )
    const fallback: Record<string, HybridAiResult> = {}
    for (const t of nonEmpty) {
      fallback[t.id] = fallbackAnalyze(t.text)
    }
    return fallback
  }
}
