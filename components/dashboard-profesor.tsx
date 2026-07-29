"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, LogOut, Network, Loader2 } from "lucide-react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { signOut } from "@/app/actions/auth"
import ForensicAnalyzer from "@/components/forensic-analyzer"
import { resolveForensicScoreIds } from "@/lib/forensic-score-ids"
import { stylometryMetricsToDbColumns } from "@/lib/stylometry-db-metrics"
import type { StylometryMetrics, StylometryVerdict } from "@/lib/stylometry-types"
import { useLanguage } from "@/lib/i18n/language-provider"
import { mergeStylometryIntoScore } from "@/lib/profesor-utils"
import AssignmentList from "./profesor/AssignmentList"
import ClassBrowser from "./profesor/ClassBrowser"
import AssignmentDetail from "./profesor/AssignmentDetail"
import CreateAssignmentModal from "./profesor/CreateAssignmentModal"
import type { Assignment, AnalysisReport, StudentScore, ClassInfo, SchoolClass } from "./profesor/types"

async function fetchAssignments(professorId: string): Promise<Assignment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("assignments")
    .select("*, classes(code)")
    .eq("professor_id", professorId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    class_code: (a.classes as { code?: string } | null)?.code,
  })) as Assignment[]
}

interface DashboardProfesorProps {
  userId: string
  displayName: string
  classes: ClassInfo[]
}

export default function DashboardProfesor({ userId, displayName, classes }: DashboardProfesorProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { data: assignments = [], mutate: mutateAssignments, isLoading: assignmentsLoading } = useSWR(
    `assignments-${userId}`,
    () => fetchAssignments(userId),
    { revalidateOnFocus: false }
  )

  const aParam = searchParams.get("a")
  const subParam = searchParams.get("sub")
  const tabParam = searchParams.get("tab")
  const browseParam = searchParams.get("browse")
  const clsParam = searchParams.get("cls")
  const stuParam = searchParams.get("stu")
  const fromParam = searchParams.get("from")

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === aParam) ?? null,
    [assignments, aParam],
  )
  const assignmentPending = !!aParam && !selectedAssignment && assignmentsLoading
  const view: "list" | "detail" | "browse" = selectedAssignment
    ? "detail"
    : browseParam
      ? "browse"
      : "list"

  const navigate = (
    patch: {
      a?: string | null; sub?: string | null; tab?: string | null
      browse?: string | null; cls?: string | null; stu?: string | null; from?: string | null
    },
    mode: "push" | "replace" = "push",
  ) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router[mode](qs ? `${pathname}?${qs}` : pathname)
  }

  const [analysisReports, setAnalysisReports] = useState<Record<string, AnalysisReport>>({})
  const [showModal, setShowModal] = useState(false)

  const [forensicData, setForensicData] = useState<{
    studentName: string
    score: StudentScore
    assignmentId: string
    submissionId: string
    submissionTexts: Record<string, string>
    analysisScoreId: string
    studentId: string
  } | null>(null)

  const [showReportMap, setShowReportMap] = useState<Record<string, boolean>>({})
  const getShowReport = (assignmentId: string) => showReportMap[assignmentId] ?? false
  const setShowReport = (assignmentId: string, value: boolean | ((prev: boolean) => boolean)) => {
    setShowReportMap((prev) => ({
      ...prev,
      [assignmentId]: typeof value === "function" ? value(prev[assignmentId] ?? false) : value,
    }))
  }

  useEffect(() => {
    if (!subParam && forensicData) setForensicData(null)
  }, [subParam, forensicData])

  const handleSelect = (a: Assignment) =>
    navigate({ a: a.id, sub: null, tab: null, browse: null, cls: null, stu: null, from: null }, "push")
  const handleBack = () =>
    navigate({ a: null, sub: null, tab: null, browse: null, cls: null, stu: null, from: null }, "push")

  const handleBackFromForensic = () =>
    fromParam === "browse"
      ? navigate({ a: null, sub: null, tab: null, from: null, browse: "1" }, "push")
      : navigate({ sub: null, tab: null }, "push")

  const handleOpenBrowser = () => navigate({ browse: "1", cls: null, stu: null }, "push")
  const handleCloseBrowser = () => navigate({ browse: null, cls: null, stu: null }, "push")
  const handleSelectClass = (classId: string | null) => navigate({ cls: classId, stu: null }, "push")
  const handleSelectStudent = (studentId: string | null) => navigate({ stu: studentId }, "push")

  const handleOpenAnalysisFromBrowser = (assignmentId: string, submissionId: string) =>
    navigate({ a: assignmentId, sub: submissionId, tab: "graph", browse: null, from: "browse" }, "push")

  const handleRequestForensic = (submissionId: string) =>
    navigate({ sub: submissionId, tab: tabParam ?? "graph" }, "push")

  const handleOpenForensic = (
    studentName: string,
    score: StudentScore,
    assignmentId: string,
    submissionId: string,
    submissionTexts: Record<string, string>,
    studentIdFromSubmission?: string,
  ) => {
    const { analysisScoreId, studentId, submissionId: resolvedSubmissionId } = resolveForensicScoreIds(score, { submissionId, studentId: studentIdFromSubmission })
    if (!analysisScoreId || !studentId) {
      console.error("[Veridict] Missing keys", { score, resolved: { analysisScoreId, studentId, submissionId: resolvedSubmissionId }, studentIdFromSubmission })
    }
    setForensicData({
      studentName,
      score: { ...score, analysisScoreId: analysisScoreId || score.analysisScoreId, studentId: studentId || score.studentId, submissionId: resolvedSubmissionId },
      assignmentId,
      submissionId: resolvedSubmissionId,
      submissionTexts,
      analysisScoreId,
      studentId,
    })
  }

  const handleStylometryReport = async (
    assignmentId: string,
    studentName: string,
    payload: { metrics: StylometryMetrics; baseline_used: StylometryMetrics; deviation: number; verdict: StylometryVerdict },
  ) => {
    setAnalysisReports((prev) => {
      const current = prev[assignmentId]
      const existing = current?.scores[studentName]
      if (!current || !existing) return prev
      return {
        ...prev,
        [assignmentId]: {
          ...current,
          scores: {
            ...current.scores,
            [studentName]: mergeStylometryIntoScore(existing, { metrics: payload.metrics, baseline_used: payload.baseline_used, deviation: payload.deviation }),
          },
        },
      }
    })
    setForensicData((fd) =>
      fd && fd.studentName === studentName && fd.assignmentId === assignmentId
        ? { ...fd, score: mergeStylometryIntoScore(fd.score, { metrics: payload.metrics, baseline_used: payload.baseline_used, deviation: payload.deviation }) }
        : fd,
    )
    try {
      const supabase = createClient()
      const scoreId = forensicData?.analysisScoreId || forensicData?.score?.analysisScoreId || forensicData?.score?.id
      if (!scoreId) { console.warn("[Veridict Sync] Nu s-a putut identifica `analysisScoreId`."); return }
      const dbCols = stylometryMetricsToDbColumns(payload.metrics)
      const { error } = await supabase.from("analysis_scores").update({ ...dbCols, stilometric: payload.deviation }).eq("id", scoreId)
      if (error) console.error("❌ [Supabase Sync Error]:", error.message)
      else console.log(`[Stylometry Debug] handleStylometryReport DB sync OK — verbs raw ${payload.metrics.verbs} → DB ${dbCols.verbs}`)
    } catch (dbErr) {
      console.error("❌ Problemă critică la rețea/Supabase client în handleStylometryReport:", dbErr)
    }
  }

  const handlePlagiarismReport = (
    assignmentId: string,
    studentName: string,
    report: { verdict: string; scor_maxim: number; sursa_principala: string | null; plagiarism_urls: { url: string; scor: number }[] },
  ) => {
    setAnalysisReports((prev) => {
      const current = prev[assignmentId]
      if (!current?.scores[studentName]) return prev
      return { ...prev, [assignmentId]: { ...current, scores: { ...current.scores, [studentName]: { ...current.scores[studentName], plagiarismWeb: report } } } }
    })
    setForensicData((fd) =>
      fd && fd.studentName === studentName && fd.assignmentId === assignmentId
        ? { ...fd, score: { ...fd.score, plagiarismWeb: report } }
        : fd,
    )
  }

  const handleSave = async (data: { title: string; requirement: string; details: string; deadline: string; className: SchoolClass; type: "tema" | "test" }) => {
    const supabase = createClient()
    const classInfo = classes.find((c) => c.code === data.className)
    if (!classInfo) return
    const baseRow = {
      professor_id: userId,
      title: data.title,
      requirement: data.requirement,
      details: data.details,
      deadline: new Date(data.deadline + "T23:59:59").toISOString(),
      class_id: classInfo.id,
    }
    let { error } = await supabase.from("assignments").insert({ ...baseRow, type: data.type })
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      ;({ error } = await supabase.from("assignments").insert(baseRow))
    }
    if (!error) mutateAssignments()
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--dash-bg)" }}>
      <header className="flex items-center justify-between px-6 py-4 shadow-sm" style={{ background: "var(--dash-navy)", color: "#fff" }}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-400" aria-hidden="true" />
          <span className="text-lg font-black tracking-tight">Veridict</span>
          <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
            {t("dashboardProfesor.portalBadge")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <Network size={16} aria-hidden="true" /><span>{displayName}</span>
          </div>
          <form action={signOut}>
            <button type="submit"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={t("dashboardProfesor.logoutAria")}>
              <LogOut size={14} aria-hidden="true" />{t("common.logout")}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-10">
        <AnimatePresence mode="wait">
          {assignmentPending && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center py-24">
              <Loader2 size={28} className="animate-spin" style={{ color: "var(--dash-navy)" }} aria-label={t("common.loading")} />
            </motion.div>
          )}
          {view === "list" && !assignmentPending && (
            <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25 }}>
              <AssignmentList assignments={assignments} classes={classes} onSelect={handleSelect} onNew={() => setShowModal(true)} onBrowse={handleOpenBrowser} />
            </motion.div>
          )}
          {view === "browse" && (
            <motion.div key="browse" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
              <ClassBrowser
                professorId={userId}
                classes={classes}
                assignments={assignments}
                selectedClassId={clsParam}
                selectedStudentId={stuParam}
                onSelectClass={handleSelectClass}
                onSelectStudent={handleSelectStudent}
                onClose={handleCloseBrowser}
                onOpenAnalysis={handleOpenAnalysisFromBrowser}
                setAnalysisReports={setAnalysisReports}
              />
            </motion.div>
          )}
          {view === "detail" && selectedAssignment && (
            <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="overflow-visible">
              <div style={{ display: forensicData ? "none" : "block" }}>
                <AssignmentDetail
                  assignment={selectedAssignment}
                  analysisReports={analysisReports}
                  setAnalysisReports={setAnalysisReports}
                  onBack={handleBack}
                  onOpenForensic={handleOpenForensic}
                  onRequestForensic={handleRequestForensic}
                  requestedSubmissionId={subParam ?? undefined}
                  showReport={getShowReport(selectedAssignment.id)}
                  setShowReport={(v) => setShowReport(selectedAssignment.id, v)}
                />
              </div>
              {forensicData && (
                <ForensicAnalyzer
                  studentName={forensicData.studentName}
                  score={{
                    ...forensicData.score,
                    stilometric: forensicData.score.stilometric === "Abatere Stilistica" ? "Abatere Stilistică" : "Stil Consistent",
                  }}
                  onBack={handleBackFromForensic}
                  backLabel={fromParam === "browse" ? t("dashboardProfesor.browseBackToSubmissions") : undefined}
                  initialTab={tabParam ?? undefined}
                  onTabChange={(tb) => navigate({ tab: tb }, "replace")}
                  assignmentId={forensicData.assignmentId}
                  submissionId={forensicData.submissionId}
                  analysisScoreId={forensicData.analysisScoreId}
                  studentId={forensicData.studentId}
                  submissionTexts={forensicData.submissionTexts}
                  allScores={Object.fromEntries(
                    Object.entries(analysisReports[forensicData.assignmentId]?.scores ?? {}).map(([name, sc]) => [name, sc.aiScore])
                  )}
                  integrityGraphEdges={analysisReports[forensicData.assignmentId]?.graphEdges}
                  integrityGraphNodes={analysisReports[forensicData.assignmentId]?.graphNodes}
                  onPlagiarismReport={(report) =>
                    handlePlagiarismReport(forensicData.assignmentId, forensicData.studentName, {
                      verdict: report.verdict,
                      scor_maxim: report.scor_maxim,
                      sursa_principala: report.sursa_principala,
                      plagiarism_urls: report.top_surse.map((s) => ({
                        url: s.url,
                        scor: s.scor > 1 ? Math.round(s.scor) : Math.round(s.scor * 1000) / 10,
                      })),
                    })
                  }
                  onStylometryComplete={(payload) => handleStylometryReport(forensicData.assignmentId, forensicData.studentName, payload)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showModal && <CreateAssignmentModal onClose={() => setShowModal(false)} onSave={handleSave} />}
      </AnimatePresence>
    </div>
  )
}
