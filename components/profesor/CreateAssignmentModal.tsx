"use client"

import { useState, useRef, useCallback, useLayoutEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, BookOpen, Calendar, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"
import { ALL_CLASSES, type SchoolClass } from "./types"

interface CreateAssignmentModalProps {
  onClose: () => void
  onSave: (data: { title: string; requirement: string; details: string; deadline: string; className: SchoolClass; type: "tema" | "test" }) => void
}

export default function CreateAssignmentModal({ onClose, onSave }: CreateAssignmentModalProps) {
  const { t } = useLanguage()
  const [title, setTitle] = useState("")
  const [requirement, setRequirement] = useState("")
  const [details, setDetails] = useState("")
  const [deadline, setDeadline] = useState("")
  const [className, setClassName] = useState<SchoolClass>("12B")
  const [assignmentType, setAssignmentType] = useState<"tema" | "test">("tema")
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedHour, setSelectedHour] = useState(23)
  const [selectedMinute, setSelectedMinute] = useState(59)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const calendarBtnRef = useRef<HTMLButtonElement>(null)
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0, width: 0, openUp: false })

  const DAYS_RO   = [0,1,2,3,4,5,6].map(i => t(`daysShort.${i}`))
  const MONTHS_RO = [0,1,2,3,4,5,6,7,8,9,10,11].map(i => t(`months.${i}`))
  const DAYS_FULL_RO = [0,1,2,3,4,5,6].map(i => t(`daysFull.${i}`))

  const getDaysInMonth  = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const getFirstDayOfMonth = (y: number, m: number) => { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1 }

  const updateCalendarPos = useCallback(() => {
    if (!calendarBtnRef.current) return
    const PANEL_H = 380, PANEL_W = 380, GAP = 8
    const rect = calendarBtnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < PANEL_H && rect.top > spaceBelow
    const top = openUp ? Math.max(GAP, rect.top - PANEL_H - GAP) : rect.bottom + GAP
    const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - PANEL_W - GAP))
    setCalendarPos({ top, left, width: rect.width, openUp })
  }, [])

  useLayoutEffect(() => { if (showCalendar) updateCalendarPos() }, [showCalendar, updateCalendarPos])

  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [calendarMonth])

  const prevMonth = () => setCalendarMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })
  const nextMonth = () => setCalendarMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })

  const handleDateSelect = (day: number) => {
    const d = new Date(calendarMonth.year, calendarMonth.month, day)
    setSelectedDate(d)
    const iso = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    setDeadline(iso)
  }

  const formattedDeadline = selectedDate
    ? `${DAYS_FULL_RO[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTHS_RO[selectedDate.getMonth()]} ${selectedDate.getFullYear()}, ${t("dashboardProfesor.atTime")} ${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`
    : ""

  const isToday = (day: number) => {
    const now = new Date()
    return calendarMonth.year === now.getFullYear() && calendarMonth.month === now.getMonth() && day === now.getDate()
  }
  const isSelected = (day: number) =>
    selectedDate?.getFullYear() === calendarMonth.year && selectedDate?.getMonth() === calendarMonth.month && selectedDate?.getDate() === day

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !requirement.trim() || !deadline) return
    onSave({ title: title.trim(), requirement: requirement.trim(), details: details.trim(), deadline, className, type: assignmentType })
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0" style={{ background: "rgba(0,15,35,0.7)", backdropFilter: "blur(6px)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
      <motion.div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl"
        style={{ background: "var(--dash-card)", border: "1px solid var(--dash-border)" }}
        initial={{ opacity: 0, y: 32, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--dash-border)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.modalTitle")}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" aria-label={t("common.close")}>
            <X size={16} style={{ color: "var(--dash-muted)" }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldClass")} <span className="text-red-500">*</span></label>
            <div className="relative">
              <BookOpen size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
              <select value={className} onChange={(e) => setClassName(e.target.value as SchoolClass)}
                className="w-full appearance-none rounded-lg border pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
                style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}>
                {ALL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldType")} <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {([["tema", "typeOptionTema"], ["test", "typeOptionTest"]] as const).map(([val, key]) => {
                const active = assignmentType === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAssignmentType(val)}
                    aria-pressed={active}
                    className="rounded-lg border py-2.5 text-sm font-semibold transition-colors"
                    style={{
                      borderColor: active ? "var(--dash-navy)" : "var(--dash-border)",
                      background: active ? "var(--dash-navy)" : "var(--dash-bg)",
                      color: active ? "#fff" : "var(--dash-fg)",
                    }}
                  >
                    {t(`dashboardProfesor.${key}`)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldTitle")} <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("dashboardProfesor.placeholderTitle")} required
              className="rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldDesc")} <span className="text-red-500">*</span></label>
            <textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder={t("dashboardProfesor.placeholderDesc")} required rows={3}
              className="resize-none rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldDeadline")} <span className="text-red-500">*</span></label>
            <div className="relative">
              <button ref={calendarBtnRef} type="button" onClick={() => setShowCalendar((v) => !v)}
                className="flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-sm text-left focus:outline-none focus:ring-2 transition-colors"
                style={{ borderColor: showCalendar ? "var(--dash-navy)" : "var(--dash-border)", background: "var(--dash-bg)", color: formattedDeadline ? "var(--dash-fg)" : "var(--dash-muted)" }}>
                <Calendar size={15} style={{ color: showCalendar ? "var(--dash-navy)" : "var(--dash-muted)" }} aria-hidden="true" />
                <span className="flex-1 truncate">{formattedDeadline || t("dashboardProfesor.placeholderDeadline")}</span>
                <ChevronDown size={14} className="shrink-0 transition-transform" style={{ color: "var(--dash-muted)", transform: showCalendar ? "rotate(180deg)" : "rotate(0)" }} aria-hidden="true" />
              </button>
            </div>
            <AnimatePresence>
              {showCalendar && (
                <>
                  <div className="fixed inset-0 z-[200]" onClick={() => setShowCalendar(false)} aria-hidden="true" />
                  <motion.div initial={{ opacity: 0, y: calendarPos.openUp ? 8 : -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: calendarPos.openUp ? 8 : -8, scale: 0.97 }} transition={{ duration: 0.2 }}
                    className="fixed z-[201] rounded-xl border shadow-2xl overflow-hidden"
                    style={{ top: calendarPos.top, left: calendarPos.left, minWidth: Math.max(calendarPos.width, 380), background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
                    <div className="flex">
                      <div className="flex-1 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" aria-label={t("dashboardProfesor.prevMonthAria")}><ChevronLeft size={14} style={{ color: "var(--dash-fg)" }} /></button>
                          <span className="text-xs font-bold" style={{ color: "var(--dash-fg)" }}>{MONTHS_RO[calendarMonth.month]} {calendarMonth.year}</span>
                          <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" aria-label={t("dashboardProfesor.nextMonthAria")}><ChevronRight size={14} style={{ color: "var(--dash-fg)" }} /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {DAYS_RO.map((d) => <div key={d} className="flex h-7 items-center justify-center text-[10px] font-bold uppercase" style={{ color: "var(--dash-muted)" }}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {calendarDays.map((day, i) => (
                            <div key={i} className="flex h-8 items-center justify-center">
                              {day ? (
                                <button type="button" onClick={() => handleDateSelect(day)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all"
                                  style={{ background: isSelected(day) ? "var(--dash-navy)" : isToday(day) ? "rgba(0,31,63,0.06)" : "transparent", color: isSelected(day) ? "#fff" : "var(--dash-fg)" }}>
                                  {day}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2 border-l px-4 py-4" style={{ borderColor: "var(--dash-border)", minWidth: "100px" }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.calTime")}</span>
                        <div className="flex items-center gap-1">
                          {[{ val: selectedHour, set: setSelectedHour, mod: 24, up: t("dashboardProfesor.hourUpAria"), down: t("dashboardProfesor.hourDownAria") },
                            { val: selectedMinute, set: setSelectedMinute, mod: 60, up: t("dashboardProfesor.minuteUpAria"), down: t("dashboardProfesor.minuteDownAria") }
                          ].map((item, k) => (
                            <div key={k} className="flex flex-col items-center">
                              <button type="button" onClick={() => item.set((v: number) => (v + 1) % item.mod)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" aria-label={item.up}><ChevronDown size={12} className="rotate-180" style={{ color: "var(--dash-muted)" }} /></button>
                              <div className="flex h-10 w-12 items-center justify-center rounded-lg text-lg font-black" style={{ background: "rgba(0,31,63,0.06)", color: "var(--dash-navy-text)" }}>{String(item.val).padStart(2, "0")}</div>
                              <button type="button" onClick={() => item.set((v: number) => (v - 1 + item.mod) % item.mod)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" aria-label={item.down}><ChevronDown size={12} style={{ color: "var(--dash-muted)" }} /></button>
                            </div>
                          ))}
                        </div>
                        {selectedDate && (
                          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-2 flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(16,185,129,0.1)" }}>
                            <CheckCircle2 size={10} className="text-emerald-500" />
                            <span className="text-[10px] font-semibold text-emerald-600">{t("dashboardProfesor.calSelected")}</span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                    {formattedDeadline && (
                      <div className="border-t px-4 py-2.5 text-center" style={{ borderColor: "var(--dash-border)", background: "rgba(0,31,63,0.02)" }}>
                        <p className="text-xs font-semibold" style={{ color: "var(--dash-navy-text)" }}>{formattedDeadline}</p>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.fieldDetails")}</label>
            <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t("dashboardProfesor.placeholderDetails")}
              className="rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              style={{ borderColor: "var(--dash-border)", color: "var(--dash-muted)" }}>{t("dashboardProfesor.btnCancel")}</button>
            <button type="submit" className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90" style={{ background: "var(--dash-navy)" }}>{t("dashboardProfesor.btnSave")}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
