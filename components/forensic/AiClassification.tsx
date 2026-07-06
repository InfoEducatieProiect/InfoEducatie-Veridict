"use client"

import { motion } from "framer-motion"
import { ShieldAlert, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import type { StudentScore } from "@/lib/assignment-store"
import { useLanguage } from "@/lib/i18n/language-provider"

export default function AiClassification({ score }: { score: StudentScore }) {
  const { t } = useLanguage()
  const aiScore = score.aiScore

  const getClassification = () => {
    if (aiScore >= 75) {
      return {
        level: t("forensic.aiClassCriticalTitle"),
        color: "#EF4444",
        bgColor: "rgba(239,68,68,0.08)",
        borderColor: "rgba(239,68,68,0.25)",
        icon: <ShieldAlert size={28} className="text-red-500" />,
        description: t("forensic.aiClassCriticalDesc"),
      }
    }
    if (aiScore >= 20) {
      return {
        level: t("forensic.aiClassGreyTitle"),
        color: "#F59E0B",
        bgColor: "rgba(245,158,11,0.08)",
        borderColor: "rgba(245,158,11,0.25)",
        icon: <AlertTriangle size={28} className="text-amber-500" />,
        description: t("forensic.aiClassGreyDesc"),
      }
    }
    return {
      level: t("forensic.aiClassSafeTitle"),
      color: "#10B981",
      bgColor: "rgba(16,185,129,0.08)",
      borderColor: "rgba(16,185,129,0.25)",
      icon: <CheckCircle2 size={28} className="text-emerald-500" />,
      description: t("forensic.aiClassSafeDesc"),
    }
  }

  const classification = getClassification()

  const zones = [
    {
      range: "75% - 100%",
      label: t("forensic.aiClassCriticalTitle"),
      color: "#EF4444",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.18)",
      desc: t("forensic.aiClassCriticalDesc"),
      active: aiScore >= 75,
    },
    {
      range: "20% - 74%",
      label: t("forensic.aiClassGreyTitle"),
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.18)",
      desc: t("forensic.aiClassGreyDesc"),
      active: aiScore >= 20 && aiScore < 75,
    },
    {
      range: "Sub 20%",
      label: t("forensic.aiClassSafeTitle"),
      color: "#10B981",
      bg: "rgba(16,185,129,0.06)",
      border: "rgba(16,185,129,0.18)",
      desc: t("forensic.aiClassSafeDesc"),
      active: aiScore < 20,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      <div
        className="flex flex-col items-center gap-4 rounded-2xl border p-8"
        style={{ background: classification.bgColor, borderColor: classification.borderColor }}
      >
        <div className="flex items-center gap-3">
          {classification.icon}
          <span className="text-lg font-bold" style={{ color: classification.color }}>
            {classification.level}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black" style={{ color: classification.color }}>
            {aiScore}
          </span>
          <span className="text-xl font-bold" style={{ color: classification.color }}>%</span>
        </div>
        <p className="max-w-lg text-center text-sm leading-relaxed" style={{ color: "var(--dash-fg)" }}>
          {classification.description}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <Info size={14} style={{ color: "var(--dash-muted)" }} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dash-muted)" }}>
            {t("forensic.aiRiskThresholds")}
          </span>
        </div>
        {zones.map((zone) => (
          <motion.div
            key={zone.range}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-4 rounded-xl border p-4 transition-all"
            style={{
              background: zone.active ? zone.bg : "var(--dash-card)",
              borderColor: zone.active ? zone.border : "var(--dash-border)",
              opacity: zone.active ? 1 : 0.5,
            }}
          >
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${zone.color}18` }}
            >
              <span className="text-xs font-black" style={{ color: zone.color }}>
                {zone.range.split(" ")[0] === "Sub" ? "<20" : zone.range.split("%")[0]}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: zone.color }}>
                  {zone.label}
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--dash-muted)" }}>
                  ({zone.range})
                </span>
                {zone.active && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: `${zone.color}18`, color: zone.color }}
                  >
                    {t("forensic.aiActive")}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
                {zone.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
