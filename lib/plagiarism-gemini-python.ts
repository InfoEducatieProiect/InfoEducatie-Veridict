import "server-only"

import { spawn } from "child_process"
import path from "path"
import {
  parsePlagiarismWebReport,
  type PlagiarismWebReport,
} from "./plagiarism-web"

const PYTHON_TIMEOUT_MS = Number(
  process.env.PLAGIARISM_PYTHON_TIMEOUT_MS ?? 90_000,
)
const PYTHON_BIN = process.env.PYTHON_PATH ?? "python"

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "detectie_plagiat_gemini.py")
}

function resolveGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    ""
  )
}

function pythonEnv(): NodeJS.ProcessEnv {
  const geminiKey = resolveGeminiApiKey()
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    GEMINI_API_KEY: geminiKey,
    NEXT_PUBLIC_GEMINI_API_KEY:
      process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() || geminiKey,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY?.trim() || geminiKey,
  }
}

export function runPlagiarismGeminiScan(
  text: string,
  submissionId?: string,
): Promise<PlagiarismWebReport> {
  return new Promise((resolve, reject) => {
    const trimmed = (text ?? "").trim()
    if (!trimmed) {
      reject(new Error("empty_text"))
      return
    }

    const geminiKey = resolveGeminiApiKey()
    if (!geminiKey) {
      reject(
        new Error(
          "GEMINI_API_KEY missing in server environment (.env.local). Plagiarism scan cannot run.",
        ),
      )
      return
    }

    const child = spawn(PYTHON_BIN, [scriptPath(), "--stdin"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: pythonEnv(),
    })

    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(
        new Error(`Plagiarism scanner timed out after ${PYTHON_TIMEOUT_MS}ms`),
      )
    }, PYTHON_TIMEOUT_MS)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: string | Buffer) => {
      const line = typeof chunk === "string" ? chunk : chunk.toString("utf8")
      stderr += line
      if (line.includes("[plagiat]")) {
        console.warn("[plagiarism-python]", line.trim())
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
            `Plagiarism script exited ${code}${stderr ? `: ${stderr.slice(-800)}` : ""}`,
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
        const report = parsePlagiarismWebReport(parsed)
        if (!report) {
          reject(new Error("Invalid plagiarism JSON from Python"))
          return
        }
        resolve(report)
      } catch (e) {
        reject(
          new Error(
            `Failed to parse plagiarism output: ${e instanceof Error ? e.message : String(e)}. stderr: ${stderr.slice(-400)}`,
          ),
        )
      }
    })

    child.stdin.write(
      JSON.stringify({
        text: trimmed,
        ...(submissionId ? { submission_id: submissionId } : {}),
      }),
    )
    child.stdin.end()
  })
}
