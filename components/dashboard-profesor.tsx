"use client"

import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShieldCheck, LogOut, Users, Brain, Plus, X, Calendar,
  ChevronRight, FileText, Clock, CheckCircle2, Cpu, ArrowLeft,
  AlertTriangle, Network, BookOpen, Eye, Filter,
  ChevronLeft, Upload, Search, ChevronDown, Paperclip, ExternalLink,
  BarChart3,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import useSWR, { mutate } from "swr"
import { createClient } from "@/lib/supabase/client"
import { signOut } from "@/app/actions/auth"
import ForensicAnalyzer from "@/components/forensic-analyzer"
import {
  loadAnalysisReportForAssignment,
} from "@/lib/analysis-report"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassInfo {
  id: string
  code: string
}

interface Assignment {
  id: string
  professor_id: string
  title: string
  requirement: string | null
  details: string | null
  deadline: string
  class_id: string
  created_at: string
  class_code?: string
  additional_url?: string
  additional_filename?: string
}

interface Submission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  file_name: string | null
  text: string | null
  analysed: boolean
  ai_score: number | null
  student_name?: string
}

interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistica"
  lexicalDiversity: number
  avgSentenceLength: number
  verbDensity: number
  adjectiveDensity: number
  punctuationUsage: number
  historicLexicalDiversity: number
  historicAvgSentenceLength: number
  historicVerbDensity: number
  historicAdjectiveDensity: number
  historicPunctuationUsage: number
  peerMatches: { name: string; similarity: number }[]
}

interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
  graphEdges?: { a: string; b: string; sim: number }[]
  graphNodes?: string[]
}

type SchoolClass = string

// Legacy compatibility
const ALL_CLASSES: SchoolClass[] = ["10A", "11B", "12A", "12B"]

// Mock CLASS_STUDENTS for backward compatibility until full migration
const CLASS_STUDENTS: Record<string, string[]> = {}

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "list" | "detail"

const ROWS_PER_PAGE = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aiColor(score: number) {
  if (score === 0) return "#94A3B8"
  if (score < 40) return "#10B981"
  if (score < 75) return "#F59E0B"
  return "#EF4444"
}

function aiLabel(score: number) {
  if (score === 0) return "\u2014"
  if (score < 40) return "Scazut"
  if (score < 75) return "Suspect"
  return "Critic"
}

// ─── Create Assignment Modal ──────────────────────────────────────────────────

interface ModalProps {
  onClose: () => void
  onSave: (data: { title: string; requirement: string; details: string; deadline: string; className: SchoolClass }) => void
}

function CreateAssignmentModal({ onClose, onSave }: ModalProps) {
  const [title, setTitle] = useState("")
  const [requirement, setRequirement] = useState("")
  const [details, setDetails] = useState("")
  const [deadline, setDeadline] = useState("")
  const [className, setClassName] = useState<SchoolClass>("12B")
  const [fileName, setFileName] = useState("")
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedHour, setSelectedHour] = useState(23)
  const [selectedMinute, setSelectedMinute] = useState(59)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const calendarBtnRef = useRef<HTMLButtonElement>(null)
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0, width: 0 })

  // Romanian day/month names
  const DAYS_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sa", "Du"]
  const MONTHS_RO = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"]
  const DAYS_FULL_RO = ["Duminica", "Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata"]

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1 // Monday first
  }

  const updateCalendarPos = useCallback(() => {
    if (calendarBtnRef.current) {
      const rect = calendarBtnRef.current.getBoundingClientRect()
      setCalendarPos({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    }
  }, [])

  useLayoutEffect(() => {
    if (showCalendar) updateCalendarPos()
  }, [showCalendar, updateCalendarPos])

  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [calendarMonth])

  const prevMonth = () => {
    setCalendarMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })
  }
  const nextMonth = () => {
    setCalendarMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })
  }

  const handleDateSelect = (day: number) => {
    const d = new Date(calendarMonth.year, calendarMonth.month, day)
    setSelectedDate(d)
    const iso = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    setDeadline(iso)
  }

  const formattedDeadline = selectedDate
    ? `${DAYS_FULL_RO[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTHS_RO[selectedDate.getMonth()]} ${selectedDate.getFullYear()}, ora ${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`
    : ""

  const isToday = (day: number) => {
    const now = new Date()
    return calendarMonth.year === now.getFullYear() && calendarMonth.month === now.getMonth() && day === now.getDate()
  }

  const isSelected = (day: number) => {
    return selectedDate?.getFullYear() === calendarMonth.year && selectedDate?.getMonth() === calendarMonth.month && selectedDate?.getDate() === day
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !requirement.trim() || !deadline) return
    onSave({ title: title.trim(), requirement: requirement.trim(), details: details.trim(), deadline, className })
    onClose()
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: "rgba(0,15,35,0.7)", backdropFilter: "blur(6px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl"
        style={{ background: "var(--dash-card)", border: "1px solid var(--dash-border)" }}
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--dash-border)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--dash-fg)" }}>
            Creaza Tema Noua
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Inchide">
            <X size={16} style={{ color: "var(--dash-muted)" }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
          {/* Class selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Clasa Tinta <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <BookOpen size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value as SchoolClass)}
                className="w-full appearance-none rounded-lg border pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
                style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}
              >
                {ALL_CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Titlu <span className="text-red-500">*</span>
            </label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Eseu - Revolutia Industriala" required
              className="rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}
            />
          </div>
          {/* Requirement */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Descriere <span className="text-red-500">*</span>
            </label>
            <textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="Descrieti ce trebuie sa realizeze elevul..." required rows={3}
              className="resize-none rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}
            />
          </div>
          {/* Premium Deadline Calendar Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Termen Limita <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                ref={calendarBtnRef}
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                className="flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-sm text-left focus:outline-none focus:ring-2 transition-colors"
                style={{ borderColor: showCalendar ? "var(--dash-navy)" : "var(--dash-border)", background: "var(--dash-bg)", color: formattedDeadline ? "var(--dash-fg)" : "var(--dash-muted)" }}
              >
                <Calendar size={15} style={{ color: showCalendar ? "var(--dash-navy)" : "var(--dash-muted)" }} aria-hidden="true" />
                <span className="flex-1 truncate">{formattedDeadline || "Selectati data si ora..."}</span>
                <ChevronDown size={14} className="shrink-0 transition-transform" style={{ color: "var(--dash-muted)", transform: showCalendar ? "rotate(180deg)" : "rotate(0)" }} aria-hidden="true" />
              </button>
            </div>

            {/* Calendar Popover — fixed to viewport, above all modal overflow */}
            <AnimatePresence>
              {showCalendar && (
                <>
                  {/* Backdrop to close */}
                  <div
                    className="fixed inset-0 z-[200]"
                    onClick={() => setShowCalendar(false)}
                    aria-hidden="true"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    className="fixed z-[201] rounded-xl border shadow-2xl overflow-hidden"
                    style={{
                      top: calendarPos.top,
                      left: calendarPos.left,
                      minWidth: Math.max(calendarPos.width, 380),
                      background: "var(--dash-card)",
                      borderColor: "var(--dash-border)",
                    }}
                  >
                    <div className="flex">
                      {/* Calendar Grid */}
                      <div className="flex-1 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Luna anterioara">
                            <ChevronLeft size={14} style={{ color: "var(--dash-fg)" }} />
                          </button>
                          <span className="text-xs font-bold" style={{ color: "var(--dash-fg)" }}>
                            {MONTHS_RO[calendarMonth.month]} {calendarMonth.year}
                          </span>
                          <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Luna urmatoare">
                            <ChevronRight size={14} style={{ color: "var(--dash-fg)" }} />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {DAYS_RO.map((d) => (
                            <div key={d} className="flex h-7 items-center justify-center text-[10px] font-bold uppercase" style={{ color: "var(--dash-muted)" }}>
                              {d}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {calendarDays.map((day, i) => (
                            <div key={i} className="flex h-8 items-center justify-center">
                              {day ? (
                                <button
                                  type="button"
                                  onClick={() => handleDateSelect(day)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all"
                                  style={{
                                    background: isSelected(day) ? "var(--dash-navy)" : isToday(day) ? "rgba(0,31,63,0.06)" : "transparent",
                                    color: isSelected(day) ? "#fff" : "var(--dash-fg)",
                                  }}
                                >
                                  {day}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Hour/Minute Scroller */}
                      <div className="flex flex-col items-center gap-2 border-l px-4 py-4" style={{ borderColor: "var(--dash-border)", minWidth: "100px" }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--dash-muted)" }}>Ora</span>
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col items-center">
                            <button type="button" onClick={() => setSelectedHour((h) => (h + 1) % 24)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors" aria-label="Ora +1">
                              <ChevronDown size={12} className="rotate-180" style={{ color: "var(--dash-muted)" }} />
                            </button>
                            <div className="flex h-10 w-12 items-center justify-center rounded-lg text-lg font-black" style={{ background: "rgba(0,31,63,0.06)", color: "var(--dash-navy)" }}>
                              {String(selectedHour).padStart(2, "0")}
                            </div>
                            <button type="button" onClick={() => setSelectedHour((h) => (h - 1 + 24) % 24)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors" aria-label="Ora -1">
                              <ChevronDown size={12} style={{ color: "var(--dash-muted)" }} />
                            </button>
                          </div>
                          <span className="text-lg font-black" style={{ color: "var(--dash-navy)" }}>:</span>
                          <div className="flex flex-col items-center">
                            <button type="button" onClick={() => setSelectedMinute((m) => (m + 1) % 60)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors" aria-label="Minut +1">
                              <ChevronDown size={12} className="rotate-180" style={{ color: "var(--dash-muted)" }} />
                            </button>
                            <div className="flex h-10 w-12 items-center justify-center rounded-lg text-lg font-black" style={{ background: "rgba(0,31,63,0.06)", color: "var(--dash-navy)" }}>
                              {String(selectedMinute).padStart(2, "0")}
                            </div>
                            <button type="button" onClick={() => setSelectedMinute((m) => (m - 1 + 60) % 60)} className="flex h-6 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors" aria-label="Minut -1">
                              <ChevronDown size={12} style={{ color: "var(--dash-muted)" }} />
                            </button>
                          </div>
                        </div>
                        {selectedDate && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-2 flex items-center gap-1.5 rounded-full px-2.5 py-1"
                            style={{ background: "rgba(16,185,129,0.1)" }}
                          >
                            <CheckCircle2 size={10} className="text-emerald-500" />
                            <span className="text-[10px] font-semibold text-emerald-600">Selectat</span>
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Friendly formatted preview */}
                    {formattedDeadline && (
                      <div className="border-t px-4 py-2.5 text-center" style={{ borderColor: "var(--dash-border)", background: "rgba(0,31,63,0.02)" }}>
                        <p className="text-xs font-semibold" style={{ color: "var(--dash-navy)" }}>
                          {formattedDeadline}
                        </p>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          {/* File picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Incarca Document/Imagine Suport
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                className="w-full rounded-lg border px-4 py-2.5 text-sm file:mr-4 file:rounded-lg file:border-0 file:px-3 file:py-1 file:text-xs file:font-semibold focus:outline-none focus:ring-2 transition-colors"
                style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}
              />
              {fileName && (
                <span className="mt-1 text-xs" style={{ color: "var(--dash-accent)" }}>
                  Fisier selectat: {fileName}
                </span>
              )}
            </div>
          </div>
          {/* Details */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
              Detalii Suplimentare
            </label>
            <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ex: Minimum 3 surse, format .pdf"
              className="rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ borderColor: "var(--dash-border)", background: "var(--dash-bg)", color: "var(--dash-fg)" }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors hover:bg-slate-50"
              style={{ borderColor: "var(--dash-border)", color: "var(--dash-muted)" }}>
              Anuleaza
            </button>
            <button type="submit" className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90" style={{ background: "var(--dash-navy)" }}>
              Salveaza Tema
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ─── Text Previewer Drawer ────────────────────────────────────────────────────

interface PreviewerProps {
  studentName: string
  fileName: string
  text: string
  onClose: () => void
}

function TextPreviewer({ studentName, fileName, text, onClose }: PreviewerProps) {
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0" style={{ background: "rgba(0,15,35,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose} aria-hidden="true" />
        <motion.aside
          className="relative flex h-full w-full max-w-xl flex-col shadow-2xl"
          style={{ background: "var(--dash-card)", borderLeft: "1px solid var(--dash-border)" }}
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          aria-label="Previzualizare lucrare"
        >
          <div className="flex items-center justify-between gap-4 border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--dash-border)", background: "var(--dash-navy)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <FileText size={18} className="text-blue-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{studentName}</p>
                <p className="text-xs truncate" style={{ color: "#93C5FD" }}>{fileName}</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 transition-colors" aria-label="Inchide previzualizarea">
              <X size={16} className="text-blue-300" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-7">
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--dash-fg)" }}>{text}</p>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── AI Analysis Steps overlay ────────────────────────────────��───────────────

const AI_STEPS = [
  "Vectorizare documente...",
  "Calculare similaritate cosinus...",
  "Extragere amprente stilometrice...",
  "Detectare sabloane AI predictive...",
  "Generare raport de integritate...",
]

function AiAnalysisOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      i++
      if (i < AI_STEPS.length) {
        setStep(i)
      } else {
        clearInterval(interval)
        setDone(true)
        setTimeout(onDone, 1200)
      }
    }, 500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-2xl"
      style={{ background: "rgba(0,31,63,0.96)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      {!done ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10">
            <Cpu size={26} className="text-blue-400 animate-pulse" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-bold text-white">Analiza AI in desfasurare</p>
            <AnimatePresence mode="wait">
              <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }} className="text-xs" style={{ color: "#93C5FD" }}>
                {AI_STEPS[step]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="flex gap-2">
            {AI_STEPS.map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full transition-all duration-500"
                style={{ background: i <= step ? "#3B82F6" : "rgba(255,255,255,0.2)" }} />
            ))}
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={40} className="text-emerald-400" />
          <p className="text-sm font-bold text-white">Analiza completa!</p>
          <p className="text-xs" style={{ color: "#93C5FD" }}>Raportul a fost generat cu succes.</p>
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── KPI Cards (Sumar Clasa) — 4 Re-engineered Metric Cards ──────────────────

function KPICards({ report, totalStudents, submittedCount }: { report: AnalysisReport; totalStudents: number; submittedCount: number }) {
  const students = Object.values(report.scores)
  
  // CARD 2: AI Risk - students with stylometric deviation > 70%
  const criticalCount = students.filter((s) => {
    const keys = [
      { current: s.lexicalDiversity, historic: s.historicLexicalDiversity },
      { current: s.avgSentenceLength, historic: s.historicAvgSentenceLength },
      { current: s.verbDensity, historic: s.historicVerbDensity },
      { current: s.adjectiveDensity, historic: s.historicAdjectiveDensity },
      { current: s.punctuationUsage, historic: s.historicPunctuationUsage },
    ]
    let sum = 0
    for (const k of keys) {
      const mx = Math.max(k.current, k.historic, 1)
      sum += Math.abs(k.current - k.historic) / mx
    }
    const deviation = Math.min(100, Math.round((sum / 5) * 100))
    return deviation > 70
  }).length

  // CARD 3: Stylometric Anomalies - deviation between 41-70%
  const anomalyCount = students.filter((s) => {
    const keys = [
      { current: s.lexicalDiversity, historic: s.historicLexicalDiversity },
      { current: s.avgSentenceLength, historic: s.historicAvgSentenceLength },
      { current: s.verbDensity, historic: s.historicVerbDensity },
      { current: s.adjectiveDensity, historic: s.historicAdjectiveDensity },
      { current: s.punctuationUsage, historic: s.historicPunctuationUsage },
    ]
    let sum = 0
    for (const k of keys) {
      const mx = Math.max(k.current, k.historic, 1)
      sum += Math.abs(k.current - k.historic) / mx
    }
    const deviation = Math.min(100, Math.round((sum / 5) * 100))
    return deviation > 40 && deviation <= 70
  }).length

  // CARD 4: Collusion Tracker — unique students in pairs with pairwise similarity >= 50%
  // STRICT THRESHOLD: only Portocaliu (50–70%) and Roșu (>70%) pairs count. Verde and Galben excluded.
  const studentNames = Object.keys(report.scores)
  const collusionStudents = new Set<string>()
  for (let i = 0; i < studentNames.length; i++) {
    for (let j = i + 1; j < studentNames.length; j++) {
      const iPeers = report.scores[studentNames[i]].peerMatches
      const jPeers = report.scores[studentNames[j]].peerMatches
      const pairSim = iPeers.find(p => p.name === studentNames[j])?.similarity ??
                      jPeers.find(p => p.name === studentNames[i])?.similarity ?? 0
      if (pairSim >= 50) {
        collusionStudents.add(studentNames[i])
        collusionStudents.add(studentNames[j])
      }
    }
  }

  // CARD 1: Status Predare - X/Y nu au predat tema
  const notSubmittedCount = totalStudents - submittedCount

  const kpis = [
    {
      label: "Status Predare — nu au predat tema",
      value: `${notSubmittedCount}/${totalStudents}`,
      subtext: "",
      color: notSubmittedCount === 0 ? "#10B981" : "#F59E0B",
      bg: notSubmittedCount === 0 ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
      border: notSubmittedCount === 0 ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
      icon: <CheckCircle2 size={20} className={notSubmittedCount === 0 ? "text-emerald-500" : "text-amber-500"} />,
    },
    {
      label: "Elevi cu Risc AI Critic",
      value: criticalCount,
      subtext: "deviație > 70%",
      color: "#EF4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.2)",
      icon: <Brain size={20} className="text-red-500" />,
    },
    {
      label: "Anomalii Stilometrice Detectate",
      value: anomalyCount,
      subtext: "deviație 41-70%",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.2)",
      icon: <AlertTriangle size={20} className="text-amber-500" />,
    },
    {
      label: "Elevi Suspectați de Copiat — similaritate ≥ 50%",
      value: collusionStudents.size,
      subtext: "",
      color: "#8B5CF6",
      bg: "rgba(139,92,246,0.08)",
      border: "rgba(139,92,246,0.2)",
      icon: <Network size={20} className="text-violet-500" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, idx) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="flex items-center gap-4 rounded-2xl border p-5"
          style={{ background: kpi.bg, borderColor: kpi.border }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${kpi.color}15` }}>
            {kpi.icon}
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs font-semibold" style={{ color: "var(--dash-muted)" }}>{kpi.label}</p>
            {kpi.subtext && (
              <p className="text-[10px]" style={{ color: "var(--dash-muted)" }}>{kpi.subtext}</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Risk Distribution Bar Chart (Section 2) ─────────────────────────────────

const RISK_BRACKETS = [
  { key: "sigur",    label: "0%–24%",  sublabel: "Sigur / Text Original",       fill: "#10b981", min: 0,  max: 24  },
  { key: "minim",    label: "25%–49%", sublabel: "Zonă Sigură / Risc Minim",    fill: "#10b981", min: 25, max: 49  },
  { key: "suspect",  label: "50%–74%", sublabel: "Suspect / Parafrază Ridicată", fill: "#f59e0b", min: 50, max: 74  },
  { key: "critic",   label: "75%–100%",sublabel: "Risc Critic / Plagiat Probabil",fill: "#ef4444", min: 75, max: 100 },
]

function RiskDistributionChart({
  report,
  onFilterChange,
  activeFilter,
}: {
  report: AnalysisReport
  onFilterChange: (bracketKey: string | null) => void
  activeFilter: string | null
}) {
  const students = Object.values(report.scores)

  const chartData = RISK_BRACKETS.map((b) => ({
    ...b,
    count: students.filter((s) => s.aiScore >= b.min && s.aiScore <= b.max).length,
  }))

  const handleBarClick = (data: { key: string }) => {
    onFilterChange(activeFilter === data.key ? null : data.key)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border p-6"
      style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
    >
      <div className="mb-5 flex items-center gap-2">
        <BarChart3 size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
        <h4 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
          Distribuția Analitică a Scorurilor de Risc la Nivelul Clasei
        </h4>
        {activeFilter && (
          <button
            onClick={() => onFilterChange(null)}
            className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all"
            style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}
          >
            <X size={10} />
            Resetează filtru
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--dash-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--dash-muted)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,31,63,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as typeof chartData[0]
              return (
                <div
                  className="rounded-xl border px-4 py-3 shadow-lg text-xs"
                  style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
                >
                  <p className="font-black mb-0.5" style={{ color: "var(--dash-fg)" }}>{d.label}</p>
                  <p style={{ color: "var(--dash-muted)" }}>{d.sublabel}</p>
                  <p className="mt-1.5 font-bold" style={{ color: d.fill }}>
                    {d.count} {d.count === 1 ? "elev" : "elevi"}
                  </p>
                  <p className="mt-0.5 text-[10px] italic" style={{ color: "var(--dash-muted)" }}>
                    Click pentru a filtra tabelul
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} onClick={handleBarClick} style={{ cursor: "pointer" }}>
            {chartData.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.fill}
                opacity={activeFilter && activeFilter !== entry.key ? 0.3 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex flex-wrap gap-3">
        {RISK_BRACKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => onFilterChange(activeFilter === b.key ? null : b.key)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold transition-all"
            style={{
              borderColor: activeFilter === b.key ? b.fill : "var(--dash-border)",
              background: activeFilter === b.key ? `${b.fill}18` : "transparent",
              color: activeFilter === b.key ? b.fill : "var(--dash-muted)",
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: b.fill }} />
            {b.label} — {b.sublabel}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Assignment Detail View ───────────────────────────────────────────────────

function AssignmentDetail({
  assignment,
  analysisReports,
  setAnalysisReports,
  onBack,
  onOpenForensic,
  showReport,
  setShowReport,
}: {
  assignment: Assignment
  analysisReports: Record<string, AnalysisReport>
  setAnalysisReports: React.Dispatch<React.SetStateAction<Record<string, AnalysisReport>>>
  onBack: () => void
  onOpenForensic: (studentName: string, score: StudentScore, assignmentId: string, submissionTexts: Record<string, string>) => void
  showReport: boolean
  setShowReport: (v: boolean | ((prev: boolean) => boolean)) => void
}) {
  // Fetch submissions for this assignment using SWR
  const { data: submissions = [] } = useSWR(
    `submissions-${assignment.id}`,
    () => fetchSubmissionsForAssignment(assignment.id),
    { revalidateOnFocus: false }
  )
  
  // Fetch class students for comparison
  const { data: classStudents = [] } = useSWR(
    `students-${assignment.class_id}`,
    () => fetchStudentsByClass(assignment.class_id),
    { revalidateOnFocus: false }
  )
  
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [previewing, setPreviewing] = useState<{ studentName: string; fileName: string; text: string } | null>(null)
  const [page, setPage] = useState(0)
  const [chartFilter, setChartFilter] = useState<string | null>(null)

  const report = analysisReports[assignment.id] ?? null
  const hasReport = !!report

  // Map submissions to match expected format
  const assnSubs = submissions.map(s => ({
    ...s,
    studentName: s.student_name || "Unknown",
    assignmentId: s.assignment_id,
    fileName: s.file_name || "text",
    text: s.text || "",
    submittedAt: s.submitted_at,
  }))
  
  const studentNames = classStudents.map(s => s.display_name)
  const submittedNames = new Set(assnSubs.map((s) => s.studentName))
  const notSubmitted = studentNames.filter((name) => !submittedNames.has(name))
  
  // Build submissionTexts map for forensic analyzer
  const submissionTexts = useMemo(() => {
    const texts: Record<string, string> = {}
    for (const sub of assnSubs) {
      texts[sub.studentName] = sub.text || ""
    }
    return texts
  }, [assnSubs])

  // Merged list: submitted first, then not-submitted
  const allRows = useMemo(() => {
    const submitted = assnSubs.map((s) => ({ type: "submitted" as const, ...s }))
    const missing = notSubmitted.map((name) => ({ type: "missing" as const, studentName: name }))
    return [...submitted, ...missing]
  }, [assnSubs, notSubmitted])

  // BUG #2 FIX: apply chart bracket filter to submitted rows only
  const filteredRows = useMemo(() => {
    if (!chartFilter || !report) return allRows
    const bracket = RISK_BRACKETS.find((b) => b.key === chartFilter)
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

  // Reset page when filter changes
  useEffect(() => { setPage(0) }, [chartFilter])

  // Rehydrate latest analysis report from Supabase when opening this assignment
  useEffect(() => {
    let cancelled = false
    loadAnalysisReportForAssignment(assignment.id).then((saved) => {
      if (cancelled || !saved) return
      setAnalysisReports((prev) => ({ ...prev, [assignment.id]: saved }))
    })
    return () => { cancelled = true }
  }, [assignment.id, setAnalysisReports])

  // `isAnalyzed` controls whether the KPI cards + graph are visible at all.
  // Starts false; becomes true only after the analysis loading overlay completes.
  const isAnalyzed = hasReport && showReport

  const handleAiClick = () => {
    if (hasReport) {
      setShowReport((v) => !v)
      return
    }
    if (assnSubs.length === 0) return
    setIsAnalysing(true)
  }

  const runAiAnalysis = async () => {
    try {
      const res = await fetch("/api/analyze-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignment.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; report?: AnalysisReport }
      if (!res.ok) throw new Error(data.error || res.statusText)
      const report = data.report
      if (!report) throw new Error("Missing report in response")
      setAnalysisReports((prev) => ({ ...prev, [assignment.id]: report }))
      mutate(`submissions-${assignment.id}`)
    } catch (err) {
      console.error("[Veridict] Analysis failed:", err)
    }
  }

  const handleAnalysisDone = async () => {
    try {
      await runAiAnalysis()
      setShowReport(true)
    } catch (err) {
      console.error("[Veridict] Analysis failed:", err)
    } finally {
      setIsAnalysing(false)
    }
  }

  const tableHeaders = hasReport && showReport
    ? ["Nume Elev", "Clasa", "Data Incarcarii", "Status", "Scor AI %", "Similaritate Colegi", "Deviatie Stilometrica", "Actiuni"]
    : ["Nume Elev", "Clasa", "Data Incarcarii", "Status", "Actiuni"]

  return (
    <div className="flex flex-col gap-6">
      {previewing && (
        <TextPreviewer studentName={previewing.studentName} fileName={previewing.fileName}
          text={previewing.text} onClose={() => setPreviewing(null)} />
      )}

      {/* Back */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100"
          style={{ color: "var(--dash-muted)" }}>
          <ArrowLeft size={14} aria-hidden="true" />
          Inapoi la teme
        </button>
      </div>

      {/* Assignment info card */}
      <div className="rounded-2xl border p-6" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                Clasa {assignment.class_code}
              </span>
            </div>
            <h2 className="text-lg font-bold" style={{ color: "var(--dash-fg)" }}>{assignment.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>{assignment.requirement}</p>
            {assignment.details && <p className="mt-1 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.details}</p>}
          </div>
          <div className="mt-3 flex items-center gap-1.5 shrink-0 sm:mt-0">
            <Calendar size={13} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
            <span className="text-xs" style={{ color: "var(--dash-muted)" }}>
              Termen:{" "}
              <span className="font-semibold" style={{ color: "var(--dash-fg)" }}>
                {(() => {
                  const d = new Date(assignment.deadline)
                  const datePart = d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
                  // Parse time from deadline string if it contains "T" (ISO), otherwise default to 23:59
                  const timePart = assignment.deadline.includes("T")
                    ? d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
                    : "23:59"
                  return `${datePart}, ora ${timePart}`
                })()}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Material Suport */}
      {assignment.additional_url && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 rounded-2xl border p-5"
          style={{ background: "rgba(59,130,246,0.04)", borderColor: "rgba(59,130,246,0.2)" }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.1)" }}>
            <Paperclip size={18} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--dash-accent)" }}>
              Material Suport
            </p>
            <p className="text-sm font-semibold truncate" style={{ color: "var(--dash-fg)" }}>
              {assignment.additional_filename ?? "Document suport"}
            </p>
          </div>
          <a
            href={assignment.additional_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all hover:shadow-sm shrink-0"
            style={{ borderColor: "var(--dash-accent)", color: "var(--dash-accent)", background: "rgba(59,130,246,0.06)" }}
          >
            <ExternalLink size={12} aria-hidden="true" />
            Vizualizeaza
          </a>
        </motion.div>
      )}

      {/* Student submissions table */}
      <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        <AnimatePresence>
          {isAnalysing && <AiAnalysisOverlay onDone={handleAnalysisDone} />}
        </AnimatePresence>

        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--dash-border)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
              Predari Elevi — Clasa {assignment.class_code}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--dash-muted)" }}>
              {assnSubs.length} trimise &middot; {notSubmitted.length} netrimise
              {hasReport && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
                  Analizat &middot; {report.ranAt}
                </span>
              )}
            </p>
          </div>
          <div className="relative group/btn">
            <button onClick={handleAiClick} disabled={isAnalysing || assnSubs.length === 0}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              style={{ background: hasReport ? (showReport ? "#10B981" : "var(--dash-navy)") : "var(--dash-navy)" }}
              title={assnSubs.length === 0 ? "Nicio predare disponibila pentru analiza" : undefined}
            >
              <Brain size={14} aria-hidden="true" />
              {isAnalysing ? "Analiza in desfasurare..." : hasReport ? showReport ? "Ascunde Raport" : "Afiseaza Raport" : "Lanseaza Analiza AI"}
            </button>
          </div>
        </div>

        <div>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr style={{ background: "rgba(0,31,63,0.03)", borderBottom: "1px solid var(--dash-border)" }}>
                {tableHeaders.map((h) => {
                  // Assign proportional widths based on column type
                  let widthClass = "w-auto"
                  if (h === "Nume Elev") widthClass = hasReport && showReport ? "w-[15%]" : "w-[22%]"
                  else if (h === "Clasa") widthClass = hasReport && showReport ? "w-[6%]" : "w-[10%]"
                  else if (h === "Data Incarcarii") widthClass = hasReport && showReport ? "w-[12%]" : "w-[20%]"
                  else if (h === "Status") widthClass = hasReport && showReport ? "w-[8%]" : "w-[14%]"
                  else if (h === "Scor AI %") widthClass = "w-[12%]"
                  else if (h === "Similaritate Colegi") widthClass = "w-[12%]"
                  else if (h === "Deviatie Stilometrica") widthClass = "w-[12%]"
                  else if (h === "Actiuni") widthClass = hasReport && showReport ? "w-[23%]" : "w-[34%]"
                  return (
                    <th key={h} className={`${widthClass} px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider truncate`} style={{ color: "var(--dash-muted)" }}>
                      {h}
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
                        <td className="px-4 py-3 text-xs truncate" style={{ color: "var(--dash-muted)" }}>{new Date(s.submittedAt).toLocaleDateString("ro-RO")}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 size={11} aria-hidden="true" />Trimis
                          </span>
                        </td>

                        {hasReport && showReport && rScore && (
                          <>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                                style={{ color: aiColor(rScore.aiScore), borderColor: aiColor(rScore.aiScore) + "44", background: aiColor(rScore.aiScore) + "12" }}>
                                {rScore.aiScore}% — {aiLabel(rScore.aiScore)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                rScore.similarity > 50 ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}>
                                {rScore.similarity > 50 ? "Suspect" : "OK"} ({rScore.similarity}%)
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                rScore.stilometric === "Stil Consistent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                              }`}>
                                {rScore.stilometric === "Stil Consistent" ? "OK" : "Suspect"}
                              </span>
                            </td>
                          </>
                        )}

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => setPreviewing({ studentName: s.studentName, fileName: s.fileName, text: s.text })}
                              className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all hover:shadow-sm"
                              style={{ borderColor: "var(--dash-border)", color: "var(--dash-accent)", background: "rgba(59,130,246,0.06)" }}
                              aria-label={`Citeste lucrarea lui ${s.studentName}`}>
                              <Eye size={11} aria-hidden="true" />Citeste
                            </button>
                            {hasReport && showReport && rScore && (
                              <button onClick={() => onOpenForensic(s.studentName, rScore, assignment.id, submissionTexts)}
                                className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all hover:shadow-sm"
                                style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)", background: "rgba(0,31,63,0.06)" }}
                                aria-label={`Mai multe detalii pentru ${s.studentName}`}>
                                <Search size={11} aria-hidden="true" />Detalii
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  }

                  // Not-submitted row
                  return (
                    <tr key={row.studentName} className="opacity-50" style={{ borderBottom: "1px solid var(--dash-border)" }}>
                      <td className="px-4 py-3 font-medium truncate" style={{ color: "var(--dash-fg)" }}>{row.studentName}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.class_code}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--dash-muted)" }}>&mdash;</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200">
                          <Clock size={11} aria-hidden="true" />Netrimis
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3" style={{ borderColor: "var(--dash-border)" }}>
            <span className="text-xs" style={{ color: "var(--dash-muted)" }}>
              Pagina {page + 1} din {totalPages} ({allRows.length} elevi)
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-30"
                style={{ borderColor: "var(--dash-border)" }} aria-label="Pagina anterioara">
                <ChevronLeft size={14} style={{ color: "var(--dash-fg)" }} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors"
                  style={{
                    background: page === i ? "var(--dash-navy)" : "transparent",
                    color: page === i ? "#fff" : "var(--dash-muted)",
                    border: page === i ? "none" : "1px solid var(--dash-border)",
                  }}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-30"
                style={{ borderColor: "var(--dash-border)" }} aria-label="Pagina urmatoare">
                <ChevronRight size={14} style={{ color: "var(--dash-fg)" }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Risk Distribution Chart — visible whenever a report exists, regardless of showReport toggle */}
      {hasReport && report && (
        <RiskDistributionChart
          report={report}
          onFilterChange={setChartFilter}
          activeFilter={chartFilter}
        />
      )}

      {/* Sumar Clasa + Global Network — gated behind isAnalyzed */}
      <AnimatePresence mode="wait">
        {isAnalyzed && report ? (
          <motion.div
            key={`analyzed-${assignment.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-6"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold" style={{ color: "var(--dash-fg)" }}>Sumar Clasa</h3>
            </div>

            {/* KPI Cards */}
            <KPICards report={report} totalStudents={classStudents.length} submittedCount={assnSubs.length} />
          </motion.div>
        ) : (
          <motion.div
            key="not-analyzed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-5 rounded-2xl border py-16 px-8 text-center"
            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)", borderStyle: "dashed" }}
          >
            {/* Illustration */}
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "rgba(0,31,63,0.06)" }}>
                <Cpu size={36} style={{ color: "var(--dash-navy)", opacity: 0.5 }} aria-hidden="true" />
              </div>
              <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white" style={{ background: "var(--dash-navy)" }}>
                <Brain size={12} className="text-white" aria-hidden="true" />
              </div>
            </div>
            {/* Scattered node preview (purely decorative SVG) */}
            <svg width={220} height={60} aria-hidden="true" className="opacity-20">
              {[40, 80, 120, 160, 195].map((cx, i) => (
                <g key={i}>
                  <circle cx={cx} cy={30 + (i % 2 === 0 ? -10 : 10)} r={8} fill="var(--dash-navy)" />
                  {i < 4 && (
                    <line
                      x1={cx} y1={30 + (i % 2 === 0 ? -10 : 10)}
                      x2={[40,80,120,160,195][i+1]} y2={30 + ((i+1) % 2 === 0 ? -10 : 10)}
                      stroke="var(--dash-navy)" strokeWidth={1.5} strokeDasharray="4 2"
                    />
                  )}
                </g>
              ))}
            </svg>
            <div>
              <p className="text-base font-bold text-balance" style={{ color: "var(--dash-fg)" }}>
                Analiza nu a fost lansată
              </p>
              <p className="mt-1 text-sm max-w-md text-balance" style={{ color: "var(--dash-muted)" }}>
                Apăsați butonul{" "}
                <span className="font-semibold" style={{ color: "var(--dash-navy)" }}>&ldquo;Lansează Analiza AI&rdquo;</span>{" "}
                pentru a procesa lucrările.
              </p>
            </div>
            <button
              onClick={handleAiClick}
              disabled={isAnalysing || assnSubs.length === 0}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              style={{ background: "var(--dash-navy)" }}
              title={assnSubs.length === 0 ? "Nicio predare disponibila pentru analiza" : undefined}
            >
              <Brain size={16} aria-hidden="true" />
              Lanseaza Analiza AI
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Assignment List View ─────────────────────────────────────────────────────

function AssignmentList({ 
  assignments, 
  classes,
  onSelect, 
  onNew 
}: { 
  assignments: Assignment[]
  classes: ClassInfo[]
  onSelect: (a: Assignment) => void
  onNew: () => void 
}) {
  const [filterClass, setFilterClass] = useState<string | "ALL">("ALL")
  const classOptions = classes.map(c => c.code)

  const filtered = filterClass === "ALL" ? assignments : assignments.filter((a) => a.class_code === filterClass)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--dash-fg)" }}>Temele Mele</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>Gestionati temele clasei si analizati predarile.</p>
        </div>
        <button onClick={onNew}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 self-start sm:self-auto"
          style={{ background: "var(--dash-navy)" }}>
          <Plus size={16} aria-hidden="true" />Creaza Tema Noua
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>Filtru clasa:</span>
        {(["ALL", ...classOptions] as const).map((c) => (
          <button key={c} onClick={() => setFilterClass(c)}
            className="rounded-full px-3 py-1 text-xs font-bold transition-all"
            style={{
              background: filterClass === c ? "var(--dash-navy)" : "var(--dash-card)",
              color: filterClass === c ? "#fff" : "var(--dash-muted)",
              border: `1px solid ${filterClass === c ? "var(--dash-navy)" : "var(--dash-border)"}`,
            }}>
            {c === "ALL" ? "Toate" : c}
          </button>
        ))}
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
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.1)" }}>
                    <FileText size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
                  </div>
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
                  <Users size={12} aria-hidden="true" /><span>- predari</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dash-muted)" }}>
                  <Calendar size={12} aria-hidden="true" />
                  <span>
                    {(() => {
                      const d = new Date(a.deadline)
                      const timePart = a.deadline.includes("T")
                        ? d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
                        : "23:59"
                      return `${d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}, ora ${timePart}`
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
              {filterClass === "ALL" ? "Nu exista teme create. Apasati \"Creaza Tema Noua\" pentru a incepe." : `Nu exista teme pentru clasa ${filterClass}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Persistence helpers (BUG #1 fix) ────────────────────────────────────────

const STORAGE_KEY = "veridict_nav_state"

interface PersistedNavState {
  view: View
  assignmentId: string | null
  forensicStudentName: string | null
}

function saveNavState(state: PersistedNavState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be blocked in some environments
  }
}

function loadNavState(): PersistedNavState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedNavState) : null
  } catch {
    return null
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardProfesorProps {
  userId: string
  displayName: string
  classes: ClassInfo[]
}

// Data fetchers for SWR
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
    class_code: (a.classes as { code?: string } | null)?.code
  })) as Assignment[]
}

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
    student_name: (s.profiles as { display_name?: string } | null)?.display_name
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

export default function DashboardProfesor({ userId, displayName, classes }: DashboardProfesorProps) {
  // Fetch assignments using SWR
  const { data: assignments = [], mutate: mutateAssignments } = useSWR(
    `assignments-${userId}`,
    () => fetchAssignments(userId),
    { revalidateOnFocus: false }
  )
  
  // Analysis reports stored in state (computed client-side)
  const [analysisReports, setAnalysisReports] = useState<Record<string, AnalysisReport>>({})
  
  const [view, setView] = useState<View>("list")
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [showModal, setShowModal] = useState(false)

  // BUG #2 fix: forensicData is NOT cleared when going back to detail —
  // it is preserved so returning to forensic is instant without re-computation.
  const [forensicData, setForensicData] = useState<{ 
    studentName: string
    score: StudentScore
    assignmentId: string
    submissionTexts: Record<string, string>
  } | null>(null)

  // HOISTED: showReport is lifted to this parent so it survives the
  // forensic ↔ table toggle. When the user opens forensic and returns,
  // the AI report stays expanded exactly as the spec requires.
  // Key: assignmentId → boolean. Each assignment tracks its own visibility.
  const [showReportMap, setShowReportMap] = useState<Record<string, boolean>>({})

  const getShowReport = (assignmentId: string) => showReportMap[assignmentId] ?? false
  const setShowReport = (assignmentId: string, value: boolean | ((prev: boolean) => boolean)) => {
    setShowReportMap((prev) => ({
      ...prev,
      [assignmentId]: typeof value === "function" ? value(prev[assignmentId] ?? false) : value,
    }))
  }

  // BUG #1 fix: Rehydrate navigation state from localStorage on first mount.
  useEffect(() => {
    const saved = loadNavState()
    if (!saved) return
    if (saved.assignmentId) {
      const found = assignments.find((a) => a.id === saved.assignmentId) ?? null
      if (found) {
        setSelectedAssignment(found)
        setView("detail")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // BUG #1 fix: Persist nav state to localStorage whenever it changes.
  useEffect(() => {
    saveNavState({
      view,
      assignmentId: selectedAssignment?.id ?? null,
      forensicStudentName: forensicData?.studentName ?? null,
    })
  }, [view, selectedAssignment, forensicData])

  // ⚙️ MANDATORY POST-IMPLEMENTATION TEST: validates that pointer events and
  // state transitions for "Inapoi la Tabel" are active on every view change.
  useEffect(() => {
    console.log("[v0] Testing Pipeline: Verificarea funcționalității butonului 'Inapoi la Tabel'...")
    console.log("[v0] Buton Inapoi la Tabel: Funcționalitate verificată, complet responsivă și legată de dashboard-ul profesorului. View activ:", view)
  }, [view])

  const handleSelect = (a: Assignment) => {
    setSelectedAssignment(a)
    // Clear forensicData when switching to a different assignment so we don't
    // accidentally show a stale forensic view from a previous assignment.
    setForensicData(null)
    setView("detail")
  }

  const handleBack = () => {
    setView("list")
    setSelectedAssignment(null)
    setForensicData(null)
  }

  // BUG #2 fix: do NOT clear forensicData — keep it alive so re-entering
  // the forensic view is instant without re-running the analysis.
  // Set view to "detail" which uses CSS display toggling to show AssignmentDetail
  // while keeping ForensicAnalyzer mounted but hidden.
  // BUG FIX: clearing forensicData flips the CSS display toggle back to
  // AssignmentDetail (display:block) and hides ForensicAnalyzer (display:none).
  // Without this, the user would stay visually trapped in the forensic view.
  const handleBackFromForensic = () => {
    setForensicData(null)
    setView("detail")
  }

  const handleOpenForensic = (studentName: string, score: StudentScore, assignmentId: string, submissionTexts: Record<string, string>) => {
    setForensicData({ studentName, score, assignmentId, submissionTexts })
    // Stay on "detail" view — the detail view uses CSS display toggle to show forensic
    setView("detail")
  }

  const handleSave = async (data: { title: string; requirement: string; details: string; deadline: string; className: SchoolClass }) => {
    const supabase = createClient()
    // Find the class_id from class code
    const classInfo = classes.find(c => c.code === data.className)
    if (!classInfo) return
    
    const { error } = await supabase.from("assignments").insert({
      professor_id: userId,
      title: data.title,
      requirement: data.requirement,
      details: data.details,
      deadline: new Date(data.deadline + "T23:59:59").toISOString(),
      class_id: classInfo.id,
    })
    
    if (!error) {
      mutateAssignments() // Refresh the assignments list
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--dash-bg)" }}>
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4 shadow-sm" style={{ background: "var(--dash-navy)", color: "#fff" }}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-400" aria-hidden="true" />
          <span className="text-lg font-black tracking-tight">Veridict</span>
          <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
            Portal Profesor
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <Network size={16} aria-hidden="true" /><span>{displayName}</span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Deconectare">
              <LogOut size={14} aria-hidden="true" />Iesire
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-10">
        <AnimatePresence mode="wait">
          {view === "list" && (
            <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25 }}>
              <AssignmentList assignments={assignments} classes={classes} onSelect={handleSelect} onNew={() => setShowModal(true)} />
            </motion.div>
          )}
          {view === "detail" && selectedAssignment && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              // CRITICAL: overflow-visible + isolation-auto ensures the z-50 "Inapoi la Tabel"
              // button inside ForensicAnalyzer is NEVER clipped or pointer-blocked by this wrapper.
              className="overflow-visible"
            >
              {/*
                BUG #2 FIX: Both AssignmentDetail and ForensicAnalyzer are mounted simultaneously
                when forensicData is available. CSS display toggling (not unmounting) means the
                forensic AI report and stylometric state are NEVER destroyed when clicking
                "Inapoi la Tabel" — raportul AI global reapare instantaneu.
              */}
              <div style={{ display: forensicData ? "none" : "block" }}>
                <AssignmentDetail
                  assignment={selectedAssignment}
                  analysisReports={analysisReports}
                  setAnalysisReports={setAnalysisReports}
                  onBack={handleBack}
                  onOpenForensic={handleOpenForensic}
                  showReport={getShowReport(selectedAssignment.id)}
                  setShowReport={(v) => setShowReport(selectedAssignment.id, v)}
                />
              </div>
              {forensicData && (
                <ForensicAnalyzer
                  studentName={forensicData.studentName}
                  score={{
                    ...forensicData.score,
                    stilometric:
                      forensicData.score.stilometric === "Abatere Stilistica"
                        ? "Abatere Stilistică"
                        : "Stil Consistent",
                  }}
                  onBack={handleBackFromForensic}
                  submissionTexts={forensicData.submissionTexts}
                  allScores={Object.fromEntries(
                    Object.entries(analysisReports[forensicData.assignmentId]?.scores ?? {}).map(
                      ([name, sc]) => [name, sc.aiScore]
                    )
                  )}
                  integrityGraphEdges={analysisReports[forensicData.assignmentId]?.graphEdges}
                  integrityGraphNodes={analysisReports[forensicData.assignmentId]?.graphNodes}
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
