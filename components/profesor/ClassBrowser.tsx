"use client"

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, ArrowLeft, ChevronRight, GraduationCap, Loader2, Search, Users } from "lucide-react"
import useSWR, { mutate } from "swr"
import { useLanguage } from "@/lib/i18n/language-provider"
import { runAssignmentAnalysis } from "@/lib/analyze-ai-stream"
import {
  getAllStudents,
  getAnalysedSubmissionIds,
  getStudentSubmissionsForProfessor,
  type ProfessorStudentSubmission,
} from "@/lib/supabase/queries"
import StudentSubmissionsList from "./StudentSubmissionsList"
import type { Assignment, AnalysisReport, ClassInfo } from "./types"

const EMPTY_IDS: Set<string> = new Set()

async function fetchStudentWork(studentId: string, professorId: string) {
  const submissions = await getStudentSubmissionsForProfessor(studentId, professorId)
  const analysedIds = await getAnalysedSubmissionIds(submissions.map((s) => s.id))
  return { submissions, analysedIds }
}

interface ClassBrowserProps {
  professorId: string
  classes: ClassInfo[]
  assignments: Assignment[]
  selectedClassId: string | null
  selectedStudentId: string | null
  onSelectClass: (classId: string | null) => void
  onSelectStudent: (studentId: string | null) => void
  onClose: () => void
  onOpenAnalysis: (assignmentId: string, submissionId: string) => void
  setAnalysisReports: React.Dispatch<React.SetStateAction<Record<string, AnalysisReport>>>
}

export default function ClassBrowser({
  professorId,
  classes,
  assignments,
  selectedClassId,
  selectedStudentId,
  onSelectClass,
  onSelectStudent,
  onClose,
  onOpenAnalysis,
  setAnalysisReports,
}: ClassBrowserProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [runningSubmissionId, setRunningSubmissionId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: allStudents = [], isLoading: studentsLoading } = useSWR(
    "browse-all-students",
    getAllStudents,
    { revalidateOnFocus: false },
  )

  const studentsByClass = useMemo(() => {
    const map: Record<string, typeof allStudents> = {}
    for (const s of allStudents) {
      if (!s.class_id) continue
      ;(map[s.class_id] ??= []).push(s)
    }
    return map
  }, [allStudents])

  const assignmentsByClass = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of assignments) map[a.class_id] = (map[a.class_id] ?? 0) + 1
    return map
  }, [assignments])

  const activeClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  )
  const activeStudent = useMemo(
    () => allStudents.find((s) => s.id === selectedStudentId) ?? null,
    [allStudents, selectedStudentId],
  )

  const level: "classes" | "students" | "submissions" =
    activeClass && selectedStudentId ? "submissions" : activeClass ? "students" : "classes"

  const { data: studentWork, isLoading: submissionsLoading } = useSWR(
    level === "submissions" && selectedStudentId ? `browse-submissions-${selectedStudentId}` : null,
    () => fetchStudentWork(selectedStudentId!, professorId),
    { revalidateOnFocus: false },
  )
  const studentSubmissions = studentWork?.submissions ?? []
  const analysedIds = studentWork?.analysedIds ?? EMPTY_IDS

  const classStudents = activeClass ? (studentsByClass[activeClass.id] ?? []) : []
  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return classStudents
    return classStudents.filter((s) => (s.display_name ?? "").toLowerCase().includes(q))
  }, [classStudents, query])

  const handleAction = async (row: ProfessorStudentSubmission, isAnalysed: boolean) => {
    if (isAnalysed) {
      onOpenAnalysis(row.assignment_id, row.id)
      return
    }
    if (runningSubmissionId) return
    setError(null)
    setRunningSubmissionId(row.id)
    try {
      const report = await runAssignmentAnalysis(row.assignment_id, setProgress)
      setAnalysisReports((prev) => ({ ...prev, [row.assignment_id]: report }))
      await Promise.all([
        mutate(`submissions-${row.assignment_id}`),
        mutate(`browse-submissions-${selectedStudentId}`),
      ])
      onOpenAnalysis(row.assignment_id, row.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "")
    } finally {
      setRunningSubmissionId(null)
      setProgress(null)
    }
  }

  const handleBack = () => {
    if (level === "submissions") onSelectStudent(null)
    else if (level === "students") { setQuery(""); onSelectClass(null) }
    else onClose()
  }

  const backLabel =
    level === "submissions"
      ? t("dashboardProfesor.browseBackToStudents")
      : level === "students"
        ? t("dashboardProfesor.browseBackToClasses")
        : t("dashboardProfesor.backToAssignments")

  const heading =
    level === "submissions"
      ? t("dashboardProfesor.browseSubmissionsTitle", { name: activeStudent?.display_name ?? "" })
      : level === "students"
        ? t("dashboardProfesor.browseStudentsTitle", { code: activeClass?.code ?? "" })
        : t("dashboardProfesor.browseTitle")

  const subheading =
    level === "submissions"
      ? (studentSubmissions.length === 1
          ? t("dashboardProfesor.browseSubmissionsSubtitle1")
          : t("dashboardProfesor.browseSubmissionsSubtitle", { n: studentSubmissions.length }))
      : level === "students"
        ? t("dashboardProfesor.browseStudentsSubtitle")
        : t("dashboardProfesor.browseSubtitle")

  const cardClass =
    "group flex flex-col gap-3 rounded-2xl border p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
  const cardStyle = { background: "var(--dash-card)", borderColor: "var(--dash-border)" } as const

  return (
    <div className="flex flex-col gap-6" aria-label={t("dashboardProfesor.browseBrowserAria")}>
      <div className="flex flex-col gap-4">
        <button type="button" onClick={handleBack}
          className="flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-slate-100 dark:hover:bg-white/5"
          style={{ color: "var(--dash-muted)" }}>
          <ArrowLeft size={16} aria-hidden="true" />{backLabel}
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--dash-fg)" }}>{heading}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>{subheading}</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {level === "classes" && (
          <motion.div key="classes"
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {classes.map((c, idx) => {
              const studentCount = studentsByClass[c.id]?.length ?? 0
              const assignmentCount = assignmentsByClass[c.id] ?? 0
              return (
                <motion.button key={c.id}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  onClick={() => onSelectClass(c.id)}
                  aria-label={t("dashboardProfesor.browseClassAria", { code: c.code })}
                  className={cardClass} style={cardStyle}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.1)" }}>
                        <Users size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
                      </div>
                      <p className="text-lg font-bold" style={{ color: "var(--dash-fg)" }}>{c.code}</p>
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--dash-border)" }}>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                      {studentCount === 1
                        ? t("dashboardProfesor.browseClassStudent1")
                        : t("dashboardProfesor.browseClassStudents", { n: studentCount })}
                    </span>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
                      {assignmentCount === 1
                        ? t("dashboardProfesor.browseClassAssignment1")
                        : t("dashboardProfesor.browseClassAssignments", { n: assignmentCount })}
                    </span>
                  </div>
                </motion.button>
              )
            })}
            {classes.length === 0 && (
              <div className="col-span-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: "var(--dash-border)" }}>
                <AlertTriangle size={28} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
                <p className="text-sm" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.browseNoClasses")}</p>
              </div>
            )}
          </motion.div>
        )}

        {level === "students" && (
          <motion.div key="students"
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}
            className="flex flex-col gap-4">
            <div className="relative w-full sm:max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dashboardProfesor.browseSearchPlaceholder")}
                aria-label={t("dashboardProfesor.browseSearchPlaceholder")}
                className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-300"
                style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)", color: "var(--dash-fg)" }} />
            </div>

            {studentsLoading ? (
              <div className="flex justify-center py-24">
                <Loader2 size={28} className="animate-spin" style={{ color: "var(--dash-navy)" }} aria-label={t("common.loading")} />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {filteredStudents.map((s, idx) => (
                    <motion.button key={s.id}
                      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ delay: idx * 0.05, duration: 0.3 }}
                      onClick={() => onSelectStudent(s.id)}
                      aria-label={t("dashboardProfesor.browseStudentAria", { name: s.display_name ?? "" })}
                      className={cardClass} style={cardStyle}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(139,92,246,0.12)" }}>
                            <GraduationCap size={16} style={{ color: "#8b5cf6" }} aria-hidden="true" />
                          </div>
                          <p className="truncate font-bold" style={{ color: "var(--dash-fg)" }}>{s.display_name}</p>
                        </div>
                        <ChevronRight size={16} className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
                      </div>
                      <div className="border-t pt-3" style={{ borderColor: "var(--dash-border)" }}>
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                          {s.class_code ?? activeClass?.code}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
                {filteredStudents.length === 0 && (
                  <div className="col-span-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: "var(--dash-border)" }}>
                    <AlertTriangle size={28} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
                    <p className="text-sm" style={{ color: "var(--dash-muted)" }}>
                      {query.trim()
                        ? t("dashboardProfesor.browseNoSearchResults", { query: query.trim() })
                        : t("dashboardProfesor.browseNoStudents")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {level === "submissions" && (
          <motion.div key="submissions"
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            <StudentSubmissionsList
              submissions={studentSubmissions}
              analysedIds={analysedIds}
              isLoading={submissionsLoading}
              runningSubmissionId={runningSubmissionId}
              progress={progress}
              error={error}
              onDismissError={() => setError(null)}
              onAction={(row, isAnalysed) => void handleAction(row, isAnalysed)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
