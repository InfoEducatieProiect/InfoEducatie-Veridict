"use client"

import { useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { Globe, AlertTriangle, ExternalLink, ShieldCheck, Eye } from "lucide-react"
import {
  type RaportPlagiatWeb,
  hitScorPct,
  hitScorUnit,
  translateVerdict,
  apiReportToUi,
} from "@/lib/plagiarism-formatters"
import { useLanguage } from "@/lib/i18n/language-provider"
import TextPreviewer from "../profesor/TextPreviewer"

interface WebScannerPanelProps {
  studentName: string
  assignmentId: string
  submissionId: string
  text: string
  initialReport: RaportPlagiatWeb | null
  onReport?: (report: RaportPlagiatWeb) => void
}

function badgeColorForScor(scor: number): { bg: string; text: string } {
  if (scor >= 0.6) return { bg: "rgba(239,68,68,0.12)", text: "#B91C1C" }
  if (scor >= 0.4) return { bg: "rgba(245,158,11,0.12)", text: "#92400E" }
  return { bg: "rgba(16,185,129,0.10)", text: "#065F46" }
}

export default function WebScannerPanel({
  studentName,
  assignmentId,
  submissionId,
  text,
  initialReport,
  onReport,
}: WebScannerPanelProps) {
  const { t } = useLanguage()
  const [rezultatPlagiatWeb, setRezultatPlagiatWeb] = useState<RaportPlagiatWeb | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  const runScan = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/forensic/plagiarism", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignment_id: assignmentId,
            submission_id: submissionId,
            force,
          }),
        })
        const data = (await res.json()) as {
          report?: {
            verdict: string
            scor_maxim: number
            sursa_principala: string | null
            plagiarism_urls?: { url: string; scor?: number; score?: number }[]
          }
          error?: string
        }
        if (!res.ok) {
          throw new Error(data.error ?? t("forensic.webScanFailed"))
        }
        if (!data.report) {
          throw new Error(t("forensic.webInvalidResponse"))
        }
        const ui = apiReportToUi(data.report)
        setRezultatPlagiatWeb(ui)
        onReport?.(ui)
      } catch (e) {
        setError(e instanceof Error ? e.message : t("forensic.webScanError"))
      } finally {
        setLoading(false)
      }
    },
    [assignmentId, submissionId, onReport, t],
  )

  useEffect(() => {
    if (initialReport) {
      setRezultatPlagiatWeb(initialReport)
      return
    }
    void runScan(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per submission
  }, [assignmentId, submissionId])

  if (loading && !rezultatPlagiatWeb) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center"
        style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
      >
        <Globe size={32} className="animate-pulse" style={{ color: "var(--dash-accent)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--dash-fg)" }}>
          {t("forensic.webScanningFor", { name: studentName })}
        </p>
        <p className="text-xs" style={{ color: "var(--dash-muted)" }}>
          {t("forensic.webScanningSubtitle")}
        </p>
      </div>
    )
  }

  if (error && !rezultatPlagiatWeb) {
    return (
      <div
        className="rounded-2xl border p-6 text-center"
        style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
      >
        <p className="text-sm font-bold text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void runScan(true)}
          className="mt-3 rounded-lg px-4 py-2 text-xs font-bold text-white"
          style={{ background: "var(--dash-navy)" }}
        >
          {t("forensic.webRetry")}
        </button>
      </div>
    )
  }

  if (!rezultatPlagiatWeb) return null

  const urlHits = rezultatPlagiatWeb.top_surse
  const hasDetections =
    urlHits.length > 0 ||
    !!rezultatPlagiatWeb.sursa_principala ||
    rezultatPlagiatWeb.scor_maxim > 0
  const scorMaximPct = Math.round(
    rezultatPlagiatWeb.scor_maxim <= 1
      ? rezultatPlagiatWeb.scor_maxim * 100
      : rezultatPlagiatWeb.scor_maxim,
  )
  const verdictLower = rezultatPlagiatWeb.verdict.toLowerCase()
  const scanIncomplete =
    verdictLower.includes("incomplet") || verdictLower.includes("verifica gemini")

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed max-w-xl" style={{ color: "var(--dash-muted)" }}>
          {translateVerdict(rezultatPlagiatWeb.verdict, scorMaximPct, t)}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setReading(true)}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
            style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)" }}
            aria-label={t("dashboardProfesor.readAria", { name: studentName })}
          >
            <Eye size={13} aria-hidden="true" />
            {t("dashboardProfesor.readBtn")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runScan(true)}
            className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
            style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)" }}
          >
            {loading ? t("forensic.webScanning") : t("forensic.webRescan")}
          </button>
        </div>
      </div>

      {reading && (
        <TextPreviewer
          studentName={studentName}
          fileName=""
          text={text}
          onClose={() => setReading(false)}
        />
      )}

      {scanIncomplete && (
        <div
          className="rounded-xl border px-4 py-3 text-xs"
          style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.35)", color: "#92400E" }}
        >
          {t("forensic.webScanIncomplete")}
        </div>
      )}

      {!hasDetections && !scanIncomplete && (
        <motion.div
          key="curat"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 rounded-2xl border p-10 text-center"
          style={{ background: "rgba(16,185,129,0.05)", borderColor: "rgba(16,185,129,0.25)" }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(16,185,129,0.12)" }}>
            <ShieldCheck size={28} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-black" style={{ color: "#065F46" }}>
              {t("forensic.webAuthentic")}
            </p>
            <p className="mt-1.5 text-sm max-w-md leading-relaxed" style={{ color: "#047857" }}>
              {t("forensic.webNoMatches")}
            </p>
          </div>
        </motion.div>
      )}

      {hasDetections && (
        <motion.div
          key="detectat"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-5"
        >
          <div
            className="flex items-start gap-4 rounded-2xl border p-5"
            style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(239,68,68,0.12)" }}>
              <AlertTriangle size={20} className="text-red-500" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-black" style={{ color: "#B91C1C" }}>
                {translateVerdict(rezultatPlagiatWeb.verdict, scorMaximPct, t)}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
                {t("forensic.webMaxScore")}{" "}
                <span className="font-bold" style={{ color: "#B91C1C" }}>{scorMaximPct}%</span>
                {rezultatPlagiatWeb.sursa_principala && (
                  <>
                    {" "}— {t("forensic.webPrimarySource")}{" "}
                    <a
                      href={rezultatPlagiatWeb.sursa_principala}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 break-all"
                      style={{ color: "var(--dash-accent)" }}
                    >
                      {rezultatPlagiatWeb.sursa_principala}
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>

          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
          >
            <div className="border-b px-5 py-3" style={{ borderColor: "var(--dash-border)", background: "rgba(0,31,63,0.03)" }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--dash-fg)" }}>
                {t("forensic.webSourcesTitle")}
              </p>
            </div>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--dash-border)" }}>
              {urlHits.map((item, idx) => {
                const pct = hitScorPct(item)
                const unitScor = hitScorUnit(item)
                const { bg, text } = badgeColorForScor(unitScor)
                return (
                  <div
                    key={`${item.url}-${idx}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 border-b"
                    style={{ borderColor: "var(--dash-border)" }}
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-xs underline underline-offset-2 truncate text-blue-600 hover:underline"
                      title={item.url}
                    >
                      <ExternalLink size={11} aria-hidden="true" className="shrink-0" />
                      <span className="truncate max-w-xl">{item.url}</span>
                    </a>
                    <span
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-black"
                      style={{ background: bg, color: text }}
                    >
                      {pct}% {t("forensic.webMatchSuffix")}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3"
        style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#78350F" }}
        role="note"
        aria-label={t("forensic.webNote")}
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="text-xs leading-relaxed">
          <span className="font-bold">{t("forensic.webNote")}</span> {t("forensic.webNoteText")}
        </p>
      </div>
    </motion.div>
  )
}
