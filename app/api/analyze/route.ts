import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { SubmissionInput } from "@/lib/analysis-report"
import { persistAnalysisReport } from "@/lib/analysis-report-persist"
import { getSubmittedSubmissionsForAssignment } from "@/lib/supabase/queries"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: { assignment_id?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const assignmentId = body.assignment_id
    if (!assignmentId || typeof assignmentId !== "string") {
      return NextResponse.json({ error: "assignment_id required" }, { status: 400 })
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

    const submissionsRaw = await getSubmittedSubmissionsForAssignment(
      assignmentId,
      supabase,
    )

    const submissions: SubmissionInput[] = submissionsRaw.map((s) => ({
      id: s.id,
      studentId: s.student_id,
      studentName:
        (s.student_name?.trim()?.length ?? 0) > 0
          ? (s.student_name as string).trim()
          : `Student_${s.student_id.slice(0, 8)}`,
      text: s.text ?? "",
    }))

    if (submissions.length === 0) {
      return NextResponse.json(
        { error: "No submissions for this assignment" },
        { status: 400 },
      )
    }

    const report = await persistAnalysisReport(supabase, assignmentId, submissions)
    return NextResponse.json({ report })
  } catch (e) {
    console.error("[api/analyze]", e)
    const message = e instanceof Error ? e.message : "Analysis failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
