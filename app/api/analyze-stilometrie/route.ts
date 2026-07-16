import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runStylometryAnalysis } from "@/lib/stylometry-server"
import { getAnalysisScoreForSubmission } from "@/lib/supabase/queries"

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

/**
 * POST — spaCy stylometric analysis for one submission.
 *
 * Body: {
 *   assignment_id|assignmentId,
 *   analysis_score_id|analysisScoreId,
 *   student_id|studentId,
 *   submission_id|submissionId,
 *   text?
 * }
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
    let analysisScoreId = readStringField(
      body,
      "analysis_score_id",
      "analysisScoreId",
    )
    let studentId = readStringField(body, "student_id", "studentId")
    let submissionId = readStringField(body, "submission_id", "submissionId")

    if (!assignmentId || !submissionId) {
      return NextResponse.json(
        { error: "assignment_id and submission_id required" },
        { status: 400 },
      )
    }

    let assignmentRow: { id: string; professor_id: string; type?: string } | null = null
    {
      let res = await supabase
        .from("assignments")
        .select("id, professor_id, type")
        .eq("id", assignmentId)
        .maybeSingle()
      // Backward-compat: retry without `type` if the column hasn't been migrated yet.
      if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
        res = await supabase
          .from("assignments")
          .select("id, professor_id")
          .eq("id", assignmentId)
          .maybeSingle()
      }
      if (res.error) throw res.error
      assignmentRow = res.data
    }

    if (!assignmentRow) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }
    if (assignmentRow.professor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("id, student_id, text, assignment_id")
      .eq("id", submissionId)
      .eq("assignment_id", assignmentId)
      .maybeSingle()

    if (subErr) throw subErr
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 })
    }

    studentId = studentId ?? submission.student_id

    if (!analysisScoreId) {
      const scoreRow = await getAnalysisScoreForSubmission(
        assignmentId,
        submissionId,
        supabase,
      )
      if (!scoreRow) {
        return NextResponse.json(
          {
            error:
              "No analysis_scores row for this submission. Run AI analysis first.",
          },
          { status: 400 },
        )
      }
      analysisScoreId = scoreRow.id
    }

    if (!studentId || !analysisScoreId) {
      return NextResponse.json(
        { error: "student_id and analysis_score_id required" },
        { status: 400 },
      )
    }

    const bodyText =
      typeof body.text === "string" ? body.text.trim() : ""
    const text = bodyText || (submission.text ?? "").trim()

    if (!text) {
      return NextResponse.json(
        { error: "Submission has no text to analyze" },
        { status: 400 },
      )
    }

    const assignmentType = assignmentRow.type === "test" ? "test" : "tema"

    const result = await runStylometryAnalysis(
      analysisScoreId,
      studentId,
      submissionId,
      text,
      supabase,
      assignmentType,
    )

    return NextResponse.json({
      /** Lucrarea curentă → `analysis_scores` */
      metrics: result.metrics,
      deviation: result.deviation,
      /** Amprenta istorică → `student_baselines` (strict read-only la analiză) */
      historic_baseline: result.historic_baseline,
      baseline_used: result.baseline_used,
      /** true = lipsă rând în `student_baselines`; nu implică scriere în DB */
      baseline_initialized: result.baseline_initialized,
      verdict: result.verdict,
      analysis_score_id: result.analysis_score_id,
      student_id: result.student_id,
      submission_id: result.submission_id,
    })
  } catch (e) {
    console.error("[api/analyze-stilometrie]", e)
    const message =
      e instanceof Error ? e.message : "Stylometric analysis failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
