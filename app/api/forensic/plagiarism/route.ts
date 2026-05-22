import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runPlagiarismGeminiScan } from "@/lib/plagiarism-gemini-python"
import type { PlagiarismWebReport } from "@/lib/plagiarism-web"
import {
  getAnalysisScoreForSubmission,
  updateAnalysisScorePlagiarism,
} from "@/lib/supabase/queries"

type JsonBody = Record<string, unknown>

function readStringField(
  body: JsonBody,
  snake: string,
  camel: string,
): string | undefined {
  const raw = body[snake] ?? body[camel]
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Python `scor` / `scor_maxim` may be 0–1 or 0–100; DB stores percentage in similarity_score / ai_score. */
function toPercent(value: number): number {
  if (value <= 0) return 0
  if (value <= 1) return Math.round(value * 1000) / 10
  return value
}

function reportToJsonResponse(report: PlagiarismWebReport) {
  return {
    report: {
      verdict: report.verdict,
      scor_maxim: report.scor_maxim,
      sursa_principala: report.sursa_principala,
      plagiarism_urls: report.plagiarism_urls.map((hit) => ({
        url: hit.url,
        scor: hit.scor,
      })),
    },
    fromDb: false as const,
  }
}

async function persistPlagiarismResult(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  pythonResult: PlagiarismWebReport,
  analysisScoreId: string | null,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("scan_sources")
    .delete()
    .eq("submission_id", submissionId)

  if (deleteError) throw deleteError

  const rows = pythonResult.plagiarism_urls
    .filter((hit) => hit.url.trim().length > 0 && hit.scor > 0)
    .map((hit) => ({
      submission_id: submissionId,
      url: hit.url.trim(),
      similarity_score: toPercent(hit.scor),
    }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("scan_sources")
      .insert(rows)

    if (insertError) throw insertError
  }

  const plagiarismPayload = {
    verdict: pythonResult.verdict,
    scor_maxim: pythonResult.scor_maxim,
    sursa_principala: pythonResult.sursa_principala,
    plagiarism_urls: pythonResult.plagiarism_urls.map((hit) => ({
      url: hit.url,
      scor: hit.scor,
    })),
  }

  if (analysisScoreId) {
    await updateAnalysisScorePlagiarism(
      analysisScoreId,
      plagiarismPayload,
      supabase,
    )
  }

  const aiScorePercent = toPercent(pythonResult.scor_maxim)
  const { error: submissionUpdateError } = await supabase
    .from("submissions")
    .update({ ai_score: aiScorePercent, analysed: true })
    .eq("id", submissionId)

  if (submissionUpdateError) throw submissionUpdateError
}

/**
 * POST — run Gemini global web plagiarism for one submission and persist
 * hits to scan_sources (+ mirror summary on analysis_scores / submissions).
 *
 * Body: { assignment_id|assignmentId, submission_id|submissionId, text?, force? }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: JsonBody
    try {
      body = (await request.json()) as JsonBody
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const assignmentId = readStringField(body, "assignment_id", "assignmentId")
    const submissionId = readStringField(body, "submission_id", "submissionId")
    if (!assignmentId || !submissionId) {
      return NextResponse.json(
        { error: "assignment_id and submission_id required" },
        { status: 400 },
      )
    }

    const { data: assignmentRow, error: assnErr } = await supabase
      .from("assignments")
      .select("id, professor_id")
      .eq("id", assignmentId)
      .maybeSingle()

    if (assnErr) throw assnErr
    if (!assignmentRow) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }
    if (assignmentRow.professor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("assignment_id", assignmentId)
      .maybeSingle()

    if (subErr) throw subErr
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 })
    }

    const subRow = submission as {
      text?: string | null
      content?: string | null
    }
    const bodyText =
      typeof body.text === "string" ? body.text.trim() : ""
    const text =
      bodyText ||
      (subRow.text ?? "").trim() ||
      (subRow.content ?? "").trim()

    if (!text) {
      return NextResponse.json(
        { error: "Submission has no text to scan" },
        { status: 400 },
      )
    }

    const scoreRow = await getAnalysisScoreForSubmission(
      assignmentId,
      submissionId,
      supabase,
    )

    const pythonResult = await runPlagiarismGeminiScan(text, submissionId)

    try {
      await persistPlagiarismResult(
        supabase,
        submissionId,
        pythonResult,
        scoreRow?.id ?? null,
      )
    } catch (dbErr) {
      console.error("[api/forensic/plagiarism] DB persist failed:", dbErr)
    }

    return NextResponse.json(reportToJsonResponse(pythonResult))
  } catch (e) {
    console.error("[api/forensic/plagiarism]", e)
    const message = e instanceof Error ? e.message : "Plagiarism scan failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
