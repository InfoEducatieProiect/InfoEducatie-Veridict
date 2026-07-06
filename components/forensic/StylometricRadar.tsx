"use client"

import { motion } from "framer-motion"
import { Radar } from "lucide-react"
import type { StudentScore } from "@/lib/assignment-store"
import { useLanguage } from "@/lib/i18n/language-provider"

type TFn = (key: string, vars?: Record<string, string | number>) => string

const RADAR_AXES = [
  { key: "lexicalDiversity",   historicKey: "historicLexicalDiversity",   axisKey: "axisLexical"  },
  { key: "avgSentenceLength",  historicKey: "historicAvgSentenceLength",   axisKey: "axisSentence" },
  { key: "verbDensity",        historicKey: "historicVerbDensity",         axisKey: "axisVerbs"    },
  { key: "adjectiveDensity",   historicKey: "historicAdjectiveDensity",    axisKey: "axisAdjs"     },
  { key: "punctuationUsage",   historicKey: "historicPunctuationUsage",    axisKey: "axisPunct"    },
] as const

function computeDeviation(score: StudentScore): number {
  let sum = 0
  for (const a of RADAR_AXES) {
    const vc = score[a.key as keyof StudentScore] as number
    const vh = score[a.historicKey as keyof StudentScore] as number
    const mx = Math.max(vc, vh, 1)
    sum += Math.abs(vc - vh) / mx
  }
  return Math.min(100, Math.round((sum / 5) * 100))
}

function getDeviationTier(pct: number, t: TFn) {
  if (pct <= 40) {
    return { label: t("forensic.devOkLabel"), color: "#10B981", bg: "rgba(16,185,129,0.12)", message: t("forensic.devOkMsg") }
  }
  if (pct <= 70) {
    return { label: t("forensic.devSuspectLabel"), color: "#F97316", bg: "rgba(249,115,22,0.12)", message: t("forensic.devSuspectMsg") }
  }
  return { label: t("forensic.devCriticalLabel"), color: "#EF4444", bg: "rgba(239,68,68,0.12)", message: t("forensic.devCriticalMsg") }
}

export default function StylometricRadar({ score }: { score: StudentScore }) {
  const { t } = useLanguage()
  const svgW = 520
  const svgH = 520
  const cx = svgW / 2
  const cy = svgH / 2
  const maxR = 130
  const levels = 5

  const deviation = computeDeviation(score)
  const tier = getDeviationTier(deviation, t)

  const getPoint = (axisIndex: number, value: number) => {
    const angle = (2 * Math.PI * axisIndex) / RADAR_AXES.length - Math.PI / 2
    const r = (value / 100) * maxR
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  const currentPoints = RADAR_AXES.map((axis, i) => getPoint(i, score[axis.key as keyof StudentScore] as number))
  const historicPoints = RADAR_AXES.map((axis, i) => getPoint(i, score[axis.historicKey as keyof StudentScore] as number))

  const currentPath  = currentPoints.map((p)  => `${p.x},${p.y}`).join(" ")
  const historicPath = historicPoints.map((p) => `${p.x},${p.y}`).join(" ")

  const getLabelProps = (i: number) => {
    const angle = (2 * Math.PI * i) / RADAR_AXES.length - Math.PI / 2
    const labelR = maxR + 44
    const x = cx + labelR * Math.cos(angle)
    const y = cy + labelR * Math.sin(angle)
    const angleDeg = (angle * 180) / Math.PI
    let textAnchor: "middle" | "start" | "end" = "middle"
    let dx = 0
    let dy = 0
    if (angleDeg >= -100 && angleDeg <= -80) { textAnchor = "middle"; dy = -10 }
    else if (angleDeg > -80 && angleDeg < 10) { textAnchor = "start"; dx = 10 }
    else if (angleDeg >= 10 && angleDeg <= 100) { textAnchor = "start"; dx = 10; dy = 4 }
    else if (angleDeg > 100 && angleDeg <= 170) { textAnchor = "end"; dx = -10; dy = 4 }
    else { textAnchor = "end"; dx = -10 }
    return { x: x + dx, y: y + dy, textAnchor }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-6"
      style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Radar size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
        <h4 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
          {t("forensic.radarTitle")}
        </h4>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-5 flex items-center gap-4 rounded-xl border p-4"
        style={{ background: tier.bg, borderColor: tier.color + "40" }}
      >
        <div className="flex flex-col items-center justify-center rounded-xl px-4 py-2 shrink-0" style={{ background: tier.color + "20" }}>
          <span className="text-2xl font-black leading-none" style={{ color: tier.color }}>{deviation}%</span>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: tier.color }}>{t("forensic.devLabel")}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-black uppercase tracking-wider" style={{ color: tier.color }}>
            {t("forensic.devBadge")} {tier.label}
          </span>
          <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
            {tier.message}
          </p>
        </div>
      </motion.div>

      <div className="flex justify-center">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} aria-label="Radar chart stilometric">
          {Array.from({ length: levels }, (_, i) => {
            const r = ((i + 1) / levels) * maxR
            const points = RADAR_AXES.map((_, j) => {
              const angle = (2 * Math.PI * j) / RADAR_AXES.length - Math.PI / 2
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
            }).join(" ")
            return <polygon key={i} points={points} fill="none" stroke="var(--dash-border)" strokeWidth={1} opacity={0.6} />
          })}
          {RADAR_AXES.map((_, i) => {
            const angle = (2 * Math.PI * i) / RADAR_AXES.length - Math.PI / 2
            return <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(angle)} y2={cy + maxR * Math.sin(angle)} stroke="var(--dash-border)" strokeWidth={1} opacity={0.4} />
          })}
          <motion.polygon points={historicPath} fill="rgba(0,31,63,0.15)" stroke="#001F3F" strokeWidth={2} strokeDasharray="6 3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
          <motion.polygon points={currentPath} fill="rgba(249,115,22,0.18)" stroke="#F97316" strokeWidth={2.5} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
          {currentPoints.map((p, i) => (
            <motion.circle key={`c-${i}`} cx={p.x} cy={p.y} r={4} fill="#F97316" stroke="#fff" strokeWidth={1.5} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.1 }} />
          ))}
          {historicPoints.map((p, i) => (
            <motion.circle key={`h-${i}`} cx={p.x} cy={p.y} r={3} fill="#001F3F" stroke="#fff" strokeWidth={1} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.1 }} />
          ))}
          {RADAR_AXES.map((axis, i) => {
            const props = getLabelProps(i)
            const lineHeight = 13
            const startDy = -(lineHeight / 2)
            const axisLabel = t(`radarTab.${axis.axisKey}`)
            const spaceIdx = axisLabel.indexOf(" ")
            const line1 = spaceIdx === -1 ? axisLabel : axisLabel.slice(0, spaceIdx)
            const line2 = spaceIdx === -1 ? "" : axisLabel.slice(spaceIdx + 1)
            return (
              <text key={axis.key} x={props.x} y={props.y} textAnchor={props.textAnchor} fontSize={10} fontWeight="600" fill="var(--dash-muted)">
                <tspan x={props.x} dy={startDy}>{line1}</tspan>
                <tspan x={props.x} dy={lineHeight}>{line2}</tspan>
              </text>
            )
          })}
        </svg>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs" style={{ color: "var(--dash-muted)" }}>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#001F3F" }} />
          {t("forensic.radarLegendHistoric")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#F97316" }} />
          {t("forensic.radarLegendCurrent")}
        </span>
      </div>

      <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--dash-border)" }}>
        <h5 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--dash-muted)" }}>
          {t("forensic.stylometricDetails")}
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { key: "lexicalDiversity", histKey: "historicLexicalDiversity", axisKey: "axisLexical", suffix: "%" },
            { key: "avgSentenceLength", histKey: "historicAvgSentenceLength", axisKey: "axisSentence", suffix: "radarTab.wordsAbbr" },
            { key: "verbDensity", histKey: "historicVerbDensity", axisKey: "axisVerbs", suffix: "%" },
            { key: "punctuationUsage", histKey: "historicPunctuationUsage", axisKey: "axisPunct", suffix: "%" },
            { key: "adjectiveDensity", histKey: "historicAdjectiveDensity", axisKey: "axisAdjs", suffix: "%" },
          ].map(({ key, histKey, axisKey, suffix }) => {
            const val = score[key as keyof StudentScore] as number
            const hist = score[histKey as keyof StudentScore] as number
            const unit = suffix.startsWith("radarTab") ? t(suffix) : suffix
            return (
              <div key={key} className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
                  {t(`radarTab.${axisKey}`)}
                </p>
                <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>{val.toFixed(1)}{unit}</p>
                <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
                  {t("forensic.historicAvg")} {hist.toFixed(1)}{unit}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
