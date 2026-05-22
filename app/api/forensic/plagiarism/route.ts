import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runPlagiarismGeminiScan } from "@/lib/plagiarism-gemini-python"
import type { PlagiarismWebReport } from "@/lib/plagiarism-web"
import {
  getAnalysisScoreForSubmission,
  updateAnalysisScorePlagiarism,
} from "@/lib/supabase/queries"

type JsonBody = Record<string, unknown>

interface SubmissionRow {
  text?: string | null
}

interface ScanSourceRow {
  url: string
  similarity_score: number
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

/** Python `scor` / `scor_maxim` may be 0–1 or 0–100; DB columns store percentage 0–100. */
function toPercent(value: number): number {
  if (value <= 0) return 0
  if (value <= 1) return Math.round(value * 1000) / 10
  return value
}

/** Collapse duplicate URLs (keeps highest similarity_score), newest-first order. */
function dedupeScanSources(rows: ScanSourceRow[]): ScanSourceRow[] {
  const byUrl = new Map<string, ScanSourceRow>()
  for (const row of rows) {
    const url = row.url.trim()
    if (!url) continue
    const score = Number(row.similarity_score)
    const prev = byUrl.get(url)
    if (!prev || score > Number(prev.similarity_score)) {
      byUrl.set(url, { url, similarity_score: score })
    }
  }
  return [...byUrl.values()].sort(
    (a, b) => b.similarity_score - a.similarity_score,
  )
}

/** Verdict from stored DB percentages only — never run plagiarism-web.ts amplification. */
function buildVerdictFromPercent(topScor: number): string {
  if (topScor >= 40) {
    return `❌ ALERTĂ DETECTATĂ: Text preluat de pe internet (Similitudine Cosinus: ${topScor.toFixed(1)}%).`
  }
  if (topScor >= 15) {
    return `❓ SUSPECT: Structură parțial similară sau parafrazare inteligentă (${topScor.toFixed(1)}%).`
  }
  return `✅ TEXT AUTENTIC: Text original în raport cu indexul public online.`
}

function reconstructReportFromScanSources(
  sources: ScanSourceRow[],
): PlagiarismWebReport {
  const deduped = dedupeScanSources(sources)
  const plagiarism_urls = deduped.map((row) => ({
    url: row.url,
    scor: Number(row.similarity_score),
  }))

  const topScor = plagiarism_urls[0]?.scor ?? 0

  return {
    verdict: buildVerdictFromPercent(topScor),
    scor_maxim: topScor / 100,
    sursa_principala: plagiarism_urls[0]?.url ?? null,
    plagiarism_urls,
  }
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

async function fetchExistingScanSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
): Promise<ScanSourceRow[]> {
  const { data, error } = await supabase
    .from("scan_sources")
    .select("url, similarity_score")
    .eq("submission_id", submissionId)
    .order("similarity_score", { ascending: false })

  if (error) throw error
  return dedupeScanSources((data ?? []) as ScanSourceRow[])
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
  analysisScoreId: string | null,
): Promise<void> {
  const seenUrls = new Set<string>()
  const rows: {
    submission_id: string
    url: string
    similarity_score: number
  }[] = []

  for (const hit of pythonResult.plagiarism_urls) {
    const url = hit.url.trim()
    const score = toPercent(hit.scor)
    if (!url || score <= 0) continue
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    rows.push({
      submission_id: submissionId,
      url,
      similarity_score: score,
    })
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("scan_sources")
      .insert(rows)

    if (insertError) throw insertError
  }

  const aiScorePercent = toPercent(pythonResult.scor_maxim)

  const { error: submissionUpdateError } = await supabase
    .from("submissions")
    .update({ analysed: true, ai_score: aiScorePercent })
    .eq("id", submissionId)

  if (submissionUpdateError) throw submissionUpdateError

  if (analysisScoreId) {
    await updateAnalysisScorePlagiarism(
      analysisScoreId,
      {
        verdict: pythonResult.verdict,
        scor_maxim: pythonResult.scor_maxim,
        sursa_principala: pythonResult.sursa_principala,
        plagiarism_urls: pythonResult.plagiarism_urls.map((hit) => ({
          url: hit.url,
          scor: hit.scor,
        })),
      },
      supabase,
    )
  }
}

/**
 * POST — web plagiarism scan with DB cache on scan_sources.
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

    // ── MODIFICARE AICI: Am eliminat coloana 'content' care nu exista în DB
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

    // ── 2. Cache check (skip when force === true) ─────────────────────────────
    if (!force) {
      try {
        const existingSources = await fetchExistingScanSources(
          supabase,
          submissionId,
        )

        if (existingSources.length > 0) {
          const cachedReport = reconstructReportFromScanSources(existingSources)
          return NextResponse.json(reportToJsonResponse(cachedReport, true))
        }
      } catch (cacheErr) {
        console.error(
          "[api/forensic/plagiarism] Cache lookup failed, continuing to fresh scan:",
          cacheErr,
        )
      }
    }

    // ── 3. Rescan / cache miss / force ───────────────────────────────────────
    try {
      await wipeScanSourcesForSubmission(supabase, submissionId)
    } catch (wipeErr) {
      console.error(
        "[api/forensic/plagiarism] Pre-scan wipe failed (aborting insert to avoid duplicates):",
        wipeErr,
      )
      return NextResponse.json(
        { error: "Could not clear previous scan results" },
        { status: 500 },
      )
    }

    const bodyText =
      typeof body.text === "string" ? body.text.trim() : ""
    
    // ── MODIFICARE AICI: Ne bazăm exclusiv pe text-ul valid din DB
    const text =
      bodyText ||
      (subRow.text ?? "").trim()

    if (!text) {
      return NextResponse.json(
        { error: "Submission has no text to scan" },
        { status: 400 },
      )
    }

    const pythonResult = await runPlagiarismGeminiScan(text, submissionId)

    try {
      const scoreRow = await getAnalysisScoreForSubmission(
        assignmentId,
        submissionId,
        supabase,
      )
      await persistFreshScan(
        supabase,
        submissionId,
        pythonResult,
        scoreRow?.id ?? null,
      )
    } catch (dbErr) {
      console.error("[api/forensic/plagiarism] DB persist failed:", dbErr)
    }

    return NextResponse.json(reportToJsonResponse(pythonResult, false))
  } catch (e) {
    console.error("[api/forensic/plagiarism]", e)
    const message = e instanceof Error ? e.message : "Plagiarism scan failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}