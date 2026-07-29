import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  mapDocumentsToSubmissionInputs,
  mapRowsToAnalyzableDocuments,
  type RawAnalyzableRow,
} from "@/lib/analysis-ai-mapper"
import { persistAnalysisReport } from "@/lib/analysis-report-persist"
import { getSubmittedSubmissionsForAssignment } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

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

    const rawRows: RawAnalyzableRow[] = submissionsRaw.map((s) => ({
      id: s.id,
      author_id: s.student_id,
      author_name: s.student_name ?? null,
      body: s.text ?? null,
      submitted_at: s.submitted_at ?? null,
    }))

    const documents = mapRowsToAnalyzableDocuments(rawRows, {
      requireSubmitted: true,
    })

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error:
            "No submitted documents with analyzable text for this assignment",
        },
        { status: 400 },
      )
    }

    const submissions = mapDocumentsToSubmissionInputs(documents)

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
        try {
          send({ type: "progress", done: 0, total: submissions.length })
          const report = await persistAnalysisReport(
            supabase,
            assignmentId,
            submissions,
            (done, total) => send({ type: "progress", done, total }),
          )
          send({ type: "report", report })
        } catch (e) {
          console.error("[api/analyze-ai] stream", e)
          send({
            type: "error",
            error: e instanceof Error ? e.message : "Analysis failed",
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (e) {
    console.error("[api/analyze-ai]", e)
    const message = e instanceof Error ? e.message : "Analysis failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
