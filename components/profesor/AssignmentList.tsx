"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Filter, FileText, GraduationCap, ChevronRight, Users, Calendar, AlertTriangle } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"
import type { Assignment, ClassInfo } from "./types"

interface AssignmentListProps {
  assignments: Assignment[]
  classes: ClassInfo[]
  onSelect: (a: Assignment) => void
  onNew: () => void
  onBrowse: () => void
}

export default function AssignmentList({ assignments, classes, onSelect, onNew, onBrowse }: AssignmentListProps) {
  const { t, dateLocale } = useLanguage()
  const [filterClass, setFilterClass] = useState<string>("ALL")
  const classOptions = classes.map((c) => c.code)
  const typeOptions = ["test", "tema"] as const
  const isTypeFilter = filterClass === "test" || filterClass === "tema"
  const filtered =
    filterClass === "ALL"
      ? assignments
      : isTypeFilter
        ? assignments.filter((a) => (a.type ?? "tema") === filterClass)
        : assignments.filter((a) => a.class_code === filterClass)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.myAssignments")}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.myAssignmentsSubtitle")}</p>
        </div>
        <div className="flex flex-col gap-2 self-start sm:self-auto sm:items-end">
          <button onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 sm:w-auto"
            style={{ background: "var(--dash-navy)" }}>
            <Plus size={16} aria-hidden="true" />{t("dashboardProfesor.newAssignment")}
          </button>
          <button onClick={onBrowse}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-95 sm:w-auto"
            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)", color: "var(--dash-fg)" }}>
            <Users size={16} aria-hidden="true" />{t("dashboardProfesor.browseBtn")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.filterClass")}</span>
        {(["ALL", ...typeOptions, ...classOptions] as const).map((c) => {
          const label =
            c === "ALL"
              ? t("common.all")
              : c === "test"
                ? t("dashboardProfesor.typeOptionTest")
                : c === "tema"
                  ? t("dashboardProfesor.typeOptionTema")
                  : c
          return (
            <button key={c} onClick={() => setFilterClass(c)}
              className="rounded-full px-3 py-1 text-xs font-bold transition-all"
              style={{
                background: filterClass === c ? "var(--dash-navy)" : "var(--dash-card)",
                color: filterClass === c ? "#fff" : "var(--dash-muted)",
                border: `1px solid ${filterClass === c ? "var(--dash-navy)" : "var(--dash-border)"}`,
              }}>
              {label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {filtered.map((a, idx) => (
            <motion.button key={a.id}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              onClick={() => onSelect(a)}
              className="group flex flex-col gap-3 rounded-2xl border p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
              style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const isTest = a.type === "test"
                    const tint = isTest ? "rgba(139,92,246,0.12)" : "rgba(59,130,246,0.1)"
                    const fg = isTest ? "#8b5cf6" : "var(--dash-accent)"
                    const Icon = isTest ? GraduationCap : FileText
                    const label = isTest ? t("dashboardProfesor.typeOptionTest") : t("dashboardProfesor.typeOptionTema")
                    return (
                      <>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tint }}>
                          <Icon size={16} style={{ color: fg }} aria-hidden="true" />
                        </div>
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: tint, color: fg }}>
                          {label}
                        </span>
                      </>
                    )
                  })()}
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                    {a.class_code}
                  </span>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold leading-snug text-balance" style={{ color: "var(--dash-fg)" }}>{a.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>{a.requirement}</p>
              </div>
              <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--dash-border)" }}>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dash-muted)" }}>
                  <Users size={12} aria-hidden="true" /><span>- {t("dashboardProfesor.submissionsLabel")}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dash-muted)" }}>
                  <Calendar size={12} aria-hidden="true" />
                  <span>
                    {(() => {
                      const d = new Date(a.deadline)
                      const timePart = a.deadline.includes("T")
                        ? d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })
                        : "23:59"
                      return `${d.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}, ${t("dashboardProfesor.atTime")} ${timePart}`
                    })()}
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="col-span-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: "var(--dash-border)" }}>
            <AlertTriangle size={28} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
            <p className="text-sm" style={{ color: "var(--dash-muted)" }}>
              {filterClass === "ALL"
                ? t("dashboardProfesor.noAssignmentsAll")
                : isTypeFilter
                  ? t("dashboardProfesor.noAssignmentsType", {
                      type: filterClass === "test" ? t("dashboardProfesor.typeOptionTest") : t("dashboardProfesor.typeOptionTema"),
                    })
                  : t("dashboardProfesor.noAssignmentsClass", { class: filterClass })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
