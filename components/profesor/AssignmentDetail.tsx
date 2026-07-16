"use client"

import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Brain, ArrowLeft, Calendar, CheckCircle2, Clock, Eye, Search,
  Paperclip, ExternalLink, ChevronLeft, ChevronRight, Loader2, RefreshCw,
} from "lucide-react"
import useSWR, { mutate } from "swr"
import { createClient } from "@/lib/supabase/client"
import { loadAnalysisReportForAssignment } from "@/lib/analysis-report"
import { useLanguage } from "@/lib/i18n/language-provider"
import {
  type Assignment, type AnalysisReport, type StudentScore, type Submission,
  RISK_BRACKET_DEFS, ROWS_PER_PAGE, aiColor, aiLabel,
} from "./types"
import TextPreviewer from "./TextPreviewer"
import AiAnalysisOverlay from "./AiAnalysisOverlay"
import KPICards from "./KPICards"
import RiskDistributionChart from "./RiskDistributionChart"

async function fetchSubmissionsForAssignment(assignmentId: string): Promise<Submission[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("submissions")
    .select("*, profiles!submissions_student_id_fkey(display_name)")
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false })
  if (error) throw error
  return (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    student_name: (s.profiles as { display_name?: string } | null)?.display_name,
  })) as Submission[]
}

async function fetchStudentsByClass(classId: string): Promise<{ id: string; display_name: string }[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("class_id", classId)
    .eq("role", "elev")
    .order("display_name")
  if (error) throw error
  return data || []
}

interface AssignmentDetailProps {
  assignment: Assignment
  analysisReports: Record<string, AnalysisReport>
  setAnalysisReports: React.Dispatch<React.SetStateAction<Record<string, AnalysisReport>>>
  onBack: () => void
  onOpenForensic: (
    studentName: string,
    score: StudentScore,
    assignmentId: string,
    submissionId: string,
    submissionTexts: Record<string, string>,
    studentIdFromSubmission?: string,
  ) => void
  /** Clicking "Detalii" only sets the URL; the URL then drives the forensic open. */
  onRequestForensic: (submissionId: string) => void
  /** ?sub from the URL — auto-opens the forensic view once data has loaded. */
  requestedSubmissionId?: string
  showReport: boolean
  setShowReport: (v: boolean | ((prev: boolean) => boolean)) => void
}

export default function AssignmentDetail({
  assignment,
  analysisReports,
  setAnalysisReports,
  onBack,
  onOpenForensic,
  onRequestForensic,
  requestedSubmissionId,
  showReport,
  setShowReport,
}: AssignmentDetailProps) {
  const { t, dateLocale } = useLanguage()
  const { data: submissions = [] } = useSWR(`submissions-${assignment.id}`, () => fetchSubmissionsForAssignment(assignment.id), { revalidateOnFocus: false })
  const { data: classStudents = [] } = useSWR(`students-${assignment.class_id}`, () => fetchStudentsByClass(assignment.class_id), { revalidateOnFocus: false })

  const [isAnalysing, setIsAnalysing] = useState(false)
  const [isBulkAnalysing, setIsBulkAnalysing] = useState(false)
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null)
  const [previewing, setPreviewing] = useState<{ studentName: string; fileName: string; text: string } | null>(null)
  const [page, setPage] = useState(0)
  const [chartFilter, setChartFilter] = useState<string | null>(null)

  const report = analysisReports[assignment.id] ?? null
  const hasReport = !!report

  const assnSubs = submissions.map((s) => ({
    ...s,
    studentName: s.student_name || "Unknown",
    assignmentId: s.assignment_id,
    fileName: s.file_name || "text",
    text: s.text || "",
    submittedAt: s.submitted_at,
  }))

  const studentNames = classStudents.map((s) => s.display_name)
  const submittedNames = new Set(assnSubs.map((s) => s.studentName))
  const notSubmitted = studentNames.filter((name) => !submittedNames.has(name))

  const submissionTexts = useMemo(() => {
    const texts: Record<string, string> = {}
    for (const sub of assnSubs) texts[sub.studentName] = sub.text || ""
    return texts
  }, [assnSubs])

  const allRows = useMemo(() => {
    const submitted = assnSubs.map((s) => ({ type: "submitted" as const, ...s }))
    const missing = notSubmitted.map((name) => ({ type: "missing" as const, studentName: name }))
    return [...submitted, ...missing]
  }, [assnSubs, notSubmitted])

  const filteredRows = useMemo(() => {
    if (!chartFilter || !report) return allRows
    const bracket = RISK_BRACKET_DEFS.find((b) => b.key === chartFilter)
    if (!bracket) return allRows
    return allRows.filter((row) => {
      if (row.type === "missing") return false
      const rScore = report.scores[row.studentName]
      if (!rScore) return false
      return rScore.aiScore >= bracket.min && rScore.aiScore <= bracket.max
    })
  }, [allRows, chartFilter, report])

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  const paginatedRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)

  useEffect(() => { setPage(0) }, [chartFilter])

  useEffect(() => {
    let cancelled = false
    loadAnalysisReportForAssignment(assignment.id).then((saved) => {
      if (cancelled || !saved) return
      setAnalysisReports((prev) => ({ ...prev, [assignment.id]: saved }))
    })
    return () => { cancelled = true }
  }, [assignment.id, setAnalysisReports])

  // Cold deep-link / Back-Forward: when the URL carries ?sub, open the forensic
  // view for that submission as soon as the report + submissions have loaded.
  // Reuses the exact data path the "Detalii" button feeds, so no duplication.
  const [autoOpenedSub, setAutoOpenedSub] = useState<string | null>(null)
  useEffect(() => {
    if (!requestedSubmissionId) { setAutoOpenedSub(null); return }
    if (autoOpenedSub === requestedSubmissionId) return
    if (!report) return
    const target = submissions.find((s) => s.id === requestedSubmissionId)
    if (!target) return
    const studentName = target.student_name || "Unknown"
    const rScore = report.scores[studentName]
    if (!rScore) return
    setShowReport(true)
    onOpenForensic(studentName, rScore, assignment.id, target.id, submissionTexts, target.student_id)
    setAutoOpenedSub(requestedSubmissionId)
  }, [requestedSubmissionId, autoOpenedSub, report, submissions, submissionTexts, assignment.id, onOpenForensic, setShowReport])

  const isAnalyzed = hasReport && showReport

  const handleAiClick = () => {
    if (hasReport) { setShowReport((v) => !v); return }
    if (assnSubs.length === 0) return
    setIsAnalysing(true)
  }

  const runAiAnalysis = async (): Promise<AnalysisReport | null> => {
    try {
      const res = await fetch("/api/analyze-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignment.id }),
      })
      // Validation/auth failures come back as plain JSON (non-2xx, not a stream).
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || res.statusText)
      }

      // Success = NDJSON stream: {type:"progress"|"report"|"error", ...} per line.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let finalReport: AnalysisReport | null = null
      let streamError: string | null = null

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: { type?: string; done?: number; total?: number; report?: AnalysisReport; error?: string }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.type === "progress") {
            setAiProgress({ done: evt.done ?? 0, total: evt.total ?? 0 })
          } else if (evt.type === "report") {
            finalReport = evt.report ?? null
          } else if (evt.type === "error") {
            streamError = evt.error ?? "Analysis failed"
          }
        }
      }

      if (streamError) throw new Error(streamError)
      if (!finalReport) throw new Error("Missing report in response")
      setAnalysisReports((prev) => ({ ...prev, [assignment.id]: finalReport! }))
      mutate(`submissions-${assignment.id}`)
      return finalReport
    } catch (err) {
      console.error("[Veridict] Analysis failed:", err)
      return null
    } finally {
      setAiProgress(null)
    }
  }

  const runBulkAnalysis = async () => {
    if (assnSubs.length === 0 || isAnalysing || isBulkAnalysing) return
    setIsBulkAnalysing(true)
    try {
      // /api/analyze-ai now returns the full report (AI + similarity + batched
      // spaCy stylometry) in one request — no per-student stylometry loop.
      const currentReport = (await runAiAnalysis()) ?? analysisReports[assignment.id] ?? (await loadAnalysisReportForAssignment(assignment.id))
      if (!currentReport) throw new Error("Nu s-a putut genera raportul de analiză")
      setAnalysisReports((prev) => ({ ...prev, [assignment.id]: currentReport }))
      setShowReport(true)
    } catch (err) {
      console.error("[Veridict] Bulk analysis failed:", err)
    } finally {
      setIsBulkAnalysing(false)
    }
  }

  const handleAnalysisDone = async () => {
    try {
      const nextReport = (await runAiAnalysis()) ?? analysisReports[assignment.id] ?? (await loadAnalysisReportForAssignment(assignment.id))
      if (nextReport) {
        setAnalysisReports((prev) => ({ ...prev, [assignment.id]: nextReport }))
      }
      setShowReport(true)
    } catch (err) {
      console.error("[Veridict] Analysis failed:", err)
    } finally {
      setIsAnalysing(false)
    }
  }

  const tableHeaderDefs = hasReport && showReport
    ? [
        { id: "student", label: t("dashboardProfesor.colStudent") },
        { id: "class", label: t("dashboardProfesor.colClass") },
        { id: "date", label: t("dashboardProfesor.colDate") },
        { id: "status", label: t("dashboardProfesor.colStatus") },
        { id: "aiScore", label: t("dashboardProfesor.colAiScore") },
        { id: "similarity", label: t("dashboardProfesor.colSimilarity") },
        { id: "stylometric", label: t("dashboardProfesor.colStylometric") },
        { id: "actions", label: t("dashboardProfesor.colActions") },
      ]
    : [
        { id: "student", label: t("dashboardProfesor.colStudent") },
        { id: "class", label: t("dashboardProfesor.colClass") },
        { id: "date", label: t("dashboardProfesor.colDate") },
        { id: "status", label: t("dashboardProfesor.colStatus") },
        { id: "actions", label: t("dashboardProfesor.colActions") },
      ]

  return (
    <div className="flex flex-col gap-6">
      {previewing && (
        <TextPreviewer studentName={previewing.studentName} fileName={previewing.fileName} text={previewing.text} onClose={() => setPreviewing(null)} />
      )}

      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100" style={{ color: "var(--dash-muted)" }}>
          <ArrowLeft size={14} aria-hidden="true" />{t("dashboardProfesor.backToAssignments")}
        </button>
      </div>

      <div className="rounded-2xl border p-6" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                {t("dashboardProfesor.classLabel", { code: assignment.class_code ?? "" })}
              </span>
            </div>
            <h2 className="text-lg font-bold" style={{ color: "var(--dash-fg)" }}>{assignment.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>{assignment.requirement}</p>
            {assignment.details && <p className="mt-1 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.details}</p>}
          </div>
          <div className="mt-3 flex items-center gap-1.5 shrink-0 sm:mt-0">
            <Calendar size={13} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
            <span className="text-xs" style={{ color: "var(--dash-muted)" }}>
              {t("dashboardProfesor.deadline")}{" "}
              <span className="font-semibold" style={{ color: "var(--dash-fg)" }}>
                {(() => {
                  const d = new Date(assignment.deadline)
                  const datePart = d.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" })
                  const timePart = assignment.deadline.includes("T") ? d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) : "23:59"
                  return `${datePart}, ${t("dashboardProfesor.atTime")} ${timePart}`
                })()}
              </span>
            </span>
          </div>
        </div>
      </div>

      {assignment.additional_url && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 rounded-2xl border p-5"
          style={{ background: "rgba(59,130,246,0.04)", borderColor: "rgba(59,130,246,0.2)" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.1)" }}>
            <Paperclip size={18} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--dash-accent)" }}>{t("dashboardProfesor.supportMaterial")}</p>
            <p className="text-sm font-semibold truncate" style={{ color: "var(--dash-fg)" }}>{assignment.additional_filename ?? t("dashboardProfesor.supportDoc")}</p>
          </div>
          <a href={assignment.additional_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all hover:shadow-sm shrink-0"
            style={{ borderColor: "var(--dash-accent)", color: "var(--dash-accent)", background: "rgba(59,130,246,0.06)" }}>
            <ExternalLink size={12} aria-hidden="true" />{t("dashboardProfesor.viewBtn")}
          </a>
        </motion.div>
      )}

      <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        <AnimatePresence>
          {isAnalysing && <AiAnalysisOverlay onDone={handleAnalysisDone} progress={aiProgress} />}
          {isBulkAnalysing && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/75 backdrop-blur-sm" role="status" aria-live="polite">
              <Loader2 size={32} className="animate-spin" style={{ color: "var(--dash-navy)" }} />
              <p className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.rerunningStatus")}</p>
              {aiProgress && aiProgress.total > 0 && (
                <>
                  <p className="text-xs" style={{ color: "var(--dash-muted)" }}>
                    {aiProgress.done >= aiProgress.total
                      ? t("dashboardProfesor.rerunningFinalizing")
                      : t("dashboardProfesor.rerunningProgress", { done: aiProgress.done, total: aiProgress.total })}
                  </p>
                  <div className="h-1.5 w-40 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((Math.min(aiProgress.done, aiProgress.total) / aiProgress.total) * 100)}%`, background: "var(--dash-navy)" }} />
                  </div>
                </>
              )}
            </div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--dash-border)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.tableTitle", { code: assignment.class_code ?? "" })}</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--dash-muted)" }}>
              {t("dashboardProfesor.tableSent", { n: assnSubs.length })} &middot; {t("dashboardProfesor.tableNotSent", { n: notSubmitted.length })}
              {hasReport && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
                  {t("dashboardProfesor.analysed")}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasReport && (
              <button type="button" onClick={() => void runBulkAnalysis()} disabled={isAnalysing || isBulkAnalysing || assnSubs.length === 0}
                className="flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)", background: "rgba(59,130,246,0.06)" }}
                title={t("dashboardProfesor.rerunTitle")}>
                {isBulkAnalysing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                {isBulkAnalysing
                  ? (aiProgress && aiProgress.total > 0
                      ? `${t("dashboardProfesor.rerunning")} ${Math.min(aiProgress.done, aiProgress.total)}/${aiProgress.total}`
                      : t("dashboardProfesor.rerunning"))
                  : t("dashboardProfesor.rerunAll")}
              </button>
            )}
            <button onClick={handleAiClick} disabled={isAnalysing || isBulkAnalysing || assnSubs.length === 0}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              style={{ background: hasReport ? (showReport ? "#10B981" : "var(--dash-navy)") : "var(--dash-navy)" }}
              title={assnSubs.length === 0 ? t("dashboardProfesor.noSubmissionTitle") : undefined}>
              <Brain size={14} aria-hidden="true" />
              {isAnalysing ? t("dashboardProfesor.analyzing") : hasReport ? (showReport ? t("dashboardProfesor.hideReport") : t("dashboardProfesor.showReport")) : t("dashboardProfesor.launchAnalysis")}
            </button>
          </div>
        </div>

        <div>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr style={{ background: "rgba(0,31,63,0.03)", borderBottom: "1px solid var(--dash-border)" }}>
                {tableHeaderDefs.map((h) => {
                  let widthClass = "w-auto"
                  if (h.id === "student") widthClass = hasReport && showReport ? "w-[15%]" : "w-[22%]"
                  else if (h.id === "class") widthClass = hasReport && showReport ? "w-[6%]" : "w-[10%]"
                  else if (h.id === "date") widthClass = hasReport && showReport ? "w-[12%]" : "w-[20%]"
                  else if (h.id === "status") widthClass = hasReport && showReport ? "w-[8%]" : "w-[14%]"
                  else if (h.id === "aiScore") widthClass = "w-[12%]"
                  else if (h.id === "similarity") widthClass = "w-[12%]"
                  else if (h.id === "stylometric") widthClass = "w-[12%]"
                  else if (h.id === "actions") widthClass = hasReport && showReport ? "w-[23%]" : "w-[34%]"
                  return (
                    <th key={h.id} className={`${widthClass} px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider truncate`} style={{ color: "var(--dash-muted)" }}>
                      {h.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {paginatedRows.map((row, idx) => {
                  if (row.type === "submitted") {
                    const s = row
                    const rScore = report?.scores[s.studentName]
                    return (
                      <motion.tr key={`${s.studentName}-${s.assignmentId}`}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                        className="hover:bg-blue-50/40 transition-colors" style={{ borderBottom: "1px solid var(--dash-border)" }}>
                        <td className="px-4 py-3 font-semibold truncate" style={{ color: "var(--dash-fg)" }}>{s.studentName}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.class_code}</td>
                        <td className="px-4 py-3 text-xs truncate" style={{ color: "var(--dash-muted)" }}>{new Date(s.submittedAt).toLocaleDateString(dateLocale)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 size={11} aria-hidden="true" />{t("dashboardProfesor.statusSent")}
                          </span>
                        </td>
                        {hasReport && showReport && rScore && (
                          <>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                                style={{ color: aiColor(rScore.aiScore), borderColor: aiColor(rScore.aiScore) + "44", background: aiColor(rScore.aiScore) + "12" }}>
                                {rScore.aiScore}% — {aiLabel(rScore.aiScore, t)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${rScore.similarity > 50 ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                {rScore.similarity > 50 ? t("dashboardProfesor.simSuspect") : t("dashboardProfesor.simOk")} ({rScore.similarity}%)
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                rScore.stilometric === "Eroare analiză" ? "bg-amber-50 text-amber-800 border-amber-200"
                                : rScore.stilometric === "Stil Consistent" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-red-50 text-red-700 border-red-200"
                              }`}>
                                {rScore.stilometric === "Eroare analiză" ? t("dashboardProfesor.stilError")
                                  : rScore.stilometric === "Stil Consistent" ? t("dashboardProfesor.stilOk")
                                  : t("dashboardProfesor.stilSuspect")}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => setPreviewing({ studentName: s.studentName, fileName: s.fileName, text: s.text })}
                              className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all hover:shadow-sm"
                              style={{ borderColor: "var(--dash-border)", color: "var(--dash-accent)", background: "rgba(59,130,246,0.06)" }}
                              aria-label={t("dashboardProfesor.readAria", { name: s.studentName })}>
                              <Eye size={11} aria-hidden="true" />{t("dashboardProfesor.readBtn")}
                            </button>
                            {hasReport && showReport && rScore && (
                              <button
                                onClick={() => onRequestForensic(s.id)}
                                className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all hover:shadow-sm"
                                style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)", background: "rgba(0,31,63,0.06)" }}
                                aria-label={t("dashboardProfesor.detailsAria", { name: s.studentName })}>
                                <Search size={11} aria-hidden="true" />{t("dashboardProfesor.detailsBtn")}
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  }

                  return (
                    <tr key={row.studentName} className="opacity-50" style={{ borderBottom: "1px solid var(--dash-border)" }}>
                      <td className="px-4 py-3 font-medium truncate" style={{ color: "var(--dash-fg)" }}>{row.studentName}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.class_code}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200">
                          <Clock size={11} aria-hidden="true" />{t("dashboardProfesor.statusNotSent")}
                        </span>
                      </td>
                      {hasReport && showReport && (
                        <>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                        </>
                      )}
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                    </tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3" style={{ borderColor: "var(--dash-border)" }}>
            <span className="text-xs" style={{ color: "var(--dash-muted)" }}>
              {t("dashboardProfesor.pagination", { page: page + 1, total: totalPages, count: allRows.length })}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-30"
                style={{ borderColor: "var(--dash-border)" }} aria-label={t("dashboardProfesor.prevPage")}>
                <ChevronLeft size={14} style={{ color: "var(--dash-fg)" }} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors"
                  style={{ background: page === i ? "var(--dash-navy)" : "transparent", color: page === i ? "#fff" : "var(--dash-muted)", border: page === i ? "none" : "1px solid var(--dash-border)" }}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-30"
                style={{ borderColor: "var(--dash-border)" }} aria-label={t("dashboardProfesor.nextPage")}>
                <ChevronRight size={14} style={{ color: "var(--dash-fg)" }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {isAnalyzed && report && Object.keys(report.scores).length > 0 && (
        <RiskDistributionChart report={report} onFilterChange={setChartFilter} activeFilter={chartFilter} />
      )}

      {isAnalyzed && report && (
        <motion.div key={`analyzed-${assignment.id}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.classSummary")}</h3>
          </div>
          <KPICards report={report} totalStudents={classStudents.length} submittedCount={assnSubs.length} />
        </motion.div>
      )}
    </div>
  )
}
