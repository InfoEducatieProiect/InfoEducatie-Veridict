"use client"

import { motion } from "framer-motion"
import { BarChart3, X } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { useLanguage } from "@/lib/i18n/language-provider"
import { RISK_BRACKET_DEFS, type AnalysisReport } from "./types"

interface RiskDistributionChartProps {
  report: AnalysisReport
  onFilterChange: (bracketKey: string | null) => void
  activeFilter: string | null
}

export default function RiskDistributionChart({ report, onFilterChange, activeFilter }: RiskDistributionChartProps) {
  const { t } = useLanguage()

  const RISK_BRACKETS = [
    { ...RISK_BRACKET_DEFS[0], sublabel: t("dashboardProfesor.riskSafe")     },
    { ...RISK_BRACKET_DEFS[1], sublabel: t("dashboardProfesor.riskSuspect")  },
    { ...RISK_BRACKET_DEFS[2], sublabel: t("dashboardProfesor.riskCritical") },
  ]

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
        <h4 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>{t("dashboardProfesor.chartTitle")}</h4>
        {activeFilter && (
          <button onClick={() => onFilterChange(null)}
            className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all"
            style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
            <X size={10} />{t("dashboardProfesor.chartResetFilter")}
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--dash-muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--dash-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(0,31,63,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as typeof chartData[0]
              return (
                <div className="rounded-xl border px-4 py-3 shadow-lg text-xs" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
                  <p className="font-black mb-0.5" style={{ color: "var(--dash-fg)" }}>{d.label}</p>
                  <p style={{ color: "var(--dash-muted)" }}>{d.sublabel}</p>
                  <p className="mt-1.5 font-bold" style={{ color: d.fill }}>
                    {d.count} {d.count === 1 ? t("dashboardProfesor.student1") : t("dashboardProfesor.studentsN")}
                  </p>
                  <p className="mt-0.5 text-[10px] italic" style={{ color: "var(--dash-muted)" }}>{t("dashboardProfesor.chartClickFilter")}</p>
                </div>
              )
            }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} onClick={handleBarClick} style={{ cursor: "pointer" }}>
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} opacity={activeFilter && activeFilter !== entry.key ? 0.3 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex flex-wrap gap-3">
        {RISK_BRACKETS.map((b) => (
          <button key={b.key} onClick={() => onFilterChange(activeFilter === b.key ? null : b.key)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold transition-all"
            style={{
              borderColor: activeFilter === b.key ? b.fill : "var(--dash-border)",
              background: activeFilter === b.key ? `${b.fill}18` : "transparent",
              color: activeFilter === b.key ? b.fill : "var(--dash-muted)",
            }}>
            <span className="h-2 w-2 rounded-full" style={{ background: b.fill }} />
            {b.label} — {b.sublabel}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
