"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Network, ShieldCheck, ShieldAlert, GitCompare } from "lucide-react"
import type { StudentScore } from "@/lib/assignment-store"
import { useLanguage } from "@/lib/i18n/language-provider"
import DualComparisonModal from "./DualComparisonModal"

interface LocalSimilarityGraphProps {
  studentName: string
  score: StudentScore
  submissionTexts: Record<string, string>
}

export default function LocalSimilarityGraph({
  studentName,
  score,
  submissionTexts,
}: LocalSimilarityGraphProps) {
  const { t } = useLanguage()
  const [comparison, setComparison] = useState<{ peerName: string; similarity: number } | null>(null)
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null)

  const criticalPeers = score.peerMatches.filter((p) => p.similarity >= 50)
  const hasCriticalPeers = criticalPeers.length > 0
  const collisionList = [...criticalPeers].sort((a, b) => b.similarity - a.similarity)

  const cx = 280
  const cy = 180
  const centerR = 28

  if (!hasCriticalPeers) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 rounded-xl border p-8 text-center bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50"
      >
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ShieldCheck size={32} className="text-emerald-600 dark:text-emerald-400" />
        </motion.div>
        <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
          {t("forensic.cleanTitle")}
        </h3>
        <p className="text-sm max-w-md text-emerald-700 dark:text-emerald-300 leading-relaxed">
          {t("forensic.cleanMsg")}
        </p>
      </motion.div>
    )
  }

  const peerPositions = criticalPeers.map((_, i) => {
    const angle = (2 * Math.PI * i) / criticalPeers.length - Math.PI / 2
    const r = 120
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })

  const activePair = selectedPairKey
    ? collisionList.find((p) => p.name === selectedPairKey) ?? null
    : null

  return (
    <>
      <AnimatePresence>
        {comparison && (
          <DualComparisonModal
            studentA={studentName}
            studentB={comparison.peerName}
            textA={submissionTexts[studentName] ?? ""}
            textB={submissionTexts[comparison.peerName] ?? ""}
            similarity={comparison.similarity}
            onClose={() => setComparison(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col rounded-2xl border overflow-hidden lg:w-64 shrink-0"
          style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
        >
          <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--dash-border)", background: "rgba(0,31,63,0.04)" }}>
            <ShieldAlert size={14} style={{ color: "#EF4444" }} aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--dash-fg)" }}>
              {t("forensic.suspectPairs")}
            </span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-black"
              style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}
            >
              {collisionList.length}
            </span>
          </div>

          <div className="flex flex-col divide-y" style={{ borderColor: "var(--dash-border)" }}>
            {collisionList.map((peer, idx) => {
              const isSelected = selectedPairKey === peer.name
              const isHighRisk = peer.similarity > 70
              const badgeColor = isHighRisk ? "#EF4444" : "#F97316"
              return (
                <motion.button
                  key={peer.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  onClick={() => setSelectedPairKey(isSelected ? null : peer.name)}
                  className="flex flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  style={{
                    background: isSelected ? "rgba(245,158,11,0.06)" : undefined,
                    borderLeft: isSelected ? "3px solid #F59E0B" : "3px solid transparent",
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate" style={{ color: "var(--dash-fg)" }}>
                      {studentName.split(" ")[0]} vs {peer.name.split(" ")[0]}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{ background: `${badgeColor}15`, color: badgeColor }}
                    >
                      {peer.similarity}%
                    </span>
                  </div>
                  <span className="text-[10px] truncate" style={{ color: "var(--dash-muted)" }}>
                    {peer.name}
                  </span>
                  <AnimatePresence>
                    {isSelected && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="self-start rounded-full px-2.5 py-0.5 text-[10px] font-black border"
                        style={{
                          background: "rgba(245,158,11,0.15)",
                          color: "#92400E",
                          borderColor: "#F59E0B",
                        }}
                      >
                        {t("forensic.vocabSim", { pct: peer.similarity.toFixed(1) })}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              )
            })}
          </div>

          {activePair && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-t p-3"
              style={{ borderColor: "var(--dash-border)" }}
            >
              <button
                onClick={() => setComparison({ peerName: activePair.name, similarity: activePair.similarity })}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: "var(--dash-navy)" }}
              >
                <GitCompare size={12} aria-hidden="true" />
                {t("forensic.openComparison")}
              </button>
            </motion.div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 rounded-2xl border p-6"
          style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <Network size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
            <h4 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
              {t("forensic.graphTitle")}
            </h4>
          </div>
          <div className="flex justify-center overflow-x-auto">
            <svg width="560" height="360" aria-label={t("forensic.graphAria", { name: studentName })}>
              {criticalPeers.map((peer, i) => {
                const isHighRisk = peer.similarity > 70
                const mx = (cx + peerPositions[i].x) / 2
                const my = (cy + peerPositions[i].y) / 2
                const edgeColor = isHighRisk ? "#EF4444" : "#F97316"
                return (
                  <g
                    key={peer.name}
                    className="cursor-pointer"
                    onClick={() => setComparison({ peerName: peer.name, similarity: peer.similarity })}
                    role="button"
                    aria-label={t("forensic.edgeAria", { a: studentName, b: peer.name, sim: peer.similarity })}
                  >
                    <line x1={cx} y1={cy} x2={peerPositions[i].x} y2={peerPositions[i].y} stroke="transparent" strokeWidth={18} />
                    <motion.line
                      x1={cx} y1={cy}
                      x2={peerPositions[i].x} y2={peerPositions[i].y}
                      stroke={edgeColor}
                      strokeWidth={isHighRisk ? 2.5 : 2}
                      strokeOpacity={0.8}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.8, delay: i * 0.15 }}
                    />
                    <circle cx={mx} cy={my} r={10} fill={edgeColor + "20"} stroke={edgeColor} strokeWidth={1} opacity={0} className="hover:opacity-100 transition-opacity" />
                    <text x={mx} y={my - 10} textAnchor="middle" fontSize={11} fontWeight="bold" fill={edgeColor}>{peer.similarity}%</text>
                    <text x={mx} y={my + 18} textAnchor="middle" fontSize={8} fill={edgeColor} opacity={0.7}>{t("forensic.clickForComparison")}</text>
                  </g>
                )
              })}

              <motion.circle cx={cx} cy={cy} r={centerR + 6} fill="rgba(59,130,246,0.12)" initial={{ scale: 0 }} animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2.5 }} />
              <motion.circle cx={cx} cy={cy} r={centerR} fill="#EFF6FF" stroke="#3B82F6" strokeWidth={3} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#3B82F6">{studentName.split(" ")[0]}</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill="#3B82F6">{studentName.split(" ")[1]}</text>

              {criticalPeers.map((peer, i) => {
                const isHighRisk = peer.similarity > 70
                const color = isHighRisk ? "#EF4444" : "#F97316"
                return (
                  <g key={peer.name}>
                    <motion.circle cx={peerPositions[i].x} cy={peerPositions[i].y} r={24} fill={`${color}18`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} />
                    <motion.circle cx={peerPositions[i].x} cy={peerPositions[i].y} r={20} fill={isHighRisk ? "#FEF2F2" : "#FFF7ED"} stroke={color} strokeWidth={2} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.15, type: "spring", stiffness: 300, damping: 20 }} />
                    <text x={peerPositions[i].x} y={peerPositions[i].y + 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill={color}>{peer.name.split(" ")[0]}</text>
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="mt-3 flex items-center gap-5 text-xs" style={{ color: "var(--dash-muted)" }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: "#EF4444" }} />
              {t("forensic.graphLegendHigh")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: "#F97316" }} />
              {t("forensic.graphLegendMid")}
            </span>
            <span className="flex items-center gap-1.5 ml-auto">
              <GitCompare size={12} style={{ color: "var(--dash-accent)" }} />
              {t("forensic.graphClickEdge")}
            </span>
          </div>
        </motion.div>
      </div>
    </>
  )
}
