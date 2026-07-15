import "server-only"

import { spawn } from "child_process"
import path from "path"
import {
  analizeazaTextComplet,
  detecteazaLimba,
  mergePythonResult,
  type HybridAiResult,
} from "./hybrid-ai-detection"

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

function emptyResult(id: string): HybridAiResult {
  return {
    id,
    scor_combinat_ai: 0,
    probabilitate_roberta_bruta: 0,
    probabilitate_roberta: 0,
    burstiness: 0,
    amprente: 0,
    densitate_amprente: 0,
    scor_structura: 0,
    greutate_roberta: 0,
    greutate_heuristic: 0,
    limba_detectata: "ro",
    limba_slaba_pentru_roberta: true,
    scut_artistic_activ: false,
    scut_enciclopedic_activ: false,
    source: "typescript_fallback",
    error: "empty_text",
  }
}

export type AiProgressCallback = (done: number, total: number) => void

function runPythonBatch(
  texts: TextAnalysisInput[],
  onProgress?: AiProgressCallback,
): Promise<Record<string, HybridAiResult>> {
  return new Promise((resolve, reject) => {
    const script = scriptPath()
    const child = spawn(PYTHON_BIN, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TOKENIZERS_PARALLELISM: "false" },
    })

    let stdout = ""
    let stderr = ""
    let stderrLineBuf = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Python AI detector timed out after ${PYTHON_TIMEOUT_MS}ms`))
    }, PYTHON_TIMEOUT_MS)

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      // Parse "[progress] done/total" lines as they stream in.
      stderrLineBuf += text
      const lines = stderrLineBuf.split(/\r?\n/)
      stderrLineBuf = lines.pop() ?? ""
      if (onProgress) {
        for (const line of lines) {
          const m = line.match(/\[progress\]\s+(\d+)\/(\d+)/)
          if (m) onProgress(Number(m[1]), Number(m[2]))
        }
      }
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
          results?: Array<Record<string, unknown>>
          error?: string
        }
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }

        const out: Record<string, HybridAiResult> = {}
        const rows = Array.isArray(parsed.results) ? parsed.results : []

        for (const row of rows) {
          const id = String(row.id ?? "")
          if (!id) continue

          if (row.error) {
            const input = texts.find((x) => x.id === id)
            if (input?.text.trim()) {
              const fb = fallbackAnalyze(input.text)
              out[id] = { ...fb, id, error: String(row.error) }
            } else {
              out[id] = emptyResult(id)
            }
            continue
          }

          out[id] = mergePythonResult({ ...row, id })
        }

        for (const item of texts) {
          if (!out[item.id]) {
            out[item.id] = item.text.trim()
              ? { ...fallbackAnalyze(item.text), id: item.id }
              : emptyResult(item.id)
          }
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
 * Falls back to TypeScript ensemble if Python/RoBERTa is unavailable.
 * `onProgress(done, total)` fires per submission as the Python detector streams
 * progress on stderr (used for the real "3/12" analysis counter).
 */
export async function runHybridAiBatch(
  texts: TextAnalysisInput[],
  onProgress?: AiProgressCallback,
): Promise<Record<string, HybridAiResult>> {
  const nonEmpty = texts.filter((t) => (t.text ?? "").trim().length > 0)
  if (nonEmpty.length === 0) return {}

  try {
    const pythonResults = await runPythonBatch(nonEmpty, onProgress)
    const merged: Record<string, HybridAiResult> = {}
    for (const t of nonEmpty) {
      merged[t.id] =
        pythonResults[t.id] ?? { ...fallbackAnalyze(t.text), id: t.id }
    }
    onProgress?.(nonEmpty.length, nonEmpty.length)
    return merged
  } catch (err) {
    console.warn(
      "[hybrid-ai] Python/RoBERTa unavailable, using TS ensemble fallback:",
      err instanceof Error ? err.message : err,
    )
    const fallback: Record<string, HybridAiResult> = {}
    for (const t of nonEmpty) {
      fallback[t.id] = { ...fallbackAnalyze(t.text), id: t.id }
    }
    onProgress?.(nonEmpty.length, nonEmpty.length)
    return fallback
  }
}
