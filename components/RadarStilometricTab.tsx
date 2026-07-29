"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Radar, Zap } from "lucide-react"
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { fetchStylometryScan } from "@/lib/stylometry-client"
import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"
import { useLanguage } from "@/lib/i18n/language-provider"

const AXIS_KEYS = ["ttr", "asl", "verbs", "adjs", "punct"] as const
type AxisKey = (typeof AXIS_KEYS)[number]

export interface RadarStilometricTabProps {
  studentName: string
  assignmentId: string
  submissionId: string
  analysisScoreId: string
  studentId: string
  text: string
  initialMetrics?: StylometryMetrics | null
  initialBaseline?: StylometryMetrics | null
  initialDeviation?: number | null
  initialVerdict?: StylometryVerdict | null
  autoRunOnMount?: boolean
  onAnalysisComplete?: (payload: {
    metrics: StylometryMetrics
    baseline_used: StylometryMetrics
    deviation: number
    verdict: StylometryVerdict
  }) => void
}

function hasMetrics(m?: StylometryMetrics | null): boolean {
  if (!m) return false
  return AXIS_KEYS.some((key) => Number.isFinite(m[key]) && m[key] > 0)
}

function toChartRows(
  baseline: StylometryMetrics,
  current: StylometryMetrics,
  axisConfig: { key: AxisKey; label: string }[],
) {
  return axisConfig.map((axis) => ({
    subject: axis.label,
    Istoric_Elev: baseline[axis.key],
    Lucrare_Curenta: current[axis.key],
  }))
}

function radarDomain(
  baseline: StylometryMetrics,
  current: StylometryMetrics,
): [number, number] {
  const vals = AXIS_KEYS.flatMap((key) => [baseline[key], current[key]])
  const max = Math.max(...vals, 1)
  return [0, Math.ceil(max * 1.15)]
}

type TFn = (key: string, vars?: Record<string, string | number>) => string

function getVerdictText(deviation: number, t: TFn): { label: string; message: string } {
  if (deviation < 22) return { label: t("radarTab.verdictOkLabel"), message: t("radarTab.verdictOkMsg") }
  if (deviation < 38) return { label: t("radarTab.verdictSuspectLabel"), message: t("radarTab.verdictSuspectMsg") }
  return { label: t("radarTab.verdictAlertLabel"), message: t("radarTab.verdictAlertMsg") }
}

export default function RadarStilometricTab({
  studentName,
  assignmentId,
  submissionId,
  analysisScoreId,
  studentId,
  text,
  initialMetrics,
  initialBaseline,
  initialDeviation,
  initialVerdict,
  autoRunOnMount = false,
  onAnalysisComplete,
}: RadarStilometricTabProps) {
  const { t } = useLanguage()

  const axisConfig = useMemo(() => [
    { key: "ttr" as const, label: t("radarTab.axisLexical") },
    { key: "asl" as const, label: t("radarTab.axisSentence") },
    { key: "verbs" as const, label: t("radarTab.axisVerbs") },
    { key: "adjs" as const, label: t("radarTab.axisAdjs") },
    { key: "punct" as const, label: t("radarTab.axisPunct") },
  ], [t])

  const seeded = hasMetrics(initialMetrics)

  const [metrics, setMetrics] = useState<StylometryMetrics | null>(
    seeded ? initialMetrics! : null,
  )
  const [baseline, setBaseline] = useState<StylometryMetrics | null>(
    initialBaseline && hasMetrics(initialBaseline)
      ? initialBaseline
      : seeded
        ? initialMetrics!
        : null,
  )
  const [deviation, setDeviation] = useState<number | null>(
    initialDeviation ?? (seeded ? 0 : null),
  )
  const [verdict, setVerdict] = useState<StylometryVerdict | null>(
    initialVerdict ??
      (initialDeviation != null
        ? buildStylometryVerdict(initialDeviation)
        : null),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRunAttempted = useRef(false)

  const chartData = useMemo(() => {
    if (!metrics || !baseline) return []
    return toChartRows(baseline, metrics, axisConfig)
  }, [metrics, baseline, axisConfig])

  const domain = useMemo(() => {
    if (!metrics || !baseline) return [0, 100] as [number, number]
    return radarDomain(baseline, metrics)
  }, [metrics, baseline])

  const applyScanResult = useCallback(
    (result: {
      metrics: StylometryMetrics
      baseline_used: StylometryMetrics
      deviation: number
      verdict: StylometryVerdict
    }) => {
      setMetrics(result.metrics)
      setBaseline(result.baseline_used)
      setDeviation(result.deviation)
      setVerdict(result.verdict)
      onAnalysisComplete?.(result)
    },
    [onAnalysisComplete],
  )

  const runAnalysis = useCallback(async () => {
    if (!text.trim() || !analysisScoreId || !studentId) {
      setError(t("radarTab.missingIds"))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await fetchStylometryScan({
        assignmentId,
        submissionId,
        analysisScoreId,
        studentId,
        text,
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      applyScanResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("radarTab.analysisError"))
    } finally {
      setLoading(false)
    }
  }, [
    assignmentId,
    submissionId,
    analysisScoreId,
    studentId,
    text,
    t,
    applyScanResult,
  ])

  useEffect(() => {
    if (!hasMetrics(initialMetrics)) return
    setMetrics(initialMetrics!)
    setBaseline(
      initialBaseline && hasMetrics(initialBaseline)
        ? initialBaseline
        : initialMetrics!,
    )
    setDeviation(initialDeviation ?? 0)
    setVerdict(
      initialVerdict ??
        (initialDeviation != null
          ? buildStylometryVerdict(initialDeviation)
          : buildStylometryVerdict(0)),
    )
  }, [initialMetrics, initialBaseline, initialDeviation, initialVerdict])

  useEffect(() => {
    autoRunAttempted.current = false
  }, [submissionId, analysisScoreId])

  useEffect(() => {
    if (!autoRunOnMount || hasMetrics(initialMetrics) || autoRunAttempted.current) return
    if (!text.trim() || !analysisScoreId || !studentId) return
    autoRunAttempted.current = true
    void runAnalysis()
  }, [
    autoRunOnMount,
    initialMetrics,
    text,
    analysisScoreId,
    studentId,
    runAnalysis,
  ])

  const showReport = metrics && baseline && deviation != null && verdict

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Radar size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
            <h4 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
              {t("radarTab.title", { name: studentName })}
            </h4>
          </div>
          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black text-white shadow-lg transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #001F3F 0%, #1e40af 55%, #3b82f6 100%)",
            }}
          >
            <Zap size={14} className={loading ? "animate-pulse" : ""} aria-hidden="true" />
            {loading ? t("radarTab.calculating") : t("radarTab.recalcBtn")}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border-red-200">
            {error}
          </p>
        )}

        {loading && !showReport && (
          <p className="mt-4 text-xs font-semibold" style={{ color: "var(--dash-muted)" }}>
            {t("radarTab.extracting")}
          </p>
        )}
      </div>

      {showReport && (
        <>
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 rounded-xl border p-4"
            style={{ background: verdict.bg, borderColor: verdict.color + "40" }}
          >
            <div
              className="flex flex-col items-center justify-center rounded-xl px-4 py-2 shrink-0"
              style={{ background: verdict.color + "20" }}
            >
              <span className="text-2xl font-black leading-none" style={{ color: verdict.color }}>
                {deviation}%
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
                style={{ color: verdict.color }}
              >
                {t("radarTab.deviationLabel")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: verdict.color }}>
                {verdict.emoji} {getVerdictText(deviation, t).label}
              </span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
                {getVerdictText(deviation, t).message}
              </p>
            </div>
          </motion.div>

          <div
            className="rounded-2xl border p-4"
            style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
          >
            <ResponsiveContainer width="100%" height={380}>
              <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="var(--dash-border)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "var(--dash-muted)", fontSize: 10, fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={domain}
                  tick={{ fill: "var(--dash-muted)", fontSize: 9 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--dash-card)",
                    border: "1px solid var(--dash-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    return [Number(value).toFixed(1), name]
                  }}
                />
                <RechartsRadar
                  name={t("radarTab.historic")}
                  dataKey="Istoric_Elev"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <RechartsRadar
                  name={t("radarTab.currentWork")}
                  dataKey="Lucrare_Curenta"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.4}
                  strokeWidth={2.5}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {axisConfig.map((axis) => (
              <div
                key={axis.key}
                className="rounded-xl border p-4"
                style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-2"
                  style={{ color: "var(--dash-accent)" }}
                >
                  {axis.label}
                </p>
                <p className="text-lg font-black" style={{ color: "#f97316" }}>
                  {metrics[axis.key].toFixed(1)}
                  {axis.key === "asl" ? t("radarTab.wordsAbbr") : "%"}
                </p>
                <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
                  {t("radarTab.historicPrefix")} {baseline[axis.key].toFixed(1)}
                  {axis.key === "asl" ? t("radarTab.wordsAbbr") : "%"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
