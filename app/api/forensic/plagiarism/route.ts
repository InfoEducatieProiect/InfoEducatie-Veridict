import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runPlagiarismGeminiScan } from "@/lib/plagiarism-gemini-python"
import type { PlagiarismWebReport } from "@/lib/plagiarism-web"
import {
  fetchScanSourcesForSubmission,
  maxSimilarityFromRows,
  plagiarismReportFromScanSources,
  plagiarismScorToPercent,
} from "@/lib/plagiarism-scan-sources"

type JsonBody = Record<string, unknown>

interface SubmissionRow {
  text?: string | null
}

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

function readForceFlag(body: JsonBody): boolean {
  return body.force === true
}

function reportToJsonResponse(report: PlagiarismWebReport, fromDb: boolean) {
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
    fromDb,
  }
}

async function wipeScanSourcesForSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("scan_sources")
    .delete()
    .eq("submission_id", submissionId)

  if (error) throw error
}

async function persistFreshScan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  pythonResult: PlagiarismWebReport,
): Promise<void> {
  const seenUrls = new Set<string>()
  const rows: {
    submission_id: string
    url: string
    similarity_score: number
  }[] = []

  for (const hit of pythonResult.plagiarism_urls) {
    const url = hit.url.trim()
    const score = plagiarismScorToPercent(hit.scor)
    if (!url || score <= 0) continue
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    rows.push({ submission_id: submissionId, url, similarity_score: score })
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("scan_sources")
      .upsert(rows, {
        onConflict: "submission_id,url",
        ignoreDuplicates: false,
      })

    if (insertError) throw insertError
  }

  const aiScorePercent = plagiarismScorToPercent(pythonResult.scor_maxim)

  const { error: submissionUpdateError } = await supabase
    .from("submissions")
    .update({ analysed: true, ai_score: aiScorePercent })
    .eq("id", submissionId)

  if (submissionUpdateError) throw submissionUpdateError
}

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

    const force = readForceFlag(body)
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
      .select("id, text, assignment_id")
      .eq("id", submissionId)
      .eq("assignment_id", assignmentId)
      .maybeSingle()

    if (subErr) throw subErr
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 })
    }

    const subRow = submission as SubmissionRow

    let existingSources: Awaited<ReturnType<typeof fetchScanSourcesForSubmission>> = []
    try {
      existingSources = await fetchScanSourcesForSubmission(supabase, submissionId)
    } catch (cacheErr) {
      console.error("[api/forensic/plagiarism] Cache lookup failed:", cacheErr)
    }

    if (!force && existingSources.length > 0) {
      const cachedReport = plagiarismReportFromScanSources(existingSources)
      return NextResponse.json(reportToJsonResponse(cachedReport, true))
    }

    const oldMax = maxSimilarityFromRows(existingSources)

    const bodyText = typeof body.text === "string" ? body.text.trim() : ""
    const text = bodyText || (subRow.text ?? "").trim()

    if (!text) {
      return NextResponse.json(
        { error: "Submission has no text to scan" },
        { status: 400 },
      )
    }

    const pythonResult = await runPlagiarismGeminiScan(text, submissionId)

    const newMax = plagiarismScorToPercent(
      Math.max(0, ...pythonResult.plagiarism_urls.map((h) => h.scor)),
    )

    const hasNewResults = pythonResult.plagiarism_urls.length > 0 && newMax > 0

    if (!hasNewResults) {
      if (existingSources.length > 0) {
        const cachedReport = plagiarismReportFromScanSources(existingSources)
        return NextResponse.json(reportToJsonResponse(cachedReport, true))
      }
      return NextResponse.json(reportToJsonResponse(pythonResult, false))
    }

    if (newMax > oldMax || existingSources.length === 0) {
      try {
        await wipeScanSourcesForSubmission(supabase, submissionId)
      } catch (wipeErr) {
        console.error("[api/forensic/plagiarism] Pre-persist wipe failed:", wipeErr)
      }
      try {
        await persistFreshScan(supabase, submissionId, pythonResult)
      } catch (dbErr) {
        console.error("[api/forensic/plagiarism] DB persist failed:", dbErr)
      }
      return NextResponse.json(reportToJsonResponse(pythonResult, false))
    }

    const cachedReport = plagiarismReportFromScanSources(existingSources)
    return NextResponse.json(reportToJsonResponse(cachedReport, true))
  } catch (e) {
    console.error("[api/forensic/plagiarism]", e)
    const message = e instanceof Error ? e.message : "Plagiarism scan failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
