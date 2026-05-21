import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runPlagiarismGeminiScan } from "@/lib/plagiarism-gemini-python"
import {
  isPlagiarismCacheValid,
  parsePlagiarismWebReport,
} from "@/lib/plagiarism-web"
import {
  getAnalysisScoreForSubmission,
  updateAnalysisScorePlagiarism,
} from "@/lib/supabase/queries"

/**
 * POST — run Gemini global web plagiarism for one submission and persist
 * to analysis_scores.plagiarism_urls.
 *
 * Body: { assignment_id: string, submission_id: string, force?: boolean }
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

    let body: {
      assignment_id?: string
      submission_id?: string
      force?: boolean
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const assignmentId = body.assignment_id
    const submissionId = body.submission_id
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

    if (!body.force && scoreRow.plagiarism_urls) {
      const cached = parsePlagiarismWebReport(scoreRow.plagiarism_urls)
      if (cached && isPlagiarismCacheValid(cached)) {
        return NextResponse.json({ report: cached, cached: true })
      }
    }

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("id, text, assignment_id")
      .eq("id", submissionId)
      .eq("assignment_id", assignmentId)
      .maybeSingle()

    if (subErr) throw subErr
    if (!submission?.text?.trim()) {
      return NextResponse.json({ error: "Submission has no text" }, { status: 400 })
    }

    const report = await runPlagiarismGeminiScan(submission.text)
    const dbPayload = {
      verdict: report.verdict,
      scor_maxim: report.scor_maxim,
      sursa_principala: report.sursa_principala,
      plagiarism_urls: report.plagiarism_urls.map((u) => ({
        url: u.url,
        scor: u.scor,
      })),
    }
    await updateAnalysisScorePlagiarism(scoreRow.id, dbPayload, supabase)

    return NextResponse.json({ report, cached: false })
  } catch (e) {
    console.error("[api/forensic/plagiarism]", e)
    const message = e instanceof Error ? e.message : "Plagiarism scan failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
