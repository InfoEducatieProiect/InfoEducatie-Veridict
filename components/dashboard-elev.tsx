"use client"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  UploadCloud, LogOut, ShieldCheck, FileText,
  CheckCircle2, Clock, X, GraduationCap, ArrowLeft,
  Calendar, BookOpen, Paperclip, ExternalLink, Trash2,
  AlertCircle, Eye,
} from "lucide-react"
import useSWR, { mutate } from "swr"
import { createClient } from "@/lib/supabase/client"
import { signOut } from "@/app/actions/auth"
import { useLanguage } from "@/lib/i18n/language-provider"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  title: string
  requirement: string | null
  details: string | null
  deadline: string
  class_id: string
  class_code?: string
  professor_name?: string
}

interface Submission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  file_name: string | null
  text: string | null
  analysed: boolean
  assignment_title?: string
}

interface StagedFile {
  file: File
  name: string
  sizeLabel: string
}

type WorkspaceState =
  | { phase: "upload" }
  | { phase: "posted"; fileName: string; previewContent: string; isHtml: boolean }

// ─── Constants ────────────────────────────────────────────────────────────────
// CRITICAL DATA PRIVACY: The student interface must have NO AI metrics,
// NO percentages, NO graphs, and NO alerts.
// The status can only say "Trimis" or "In Evaluare".

const ACCEPTED_EXTENSIONS = [".txt", ".docx"]
const ACCEPTED_MIME = [
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchAssignments(classId: string): Promise<Assignment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("assignments")
    .select("*, classes(code), profiles!assignments_professor_id_fkey(display_name)")
    .eq("class_id", classId)
    .order("deadline", { ascending: true })

  if (error) throw error
  return (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    class_code: (a.classes as { code?: string } | null)?.code,
    professor_name: (a.profiles as { display_name?: string } | null)?.display_name
  })) as Assignment[]
}

async function fetchSubmissions(studentId: string): Promise<Submission[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("submissions")
    .select("*, assignments(title)")
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false })

  if (error) throw error
  return (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    assignment_title: (s.assignments as { title?: string } | null)?.title
  })) as Submission[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function validateFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase()
  const mimeOk = ACCEPTED_MIME.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
  if (!mimeOk) return true
  if (file.size > MAX_SIZE_BYTES) return true
  return false
}

// ─── Toast notification ───────────────────────────────────────────────────────

function ErrorToast({ message, onClose, closeLabel }: { message: string; onClose: () => void; closeLabel: string }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm"
        style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
        role="alert"
      >
        <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold text-red-700">{message}</p>
        <button onClick={onClose} className="shrink-0 flex h-5 w-5 items-center justify-center rounded hover:bg-red-100 transition-colors" aria-label={closeLabel}>
          <X size={12} className="text-red-500" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Upload Workspace ─────────────────────────────────────────────────────────

function UploadWorkspace({
  assignment,
  studentId,
  onBack,
  onPosted,
}: {
  assignment: Assignment
  studentId: string
  onBack: () => void
  onPosted: (fileName: string, previewContent: string, isHtml: boolean) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t, dateLocale } = useLanguage()

  const handleFile = useCallback((file: File) => {
    setErrorMsg(null)
    if (validateFile(file)) {
      setErrorMsg(t("dashboardElev.errInvalidFile"))
      return
    }
    setStagedFile({
      file,
      name: file.name,
      sizeLabel: formatBytes(file.size),
    })
  }, [t])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  const handlePosteaza = async () => {
    if (!stagedFile) return
    setIsPosting(true)
    try {
      const ext = "." + stagedFile.name.split(".").pop()?.toLowerCase()
      let textContent = ""
      let isHtml = false

      if (ext === ".txt") {
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsText(stagedFile.file, "UTF-8")
        })
      } else {
        const mammoth = await import("mammoth")
        const buffer = await stagedFile.file.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        textContent = result.value
        isHtml = true
      }

      const supabase = createClient()
      const { error } = await supabase
        .from("submissions")
        .insert({
          student_id: studentId,
          assignment_id: assignment.id,
          file_name: stagedFile.name,
          text: isHtml ? textContent.replace(/<[^>]*>/g, ' ').substring(0, 50000) : textContent.substring(0, 50000),
        })

      if (error) throw error

      mutate(`submissions-${studentId}`)
      onPosted(stagedFile.name, textContent, isHtml)
    } catch (err) {
      console.error("[v0] Upload error:", err)
      setErrorMsg(t("dashboardElev.errUpload"))
      setIsPosting(false)
    }
  }

  const formatDeadline = (deadline: string) => {
    const d = new Date(deadline)
    const datePart = d.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" })
    const timePart = deadline.includes("T")
      ? d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false })
      : "23:59"
    return `${datePart}, ${t("dashboardElev.atTime")} ${timePart}`
  }

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 w-fit rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100"
        style={{ color: "var(--dash-muted)" }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t("dashboardElev.backToAssignments")}
      </button>

      <div className="rounded-2xl border p-5" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
            {t("dashboardElev.classLabel", { code: assignment.class_code ?? "" })}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-accent)" }}>
            &middot; {t("dashboardElev.submissionFor")}
          </span>
        </div>
        <h2 className="text-lg font-bold" style={{ color: "var(--dash-fg)" }}>{assignment.title}</h2>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dash-muted)" }}>{assignment.requirement}</p>
        {assignment.details && (
          <p className="mt-1 text-xs" style={{ color: "var(--dash-muted)" }}>{assignment.details}</p>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--dash-muted)" }}>
          <Calendar size={12} aria-hidden="true" />
          <span>
            {t("dashboardElev.deadlineLabel")}{" "}
            <span className="font-semibold" style={{ color: "var(--dash-fg)" }}>
              {formatDeadline(assignment.deadline)}
            </span>
          </span>
        </div>
      </div>

      {errorMsg && <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} closeLabel={t("dashboardElev.closeNotif")} />}

      <div
        role="button"
        tabIndex={0}
        aria-label={t("dashboardElev.uploadZoneAria")}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !stagedFile && fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !stagedFile && fileInputRef.current?.click()}
        className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 transition-all duration-200 outline-none"
        style={{
          borderColor: isDragging ? "#3B82F6" : stagedFile ? "rgba(16,185,129,0.4)" : "var(--dash-navy)",
          background: isDragging ? "rgba(59,130,246,0.05)" : stagedFile ? "rgba(16,185,129,0.03)" : "var(--dash-card)",
          cursor: stagedFile ? "default" : "pointer",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <AnimatePresence mode="wait">
          {!stagedFile ? (
            <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-3 text-center pointer-events-none">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(0,31,63,0.08)" }}>
                <UploadCloud size={30} style={{ color: "var(--dash-navy)" }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--dash-fg)" }}>
                  {t("dashboardElev.dragOrSelect")}{" "}
                  <span style={{ color: "var(--dash-accent)" }}>{t("dashboardElev.selectFromDisk")}</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--dash-muted)" }}>
                  {t("dashboardElev.acceptedFormats")}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="staged" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 size={36} className="text-emerald-500" aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: "var(--dash-fg)" }}>{t("dashboardElev.fileReady")}</p>
              <p className="text-xs" style={{ color: "var(--dash-muted)" }}>
                {t("dashboardElev.clickPost")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {stagedFile && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-4 rounded-xl border px-4 py-3"
            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(59,130,246,0.08)" }}>
              <FileText size={17} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--dash-fg)" }}>{stagedFile.name}</p>
              <p className="text-xs" style={{ color: "var(--dash-muted)" }}>{stagedFile.sizeLabel}</p>
            </div>
            <button
              onClick={() => { setStagedFile(null); setErrorMsg(null) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all hover:bg-red-50 hover:border-red-200"
              style={{ borderColor: "var(--dash-border)" }}
              aria-label={t("dashboardElev.deleteFile", { name: stagedFile.name })}
            >
              <Trash2 size={14} className="text-red-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 z-40">
        <AnimatePresence>
          {stagedFile && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              onClick={handlePosteaza}
              disabled={isPosting}
              className="flex items-center gap-2.5 rounded-2xl px-6 py-3 text-sm font-black text-white shadow-xl transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ background: "var(--dash-navy)" }}
              aria-label={t("dashboardElev.postBtn")}
            >
              {isPosting ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {t("dashboardElev.posting")}
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t("dashboardElev.postBtn")}
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Post-Submission Preview ──────────────────────────────────────────────────

function SubmissionPreview({
  assignment,
  fileName,
  previewContent,
  isHtml,
  onBack,
}: {
  assignment: Assignment
  fileName: string
  previewContent: string
  isHtml: boolean
  onBack: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 w-fit rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100"
        style={{ color: "var(--dash-muted)" }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t("dashboardElev.backToAssignments")}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 rounded-2xl border p-5"
        style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.25)" }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(16,185,129,0.1)" }}>
          <CheckCircle2 size={22} className="text-emerald-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-700">{t("dashboardElev.successPost")}</p>
          <p className="text-xs truncate" style={{ color: "var(--dash-muted)" }}>
            {assignment.title} &mdash; {fileName}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
          {t("dashboardElev.statusSent")}
        </span>
      </motion.div>

      <div className="flex flex-col rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: "var(--dash-border)", background: "var(--dash-card)" }}>
        <div className="flex items-center gap-3 border-b px-5 py-3.5 shrink-0" style={{ borderColor: "var(--dash-border)", background: "var(--dash-navy)" }}>
          <Eye size={16} className="text-blue-300 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">{t("dashboardElev.previewTitle")}</p>
            <p className="text-xs truncate" style={{ color: "#93C5FD" }}>{fileName}</p>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{ maxHeight: "60vh", minHeight: "240px" }}
        >
          {isHtml ? (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed"
              style={{ color: "var(--dash-fg)" }}
              dangerouslySetInnerHTML={{ __html: previewContent }}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap select-text" style={{ color: "var(--dash-fg)" }}>
              {previewContent}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardElevProps {
  userId: string
  displayName: string
  classCode: string
  classId?: string
}

export default function DashboardElev({ userId, displayName, classCode, classId }: DashboardElevProps) {
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const { t, dateLocale } = useLanguage()

  const { data: assignments = [], isLoading: loadingAssignments } = useSWR(
    classId ? `assignments-${classId}` : null,
    () => fetchAssignments(classId!),
    { revalidateOnFocus: false }
  )

  const { data: submissions = [], isLoading: loadingSubmissions } = useSWR(
    `submissions-${userId}`,
    () => fetchSubmissions(userId),
    { revalidateOnFocus: false }
  )

  const submittedIds = new Set(submissions.map((s) => s.assignment_id))
  const pending = assignments.filter((a) => !submittedIds.has(a.id))

  const submittedWithTitle = submissions.map((s) => {
    const assn = assignments.find((a) => a.id === s.assignment_id)
    return {
      ...s,
      assignmentTitle: assn?.title ?? s.file_name ?? "Tema",
      className: assn?.class_code ?? classCode,
      deadline: assn?.deadline ?? "",
    }
  })

  const daysUntil = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const handlePosted = (fileName: string, previewContent: string, isHtml: boolean) => {
    if (!activeAssignment) return
    setWorkspace({ phase: "posted", fileName, previewContent, isHtml })
  }

  const handleBack = () => {
    setActiveAssignment(null)
    setWorkspace(null)
  }

  const isLoading = loadingAssignments || loadingSubmissions

  const formatDeadlineShort = (deadline: string) => {
    const d = new Date(deadline)
    const timePart = deadline.includes("T")
      ? d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false })
      : "23:59"
    return `${d.toLocaleDateString(dateLocale, { day: "numeric", month: "long" })}, ${t("dashboardElev.atTime")} ${timePart}`
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--dash-bg)" }}>
      <header className="flex items-center justify-between px-6 py-4 shadow-sm" style={{ background: "var(--dash-navy)", color: "#fff" }}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-400" aria-hidden="true" />
          <span className="text-lg font-black tracking-tight">Veridict</span>
          <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
            {t("dashboardElev.portalBadge")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <GraduationCap size={16} aria-hidden="true" />
            <span>{displayName}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
              {classCode}
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={t("common.logout")}
            >
              <LogOut size={14} aria-hidden="true" />{t("common.logout")}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeAssignment ? (
              workspace?.phase === "posted" ? (
                <motion.div key="preview" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                  <SubmissionPreview
                    assignment={activeAssignment}
                    fileName={workspace.fileName}
                    previewContent={workspace.previewContent}
                    isHtml={workspace.isHtml}
                    onBack={handleBack}
                  />
                </motion.div>
              ) : (
                <motion.div key="workspace" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                  <UploadWorkspace
                    assignment={activeAssignment}
                    studentId={userId}
                    onBack={handleBack}
                    onPosted={handlePosted}
                  />
                </motion.div>
              )
            ) : (
              <motion.div key="main" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }} className="flex flex-col gap-12">

                {/* Teme de Predat */}
                <section>
                  <div className="mb-5">
                    <h1 className="text-2xl font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardElev.assignmentsTitle")}</h1>
                    <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>
                      {t("dashboardElev.assignmentsSubtitle", { code: classCode })}
                    </p>
                  </div>

                  {pending.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: "var(--dash-border)" }}>
                      <CheckCircle2 size={28} className="text-emerald-500" aria-hidden="true" />
                      <p className="text-sm font-semibold" style={{ color: "var(--dash-muted)" }}>
                        {t("dashboardElev.allDone")}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AnimatePresence initial={false}>
                        {pending.map((a, idx) => (
                          <motion.button key={a.id}
                            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ delay: idx * 0.05, duration: 0.3 }}
                            onClick={() => { setActiveAssignment(a); setWorkspace({ phase: "upload" }) }}
                            className="group flex flex-col gap-3 rounded-2xl border p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.1)" }}>
                                <BookOpen size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
                              </div>
                              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
                                {t("dashboardElev.toSubmit")}
                              </span>
                            </div>
                            <div>
                              <p className="font-bold leading-snug text-balance" style={{ color: "var(--dash-fg)" }}>{a.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>{a.requirement}</p>
                            </div>
                            <div className="flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: "var(--dash-border)", color: "var(--dash-muted)" }}>
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} aria-hidden="true" />
                                <span>
                                  {t("dashboardElev.deadline")}:{" "}
                                  <span className="font-semibold" style={{ color: "var(--dash-fg)" }}>
                                    {formatDeadlineShort(a.deadline)}
                                  </span>
                                </span>
                              </div>
                              {(() => {
                                const days = daysUntil(a.deadline)
                                if (days <= 1) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{t("dashboardElev.urgent")}</span>
                                if (days <= 3) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t("dashboardElev.daysLeft", { days })}</span>
                                return null
                              })()}
                            </div>
                            <div className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors group-hover:bg-blue-50"
                              style={{ background: "rgba(0,31,63,0.06)", color: "var(--dash-navy)" }}>
                              <UploadCloud size={13} aria-hidden="true" />{t("dashboardElev.submitNow")}
                            </div>
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </section>

                {/* Istoric Predari */}
                <section>
                  <div className="mb-5">
                    <h2 className="text-xl font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardElev.historyTitle")}</h2>
                    <p className="mt-1 text-sm" style={{ color: "var(--dash-muted)" }}>
                      {t("dashboardElev.historySubtitle")}
                    </p>
                  </div>

                  {submittedWithTitle.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: "var(--dash-border)" }}>
                      <FileText size={24} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
                      <p className="text-sm" style={{ color: "var(--dash-muted)" }}>{t("dashboardElev.noSubmissions")}</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "var(--dash-border)", background: "var(--dash-card)" }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "rgba(0,31,63,0.03)", borderBottom: "1px solid var(--dash-border)" }}>
                            {[
                              t("dashboardElev.colTitle"),
                              t("dashboardElev.colClass"),
                              t("dashboardElev.colFile"),
                              t("dashboardElev.colDate"),
                              t("dashboardElev.colStatus"),
                            ].map((h) => (
                              <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence initial={false}>
                            {submittedWithTitle.map((s, idx) => (
                              <motion.tr key={s.id}
                                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className="hover:bg-blue-50/40 transition-colors"
                                style={{ borderBottom: "1px solid var(--dash-border)" }}>
                                <td className="px-5 py-3.5 font-semibold max-w-[180px] truncate" style={{ color: "var(--dash-fg)" }}>
                                  {s.assignmentTitle}
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
                                    {s.className}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dash-muted)" }}>
                                    <FileText size={13} aria-hidden="true" />
                                    <span className="truncate max-w-[160px]">{s.file_name}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: "var(--dash-muted)" }}>
                                  {new Date(s.submitted_at).toLocaleString(dateLocale, {
                                    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                                  })}
                                </td>
                                <td className="px-5 py-3.5">
                                  {/* CRITICAL DATA PRIVACY: Only statusSent or statusPending */}
                                  {s.analysed ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
                                      <CheckCircle2 size={11} aria-hidden="true" />{t("dashboardElev.statusSent")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                                      <Clock size={11} aria-hidden="true" />{t("dashboardElev.statusPending")}
                                    </span>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}
