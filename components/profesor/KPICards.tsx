"use client"

import { motion } from "framer-motion"
import { CheckCircle2, Brain, AlertTriangle, Network } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"
import type { AnalysisReport } from "./types"

interface KPICardsProps {
  report: AnalysisReport
  totalStudents: number
  submittedCount: number
}

export default function KPICards({ report, totalStudents, submittedCount }: KPICardsProps) {
  const { t } = useLanguage()
  const students = Object.values(report.scores)

  const calcDeviation = (s: typeof students[0]) => {
    const keys = [
      { current: s.lexicalDiversity,   historic: s.historicLexicalDiversity  },
      { current: s.avgSentenceLength,  historic: s.historicAvgSentenceLength  },
      { current: s.verbDensity,        historic: s.historicVerbDensity        },
      { current: s.adjectiveDensity,   historic: s.historicAdjectiveDensity   },
      { current: s.punctuationUsage,   historic: s.historicPunctuationUsage   },
    ]
    let sum = 0
    for (const k of keys) {
      const mx = Math.max(k.current, k.historic, 1)
      sum += Math.abs(k.current - k.historic) / mx
    }
    return Math.min(100, Math.round((sum / 5) * 100))
  }

  const criticalCount = students.filter((s) => calcDeviation(s) > 70).length
  const anomalyCount  = students.filter((s) => { const d = calcDeviation(s); return d > 40 && d <= 70 }).length

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

  const notSubmittedCount = totalStudents - submittedCount

  const kpis = [
    {
      label: t("dashboardProfesor.kpiNotSubmitted"),
      value: `${notSubmittedCount}/${totalStudents}`,
      color: notSubmittedCount === 0 ? "#10B981" : "#F59E0B",
      bg: notSubmittedCount === 0 ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
      border: notSubmittedCount === 0 ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
      icon: <CheckCircle2 size={20} className={notSubmittedCount === 0 ? "text-emerald-500" : "text-amber-500"} />,
      subtext: "",
    },
    {
      label: t("dashboardProfesor.kpiAiRisk"),
      value: criticalCount,
      color: "#EF4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.2)",
      icon: <Brain size={20} className="text-red-500" />,
      subtext: t("dashboardProfesor.kpiAiRiskSub"),
    },
    {
      label: t("dashboardProfesor.kpiStylometric"),
      value: anomalyCount,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.2)",
      icon: <AlertTriangle size={20} className="text-amber-500" />,
      subtext: t("dashboardProfesor.kpiStylometricSub"),
    },
    {
      label: t("dashboardProfesor.kpiCollusion"),
      value: collusionStudents.size,
      color: "#8B5CF6",
      bg: "rgba(139,92,246,0.08)",
      border: "rgba(139,92,246,0.2)",
      icon: <Network size={20} className="text-violet-500" />,
      subtext: "",
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
            {kpi.subtext && <p className="text-[10px]" style={{ color: "var(--dash-muted)" }}>{kpi.subtext}</p>}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
