"use client"

import { useCallback, useMemo, useState } from "react"
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
import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"

const AXIS_CONFIG = [
  { key: "ttr" as const, label: "Diversitate Lexicală" },
  { key: "asl" as const, label: "Lungime Propoziții" },
  { key: "verbs" as const, label: "Densitate Verbe" },
  { key: "adjs" as const, label: "Densitate Adjective" },
  { key: "punct" as const, label: "Punctuație" },
]

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
  onAnalysisComplete?: (payload: {
    metrics: StylometryMetrics
    baseline_used: StylometryMetrics
    deviation: number
    verdict: StylometryVerdict
  }) => void
}

function hasMetrics(m?: StylometryMetrics | null): boolean {
  if (!m) return false
  return AXIS_CONFIG.some((a) => Number.isFinite(m[a.key]) && m[a.key] > 0)
}

function toChartRows(
  baseline: StylometryMetrics,
  current: StylometryMetrics,
) {
  return AXIS_CONFIG.map((axis) => ({
    subject: axis.label,
    historic: baseline[axis.key],
    current: current[axis.key],
  }))
}

function radarDomain(
  baseline: StylometryMetrics,
  current: StylometryMetrics,
): [number, number] {
  const vals = AXIS_CONFIG.flatMap((a) => [baseline[a.key], current[a.key]])
  const max = Math.max(...vals, 1)
  return [0, Math.ceil(max * 1.15)]
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
  onAnalysisComplete,
}: RadarStilometricTabProps) {
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

  const chartData = useMemo(() => {
    if (!metrics || !baseline) return []
    return toChartRows(baseline, metrics)
  }, [metrics, baseline])

  const domain = useMemo(() => {
    if (!metrics || !baseline) return [0, 100] as [number, number]
    return radarDomain(baseline, metrics)
  }, [metrics, baseline])

  const runAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/analyze-stilometrie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: assignmentId,
          submission_id: submissionId,
          analysis_score_id: analysisScoreId,
          student_id: studentId,
          text,
        }),
      })
      const data = (await res.json()) as {
        metrics?: StylometryMetrics
        baseline_used?: StylometryMetrics
        deviation?: number
        verdict?: StylometryVerdict
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Analiza stilometrică a eșuat")
      }
      if (!data.metrics || !data.baseline_used || data.deviation == null) {
        throw new Error("Răspuns invalid de la server")
      }
      const v =
        data.verdict ?? buildStylometryVerdict(data.deviation)
      setMetrics(data.metrics)
      setBaseline(data.baseline_used)
      setDeviation(data.deviation)
      setVerdict(v)
      onAnalysisComplete?.({
        metrics: data.metrics,
        baseline_used: data.baseline_used,
        deviation: data.deviation,
        verdict: v,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la analiză")
    } finally {
      setLoading(false)
    }
  }, [
    assignmentId,
    submissionId,
    analysisScoreId,
    studentId,
    text,
    onAnalysisComplete,
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
              Radar Stilometric — {studentName}
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
            {loading ? "Se calculează…" : "⚡ Calculează Raport Stilometric"}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border-red-200">
            {error}
          </p>
        )}

        {!showReport && !loading && (
          <p className="mt-4 text-xs" style={{ color: "var(--dash-muted)" }}>
            Apasă butonul pentru a extrage amprenta stilometrică (spaCy) și a o compara cu
            profilul istoric al elevului.
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
                Deviatie
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: verdict.color }}>
                {verdict.emoji} {verdict.label}
              </span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
                {verdict.message}
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
                  formatter={(value: number, name: string) => [
                    `${Number(value).toFixed(1)}`,
                    name === "historic" ? "Amprenta Istorică" : "Lucrarea Curentă",
                  ]}
                />
                <RechartsRadar
                  name="Amprenta Istorică"
                  dataKey="historic"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <RechartsRadar
                  name="Lucrarea Curentă"
                  dataKey="current"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.4}
                  strokeWidth={2.5}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(value) =>
                    value === "Amprenta Istorică" ? value : "Lucrarea Curentă"
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-5"
          >
            {AXIS_CONFIG.map((axis) => (
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
                  {axis.key === "asl" ? " cuv." : "%"}
                </p>
                <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
                  Istoric: {baseline[axis.key].toFixed(1)}
                  {axis.key === "asl" ? " cuv." : "%"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
