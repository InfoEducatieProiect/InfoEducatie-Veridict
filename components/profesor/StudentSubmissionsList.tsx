"use client"

import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle, Brain, CheckCircle2, Clock, FileText, GraduationCap, Loader2, Search, X,
} from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"
import type { ProfessorStudentSubmission } from "@/lib/supabase/queries"

interface StudentSubmissionsListProps {
  submissions: ProfessorStudentSubmission[]
  analysedIds: Set<string>
  isLoading: boolean
  runningSubmissionId: string | null
  progress: { done: number; total: number } | null
  error: string | null
  onDismissError: () => void
  onAction: (row: ProfessorStudentSubmission, isAnalysed: boolean) => void
}

export default function StudentSubmissionsList({
  submissions,
  analysedIds,
  isLoading,
  runningSubmissionId,
  progress,
  error,
  onDismissError,
  onAction,
}: StudentSubmissionsListProps) {
  const { t, dateLocale } = useLanguage()

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--dash-navy)" }} aria-label={t("common.loading")} />
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: "var(--dash-border)" }}>
        <AlertTriangle size={28} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
        <p className="text-sm" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.browseNoSubmissions")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence>
        {error !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-2 rounded-xl border p-3"
            role="alert"
            style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.35)", color: "#EF4444" }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-xs font-semibold">
              {error ? t("dashboardProfesor.browseRunError", { error }) : t("dashboardProfesor.browseRunErrorGeneric")}
            </p>
            <button type="button" onClick={onDismissError} aria-label={t("common.close")}
              className="shrink-0 rounded-md p-0.5 transition-colors hover:bg-red-500/10">
              <X size={14} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        {runningSubmissionId && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm"
            role="status" aria-live="polite">
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--dash-navy)" }} aria-hidden="true" />
            <p className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.analyzing")}</p>
            <p className="max-w-xs px-6 text-center text-xs" style={{ color: "var(--dash-muted)" }}>
              {t("dashboardProfesor.browseRunNote")}
            </p>
            {progress && progress.total > 0 && (
              <>
                <p className="text-xs" style={{ color: "var(--dash-muted)" }}>
                  {progress.done >= progress.total
                    ? t("dashboardProfesor.rerunningFinalizing")
                    : t("dashboardProfesor.rerunningProgress", { done: progress.done, total: progress.total })}
                </p>
                <div className="h-1.5 w-40 overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.25)" }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)}%`,
                      background: "var(--dash-navy)",
                    }} />
                </div>
              </>
            )}
          </div>
        )}

        <table className="w-full table-fixed text-sm">
          <thead>
            <tr style={{ background: "rgba(0,31,63,0.03)", borderBottom: "1px solid var(--dash-border)" }}>
              {[
                { id: "assignment", label: t("dashboardProfesor.browseColAssignment"), w: "w-[34%]" },
                { id: "class", label: t("dashboardProfesor.colClass"), w: "w-[10%]" },
                { id: "date", label: t("dashboardProfesor.colDate"), w: "w-[16%]" },
                { id: "status", label: t("dashboardProfesor.colStatus"), w: "w-[16%]" },
                { id: "analysis", label: t("dashboardProfesor.browseColAnalysis"), w: "w-[24%]" },
              ].map((h) => (
                <th key={h.id} className={`${h.w} px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider truncate`} style={{ color: "var(--dash-muted)" }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {submissions.map((s, idx) => {
                const isTest = s.assignment_type === "test"
                const tint = isTest ? "rgba(139,92,246,0.12)" : "rgba(59,130,246,0.1)"
                const fg = isTest ? "#8b5cf6" : "var(--dash-accent)"
                const Icon = isTest ? GraduationCap : FileText
                const isLate =
                  !!s.assignment_deadline &&
                  new Date(s.submitted_at).getTime() > new Date(s.assignment_deadline).getTime()
                const isRunning = runningSubmissionId === s.id
                const isAnalysed = analysedIds.has(s.id) || s.analysed

                return (
                  <motion.tr key={s.id}
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                    className="transition-colors hover:bg-slate-100 dark:hover:bg-white/5"
                    style={{ borderBottom: "1px solid var(--dash-border)" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint }}>
                          <Icon size={13} style={{ color: fg }} aria-hidden="true" />
                        </div>
                        <span className="truncate font-semibold" style={{ color: "var(--dash-fg)" }}>
                          {s.assignment_title}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>{s.assignment_class_code}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs" style={{ color: "var(--dash-muted)" }}>
                          {new Date(s.submitted_at).toLocaleDateString(dateLocale)}
                        </span>
                        {isLate && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{ color: "#EF4444", borderColor: "#EF444444", background: "#EF444412" }}
                            title={t("dashboardProfesor.lateTitle", { time: new Date(s.submitted_at).toLocaleString(dateLocale) })}>
                            <Clock size={10} aria-hidden="true" />{t("dashboardProfesor.statusLate")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAnalysed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={{ color: "#10B981", borderColor: "#10B98144", background: "rgba(16,185,129,0.1)" }}>
                          <CheckCircle2 size={11} aria-hidden="true" />{t("dashboardProfesor.analysed")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={{ color: "var(--dash-muted)", borderColor: "var(--dash-border)", background: "rgba(148,163,184,0.12)" }}>
                          {t("dashboardProfesor.browseNotAnalysed")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button"
                        onClick={() => onAction(s, isAnalysed)}
                        disabled={!!runningSubmissionId}
                        aria-label={
                          isAnalysed
                            ? t("dashboardProfesor.browseViewAria", { title: s.assignment_title ?? "" })
                            : t("dashboardProfesor.browseRunAria", { title: s.assignment_title ?? "" })
                        }
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all hover:shadow-sm active:scale-95 disabled:opacity-40"
                        style={
                          isAnalysed
                            ? { borderColor: "var(--dash-border)", color: "var(--dash-navy-text)", background: "rgba(0,31,63,0.06)" }
                            : { borderColor: "var(--dash-border)", color: "var(--dash-accent)", background: "rgba(59,130,246,0.06)" }
                        }>
                        {isRunning
                          ? <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                          : isAnalysed
                            ? <Search size={11} aria-hidden="true" />
                            : <Brain size={11} aria-hidden="true" />}
                        {isRunning
                          ? t("dashboardProfesor.browseRunning")
                          : isAnalysed
                            ? t("dashboardProfesor.browseViewAnalysis")
                            : t("dashboardProfesor.browseRunAnalysis")}
                      </button>
                    </td>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}
