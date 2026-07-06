"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft, Network, Radar, ShieldAlert, ShieldCheck, CheckCircle2,
  AlertTriangle, Info, X, GitCompare, ExternalLink, Globe,
} from "lucide-react"
import type { StudentScore } from "@/lib/assignment-store"
import RadarStilometricTab from "@/components/RadarStilometricTab"
import {
  buildStylometryVerdict,
  type StylometryMetrics,
  type StylometryVerdict,
} from "@/lib/stylometry-types"
import { BALTAGUL_TEXTS } from "@/lib/assignment-store"
import {
  getSimilarPhrases,
  spansFromSentences,
  calculateCosineSimilarity,
  gaseste_fraze_similare_ideatic,
} from "@/lib/analysisEngine"
import { useLanguage } from "@/lib/i18n/language-provider"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForensicAnalyzerProps {
  studentName: string
  score: StudentScore
  onBack: () => void
  assignmentId: string
  submissionId: string
  /** Map of all submission texts for this assignment — used by the split-screen comparison */
  submissionTexts: Record<string, string>
  /** Map of studentName → aiScore for all students — drives the Global Integrity Graph node labels */
  allScores?: Record<string, number>
  /** Undirected similarity edges (≥50%) from Supabase peer_matches for this assignment */
  integrityGraphEdges?: { a: string; b: string; sim: number }[]
  /** Display names ordering for integrity graph nodes (class submissions) */
  integrityGraphNodes?: string[]
  /** Called when a new web plagiarism report is persisted */
  onPlagiarismReport?: (report: RaportPlagiatWeb) => void
  /** Called when stylometry scan completes (DB write via API + parent state sync) */
  onStylometryComplete?: (payload: {
    metrics: StylometryMetrics
    baseline_used: StylometryMetrics
    deviation: number
    verdict: StylometryVerdict
  }) => void
  analysisScoreId: string
  studentId: string
}

function HighlightedText({
  text,
  segments,
  activeSegIdx,
  onSegHover,
  isPeer,
}: {
  text: string
  segments: { start: number; end: number; severity: "yellow" | "orange" | "red" }[]
  activeSegIdx: number | null
  onSegHover: (idx: number | null) => void
  isPeer: boolean
}) {
  const parts: { text: string; segIdx: number | null }[] = []
  let cursor = 0

  const sortedSegs = [...segments].sort((a, b) => a.start - b.start)

  for (let si = 0; si < sortedSegs.length; si++) {
    const seg = sortedSegs[si]
    if (cursor < seg.start) {
      parts.push({ text: text.slice(cursor, seg.start), segIdx: null })
    }
    parts.push({ text: text.slice(seg.start, seg.end), segIdx: si })
    cursor = seg.end
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), segIdx: null })
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-line select-text" style={{ color: "var(--dash-fg)" }}>
      {parts.map((part, pi) => {
        if (part.segIdx === null) return <span key={pi}>{part.text}</span>
        const seg = sortedSegs[part.segIdx]
        const isActive = activeSegIdx === part.segIdx

        // Severity-based Tailwind class system per spec requirement.
        // "orange" and "red" use bg-orange-100/bg-red-100 with text colors as specified.
        // "yellow" uses bg-yellow-100 for paraphrased matches.
        const severityClassMap = {
          yellow: {
            cls: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-200",
            activeCls: "bg-yellow-200 dark:bg-yellow-900/60",
            glow: "rgba(234,179,8,0.8)",
          },
          orange: {
            cls: "bg-orange-100 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200",
            activeCls: "bg-orange-200 dark:bg-orange-900/60",
            glow: "rgba(249,115,22,0.8)",
          },
          red: {
            cls: "bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-200",
            activeCls: "bg-red-200 dark:bg-red-900/60",
            glow: "rgba(239,68,68,0.8)",
          },
        }
        const sc = severityClassMap[seg.severity]

        // Symmetrical twin-hover pulse: peer panel pulses when the other panel is hovered
        const shouldPulse = isActive && isPeer

        return (
          <motion.span
            key={pi}
            className={`rounded px-0.5 cursor-pointer font-medium ${isActive ? sc.activeCls : sc.cls}`}
            style={{
              boxShadow: shouldPulse ? `0 0 8px 2px ${sc.glow}, 0 0 16px 4px ${sc.glow}` : "none",
              border: shouldPulse ? `1.5px solid ${sc.glow}` : "none",
            }}
            animate={shouldPulse ? {
              boxShadow: [
                `0 0 4px 1px ${sc.glow}`,
                `0 0 12px 4px ${sc.glow}`,
                `0 0 4px 1px ${sc.glow}`,
              ],
            } : {}}
            transition={shouldPulse ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" } : {}}
            onMouseEnter={() => onSegHover(part.segIdx)}
            onMouseLeave={() => onSegHover(null)}
          >
            {part.text}
          </motion.span>
        )
      })}
    </p>
  )
}

function DualComparisonModal({
  studentA,
  studentB,
  textA,
  textB,
  similarity,
  onClose,
}: {
  studentA: string
  studentB: string
  textA: string
  textB: string
  similarity: number
  onClose: () => void
}) {
  const { t } = useLanguage()
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [activeSegIdx, setActiveSegIdx] = useState<number | null>(null)
  const [hoverSource, setHoverSource] = useState<"left" | "right" | null>(null)
  const isSyncing = useRef(false)

  // Step 1: Compute global cosine similarity between the two full documents.
  const globalCosine = calculateCosineSimilarity(textA, textB)

  // Three-tier severity driven by the global cosine
  const severity: "yellow" | "orange" | "red" =
    globalCosine >= 65 ? "red" : globalCosine >= 50 ? "orange" : "yellow"

  // Step 2a: PRIMARY detector — word-level k=1 Jaccard (FIXED bug: was char-shingles).
  // prag_fraza=0.22 per spec; lower to 0.15 for very high global scores to ensure coverage.
  const pragFraza = globalCosine >= 65 ? 0.20 : globalCosine >= 50 ? 0.22 : 0.15
  const suspiciousA_ideatic = gaseste_fraze_similare_ideatic(textA, textB, pragFraza)
  const suspiciousB_ideatic = gaseste_fraze_similare_ideatic(textB, textA, pragFraza)

  // Step 2b: Also run the adaptive engine and merge — union ensures maximum coverage.
  const suspiciousA_adaptive = getSimilarPhrases(textA, textB, globalCosine)
  const suspiciousB_adaptive = getSimilarPhrases(textB, textA, globalCosine)

  // Merge: deduplicate by sentence string
  const mergeUnique = (a: string[], b: string[]) => [...new Set([...a, ...b])]
  const suspiciousA = mergeUnique(suspiciousA_ideatic, suspiciousA_adaptive)
  const suspiciousB = mergeUnique(suspiciousB_ideatic, suspiciousB_adaptive)

  // Total matched phrase count (max of both sides to avoid double-counting)
  const totalMatchedPhrases = Math.max(suspiciousA.length, suspiciousB.length)

  const segsA = spansFromSentences(textA, suspiciousA, severity)
  const segsB = spansFromSentences(textB, suspiciousB, severity)

  const syncScroll = (source: "left" | "right") => {
    if (isSyncing.current) return
    isSyncing.current = true
    const src = source === "left" ? leftRef.current : rightRef.current
    const dst = source === "left" ? rightRef.current : leftRef.current
    if (src && dst) {
      const ratio = src.scrollTop / (src.scrollHeight - src.clientHeight || 1)
      dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight)
    }
    requestAnimationFrame(() => { isSyncing.current = false })
  }

  const handleLeftHover = (idx: number | null) => {
    setActiveSegIdx(idx)
    setHoverSource(idx !== null ? "left" : null)
  }

  const handleRightHover = (idx: number | null) => {
    setActiveSegIdx(idx)
    setHoverSource(idx !== null ? "right" : null)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col"
      style={{ background: "var(--dash-bg)" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-6 py-4 shadow-sm"
        style={{ background: "var(--dash-navy)", color: "#fff" }}
      >
        <div className="flex items-center gap-3">
          <GitCompare size={20} className="text-blue-300" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold">{t("forensic.dualModalTitle")}</h2>
            <p className="text-xs" style={{ color: "#93C5FD" }}>
              {t("forensic.dualSimilarity")}{" "}
              <span className="font-black" style={{ color: similarity > 65 ? "#FCA5A5" : "#FCD34D" }}>
                {similarity}%
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          aria-label={t("forensic.closeComparison")}
        >
          <X size={18} className="text-blue-300" />
        </button>
      </div>

      {/* ── SPEC: Summary Header Card ── */}
      <div
        className="shrink-0 flex items-center gap-3 border-b px-6 py-3"
        style={{ borderColor: "var(--dash-border)", background: "rgba(245,158,11,0.06)" }}
      >
        <span
          className="rounded-full px-3 py-1 text-xs font-black"
          style={{ background: "rgba(245,158,11,0.18)", color: "#B45309" }}
        >
          {t("forensic.phrasesDetected", { n: totalMatchedPhrases })}
        </span>
        <p className="text-xs font-medium" style={{ color: "var(--dash-fg)" }}>
          {t("forensic.phrasesMsg", { n: totalMatchedPhrases })}
        </p>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel A */}
        <div className="flex w-1/2 flex-col border-r" style={{ borderColor: "var(--dash-border)" }}>
          <div
            className="flex shrink-0 items-center gap-2 border-b px-5 py-3"
            style={{ borderColor: "var(--dash-border)", background: "rgba(59,130,246,0.06)" }}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: "#3B82F6" }}>A</span>
            <span className="text-sm font-bold truncate" style={{ color: "var(--dash-fg)" }}>{studentA}</span>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(59,130,246,0.1)", color: "var(--dash-accent)" }}>
              {t("forensic.workA")}
            </span>
          </div>
          <div
            ref={leftRef}
            className="flex-1 overflow-y-auto px-6 py-5"
            onScroll={() => syncScroll("left")}
          >
            <HighlightedText
              text={textA}
              segments={segsA}
              activeSegIdx={activeSegIdx}
              onSegHover={handleLeftHover}
              isPeer={hoverSource === "right"}
            />
          </div>
        </div>

        {/* Panel B */}
        <div className="flex w-1/2 flex-col">
          <div
            className="flex shrink-0 items-center gap-2 border-b px-5 py-3"
            style={{ borderColor: "var(--dash-border)", background: "rgba(239,68,68,0.05)" }}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: "#EF4444" }}>B</span>
            <span className="text-sm font-bold truncate" style={{ color: "var(--dash-fg)" }}>{studentB}</span>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
              {t("forensic.workB")}
            </span>
          </div>
          <div
            ref={rightRef}
            className="flex-1 overflow-y-auto px-6 py-5"
            onScroll={() => syncScroll("right")}
          >
            <HighlightedText
              text={textB}
              segments={segsB}
              activeSegIdx={activeSegIdx}
              onSegHover={handleRightHover}
              isPeer={hoverSource === "left"}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center gap-6 border-t px-6 py-3 text-xs" style={{ borderColor: "var(--dash-border)", color: "var(--dash-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded" style={{ background: "rgba(234,179,8,0.3)" }} />
          {t("forensic.legendParaphrase")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded" style={{ background: "rgba(249,115,22,0.3)" }} />
          {t("forensic.legendSimilar")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded" style={{ background: "rgba(239,68,68,0.3)" }} />
          {t("forensic.legendIdentical")}
        </span>
        <span className="ml-auto italic">{t("forensic.legendHover")}</span>
      </div>
    </motion.div>
  )
}

// ─── Tab 1: Local Similarity Graph ───────────────────────────────────────────

function LocalSimilarityGraph({
  studentName,
  score,
  submissionTexts,
}: {
  studentName: string
  score: StudentScore
  submissionTexts: Record<string, string>
}) {
  const { t } = useLanguage()
  const [comparison, setComparison] = useState<{ peerName: string; similarity: number } | null>(null)
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null)

  // STRICT EDGE SUPPRESSION: Only show peers with similarity >= 50%
  // Peers below 50% are mathematically clean and must NOT be rendered.
  const criticalPeers = score.peerMatches.filter((p) => p.similarity >= 50)
  const hasCriticalPeers = criticalPeers.length > 0

  // Build sorted collision list for sidebar (descending cosine similarity)
  const collisionList = [...criticalPeers].sort((a, b) => b.similarity - a.similarity)
  
  const cx = 280
  const cy = 180
  const centerR = 28

  // CONDITIONAL CLEAN STATE: If zero peers >= 50%, show elegant fallback
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

  // Arrange peer nodes around the center — only for critical peers
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
        {/* ── SPEC: COLLISION SIDEBAR — sorted descending by cosine similarity ── */}
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
                  {/* SPEC: amber badge pill "Similaritate Vocabular: X%" when row selected */}
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

          {/* Open split-screen CTA */}
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

        {/* ── Main SVG graph ── */}
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
              {/* Edges — clickable — ONLY for peers >= 50% */}
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

              {/* Center node */}
              <motion.circle cx={cx} cy={cy} r={centerR + 6} fill="rgba(59,130,246,0.12)" initial={{ scale: 0 }} animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2.5 }} />
              <motion.circle cx={cx} cy={cy} r={centerR} fill="#EFF6FF" stroke="#3B82F6" strokeWidth={3} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#3B82F6">{studentName.split(" ")[0]}</text>
              <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill="#3B82F6">{studentName.split(" ")[1]}</text>

              {/* Peer nodes */}
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

// ─── Tab 2: Stylometric Radar Chart ──────────────────────────────────────────

const RADAR_AXES = [
  { key: "lexicalDiversity", historicKey: "historicLexicalDiversity", axisKey: "axisLexical" },
  { key: "avgSentenceLength", historicKey: "historicAvgSentenceLength", axisKey: "axisSentence" },
  { key: "verbDensity", historicKey: "historicVerbDensity", axisKey: "axisVerbs" },
  { key: "adjectiveDensity", historicKey: "historicAdjectiveDensity", axisKey: "axisAdjs" },
  { key: "punctuationUsage", historicKey: "historicPunctuationUsage", axisKey: "axisPunct" },
] as const

/**
 * Exact Manhattan Normalized Deviation:
 * 1/5 × Σ( |V_c,i − V_h,i| / max(V_c,i, V_h,i) ) × 100
 */
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

type TFn = (key: string, vars?: Record<string, string | number>) => string

function getDeviationTier(pct: number, t: TFn): { label: string; color: string; bg: string; message: string } {
  if (pct <= 40) {
    return {
      label: t("forensic.devOkLabel"),
      color: "#10B981",
      bg: "rgba(16,185,129,0.12)",
      message: t("forensic.devOkMsg"),
    }
  }
  if (pct <= 70) {
    return {
      label: t("forensic.devSuspectLabel"),
      color: "#F97316",
      bg: "rgba(249,115,22,0.12)",
      message: t("forensic.devSuspectMsg"),
    }
  }
  return {
    label: t("forensic.devCriticalLabel"),
    color: "#EF4444",
    bg: "rgba(239,68,68,0.12)",
    message: t("forensic.devCriticalMsg"),
  }
}

function StylometricRadar({ score }: { score: StudentScore }) {
  const { t } = useLanguage()
  const svgW = 520
  const svgH = 520
  const cx = svgW / 2
  const cy = svgH / 2
  const maxR = 130
  const levels = 5

  const deviation = computeDeviation(score)
  const tier = getDeviationTier(deviation, t)

  // Helper to get point on the radar
  const getPoint = (axisIndex: number, value: number) => {
    const angle = (2 * Math.PI * axisIndex) / RADAR_AXES.length - Math.PI / 2
    const r = (value / 100) * maxR
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  // Build polygon paths
  const currentPoints = RADAR_AXES.map((axis, i) => {
    const val = score[axis.key as keyof StudentScore] as number
    return getPoint(i, val)
  })
  const historicPoints = RADAR_AXES.map((axis, i) => {
    const val = score[axis.historicKey as keyof StudentScore] as number
    return getPoint(i, val)
  })

  const currentPath = currentPoints.map((p) => `${p.x},${p.y}`).join(" ")
  const historicPath = historicPoints.map((p) => `${p.x},${p.y}`).join(" ")

  // Precise text anchoring per axis position with multi-line support
  const getLabelProps = (i: number) => {
    const angle = (2 * Math.PI * i) / RADAR_AXES.length - Math.PI / 2
    const labelR = maxR + 44
    const x = cx + labelR * Math.cos(angle)
    const y = cy + labelR * Math.sin(angle)

    const angleDeg = (angle * 180) / Math.PI
    let textAnchor: "middle" | "start" | "end" = "middle"
    let dx = 0
    let dy = 0

    if (angleDeg >= -100 && angleDeg <= -80) {
      textAnchor = "middle"
      dy = -10
    } else if (angleDeg > -80 && angleDeg < 10) {
      textAnchor = "start"
      dx = 10
    } else if (angleDeg >= 10 && angleDeg <= 100) {
      textAnchor = "start"
      dx = 10
      dy = 4
    } else if (angleDeg > 100 && angleDeg <= 170) {
      textAnchor = "end"
      dx = -10
      dy = 4
    } else {
      textAnchor = "end"
      dx = -10
    }

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

      {/* Deviatie Stilometrica Badge */}
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider" style={{ color: tier.color }}>
              {t("forensic.devBadge")} {tier.label}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--dash-muted)" }}>
            {tier.message}
          </p>
        </div>
      </motion.div>

      <div className="flex justify-center">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} aria-label="Radar chart stilometric">
          {/* Background rings */}
          {Array.from({ length: levels }, (_, i) => {
            const r = ((i + 1) / levels) * maxR
            const points = RADAR_AXES.map((_, j) => {
              const angle = (2 * Math.PI * j) / RADAR_AXES.length - Math.PI / 2
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
            }).join(" ")
            return (
              <polygon
                key={i}
                points={points}
                fill="none"
                stroke="var(--dash-border)"
                strokeWidth={1}
                opacity={0.6}
              />
            )
          })}

          {/* Axis lines */}
          {RADAR_AXES.map((_, i) => {
            const angle = (2 * Math.PI * i) / RADAR_AXES.length - Math.PI / 2
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={cx + maxR * Math.cos(angle)}
                y2={cy + maxR * Math.sin(angle)}
                stroke="var(--dash-border)"
                strokeWidth={1}
                opacity={0.4}
              />
            )
          })}

          {/* Historic profile polygon (Navy Blue) */}
          <motion.polygon
            points={historicPath}
            fill="rgba(0,31,63,0.15)"
            stroke="#001F3F"
            strokeWidth={2}
            strokeDasharray="6 3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />

          {/* Current paper polygon (Orange) */}
          <motion.polygon
            points={currentPath}
            fill="rgba(249,115,22,0.18)"
            stroke="#F97316"
            strokeWidth={2.5}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          />

          {/* Current data points */}
          {currentPoints.map((p, i) => (
            <motion.circle
              key={`current-${i}`}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="#F97316"
              stroke="#fff"
              strokeWidth={1.5}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6 + i * 0.1 }}
            />
          ))}

          {/* Historic data points */}
          {historicPoints.map((p, i) => (
            <motion.circle
              key={`historic-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#001F3F"
              stroke="#fff"
              strokeWidth={1}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            />
          ))}

          {/* Axis labels — multi-line via <tspan> elements */}
          {RADAR_AXES.map((axis, i) => {
            const props = getLabelProps(i)
            const lineHeight = 13
            const startDy = -(lineHeight / 2)
            const axisLabel = t(`radarTab.${axis.axisKey}`)
            const spaceIdx = axisLabel.indexOf(" ")
            const line1 = spaceIdx === -1 ? axisLabel : axisLabel.slice(0, spaceIdx)
            const line2 = spaceIdx === -1 ? "" : axisLabel.slice(spaceIdx + 1)
            return (
              <text
                key={axis.key}
                x={props.x}
                y={props.y}
                textAnchor={props.textAnchor}
                fontSize={10}
                fontWeight="600"
                fill="var(--dash-muted)"
              >
                <tspan x={props.x} dy={startDy}>{line1}</tspan>
                <tspan x={props.x} dy={lineHeight}>{line2}</tspan>
              </text>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
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

      {/* SECTION 4: Automated Stylometric Analytics Grid — 5 dimensions */}
      <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--dash-border)" }}>
        <h5 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--dash-muted)" }}>
          {t("forensic.stylometricDetails")}
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
              {t("radarTab.axisLexical")}
            </p>
            <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>
              {score.lexicalDiversity.toFixed(1)}%
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
              {t("forensic.historicAvg")} {score.historicLexicalDiversity.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
              {t("radarTab.axisSentence")}
            </p>
            <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>
              {score.avgSentenceLength.toFixed(1)}{t("radarTab.wordsAbbr")}
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
              {t("forensic.historicAvg")} {score.historicAvgSentenceLength.toFixed(1)}{t("radarTab.wordsAbbr")}
            </p>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
              {t("radarTab.axisVerbs")}
            </p>
            <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>
              {score.verbDensity.toFixed(1)}%
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
              {t("forensic.historicAvg")} {score.historicVerbDensity.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
              {t("radarTab.axisPunct")}
            </p>
            <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>
              {score.punctuationUsage.toFixed(1)}%
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
              {t("forensic.historicAvg")} {score.historicPunctuationUsage.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--dash-accent)" }}>
              {t("radarTab.axisAdjs")}
            </p>
            <p className="text-lg font-black" style={{ color: "var(--dash-fg)" }}>
              {score.adjectiveDensity.toFixed(1)}%
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--dash-muted)" }}>
              {t("forensic.historicAvg")} {score.historicAdjectiveDensity.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Tab 3: AI Classification & Risk Thresholds ──────────────────────────────

function AiClassification({ score }: { score: StudentScore }) {
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
        range: "75% - 100%",
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
        range: "20% - 74%",
      }
    }
    return {
      level: t("forensic.aiClassSafeTitle"),
      color: "#10B981",
      bgColor: "rgba(16,185,129,0.08)",
      borderColor: "rgba(16,185,129,0.25)",
      icon: <CheckCircle2 size={28} className="text-emerald-500" />,
      description: t("forensic.aiClassSafeDesc"),
      range: "Sub 20%",
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
      {/* Score display */}
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

      {/* All zones reference */}
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

// ─── Web Plagiarism Scanner Types ─────────────────────────────────────────────

export interface SursaWeb {
  url: string
  scor: number // Cosine similarity, 0.0–1.0
}

export interface RaportPlagiatWeb {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  top_surse: SursaWeb[]
}

function hitScorPct(item: { scor?: number; score?: number }): number {
  const raw = item.scor ?? item.score ?? 0
  return raw > 1 ? Math.round(raw) : Math.round(raw * 100)
}

function hitScorUnit(item: { scor?: number; score?: number }): number {
  const raw = item.scor ?? item.score ?? 0
  return raw > 1 ? raw / 100 : raw
}

function translateVerdict(verdict: string, scorMaximPct: number, t: TFn): string {
  if (verdict.startsWith("✅")) return t("forensic.webVerdictAuthentic")
  if (verdict.startsWith("❌")) return t("forensic.webVerdictDetected", { pct: scorMaximPct })
  if (verdict.startsWith("❓")) return t("forensic.webVerdictSuspect", { pct: scorMaximPct })
  return verdict
}

function apiReportToUi(raw: {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  plagiarism_urls?: { url: string; scor?: number; score?: number }[]
  top_surse?: { url: string; scor?: number; score?: number }[]
}): RaportPlagiatWeb {
  const hits = raw.plagiarism_urls?.length
    ? raw.plagiarism_urls
    : raw.top_surse ?? []
  return {
    verdict: raw.verdict,
    scor_maxim: raw.scor_maxim,
    sursa_principala: raw.sursa_principala,
    top_surse: hits.map((u) => ({
      url: u.url,
      scor: hitScorUnit(u),
    })),
  }
}

function cachedScoreToUi(score: StudentScore): RaportPlagiatWeb | null {
  const pw = score.plagiarismWeb
  if (!pw) return null
  return apiReportToUi(pw)
}

// ─── Tab 4: Web Scanner (Scanare Web Globală) ─────────────────────────────────

function badgeColorForScor(scor: number): { bg: string; text: string } {
  if (scor >= 0.6) return { bg: "rgba(239,68,68,0.12)", text: "#B91C1C" }
  if (scor >= 0.4) return { bg: "rgba(245,158,11,0.12)", text: "#92400E" }
  return { bg: "rgba(16,185,129,0.10)", text: "#065F46" }
}

function WebScannerPanel({
  studentName,
  assignmentId,
  submissionId,
  initialReport,
  onReport,
}: {
  studentName: string
  assignmentId: string
  submissionId: string
  initialReport: RaportPlagiatWeb | null
  onReport?: (report: RaportPlagiatWeb) => void
}) {
  const { t } = useLanguage()
  const [rezultatPlagiatWeb, setRezultatPlagiatWeb] = useState<RaportPlagiatWeb | null>(
    initialReport,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    [assignmentId, submissionId, onReport],
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
        <button
          type="button"
          disabled={loading}
          onClick={() => void runScan(true)}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
          style={{ borderColor: "var(--dash-border)", color: "var(--dash-navy)" }}
        >
          {loading ? t("forensic.webScanning") : t("forensic.webRescan")}
        </button>
      </div>

      {scanIncomplete && (
        <div
          className="rounded-xl border px-4 py-3 text-xs"
          style={{
            background: "rgba(245,158,11,0.08)",
            borderColor: "rgba(245,158,11,0.35)",
            color: "#92400E",
          }}
        >
          {t("forensic.webScanIncomplete")}
        </div>
      )}

      {/* STATE A — No detections */}
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

      {/* STATE B — Detections found */}
      {hasDetections && (
        <motion.div
          key="detectat"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-5"
        >
          {/* Alert banner */}
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

          {/* Source list */}
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
                      {pct}% Match
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Permanent disclaimer — amber, exact text per spec */}
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

// ─── Section 1: Global Integrity Graph (Circular, 30 nodes) ──────────────────

/**
 * Compute a pairwise Jaccard word-overlap similarity matrix for all 30 students.
 * This is computed lazily once on first render.
 */
function buildGlobalSimilarityMatrix(): Map<string, Map<string, number>> {
  const names = Object.keys(BALTAGUL_TEXTS)
  const matrix = new Map<string, Map<string, number>>()
  for (const a of names) {
    matrix.set(a, new Map())
    for (const b of names) {
      if (a === b) { matrix.get(a)!.set(b, 100); continue }
      matrix.get(a)!.set(b, calculateCosineSimilarity(BALTAGUL_TEXTS[a], BALTAGUL_TEXTS[b]))
    }
  }
  return matrix
}

// Compute once at module level (safe — pure function, no side effects)
let _globalMatrix: Map<string, Map<string, number>> | null = null
function getGlobalMatrix() {
  if (!_globalMatrix) _globalMatrix = buildGlobalSimilarityMatrix()
  return _globalMatrix
}

function GlobalIntegrityGraph({
  onOpenForensicStudent,
  currentStudentName,
  allScores,
  integrityGraphEdges,
  integrityGraphNodes,
}: {
  onOpenForensicStudent?: (name: string) => void
  currentStudentName: string
  allScores?: Record<string, number>
  integrityGraphEdges?: { a: string; b: string; sim: number }[]
  integrityGraphNodes?: string[]
}) {
  const { t } = useLanguage()
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const useLiveGraph =
    integrityGraphNodes != null && integrityGraphNodes.length > 0

  const names = useLiveGraph ? integrityGraphNodes : Object.keys(BALTAGUL_TEXTS)
  const matrix = useLiveGraph ? null : getGlobalMatrix()

  // Layout constants — scaled up per spec (Section 1)
  const SVG_W = 900
  const SVG_H = 900
  const CX = SVG_W / 2
  const CY = SVG_H / 2
  const RING_R = 360
  const NODE_R = 22

  // Arrange all nodes in a circle
  const nodePositions = names.map((name, i) => {
    const angle = (2 * Math.PI * i) / names.length - Math.PI / 2
    return {
      name,
      x: CX + RING_R * Math.cos(angle),
      y: CY + RING_R * Math.sin(angle),
    }
  })

  // Build edges: only where similarity >= 50%
  let edges: { a: string; b: string; sim: number }[] = []
  const connectedNames = new Set<string>()

  if (useLiveGraph) {
    edges = (integrityGraphEdges ?? []).filter((e) => e.sim >= 50)
    for (const edge of edges) {
      connectedNames.add(edge.a)
      connectedNames.add(edge.b)
    }
  } else if (matrix) {
    const namesB = names
    for (let i = 0; i < namesB.length; i++) {
      for (let j = i + 1; j < namesB.length; j++) {
        const sim = matrix.get(namesB[i])?.get(namesB[j]) ?? 0
        if (sim >= 50) {
          edges.push({ a: namesB[i], b: namesB[j], sim: Math.round(sim) })
          connectedNames.add(namesB[i])
          connectedNames.add(namesB[j])
        }
      }
    }
  }

  const nodeColor = (name: string) => connectedNames.has(name) ? "#f97316" : "#3b82f6"
  const nodeFill  = (name: string) => connectedNames.has(name) ? "#fff7ed" : "#eff6ff"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-7xl mx-auto rounded-2xl border p-8 min-h-[750px] lg:min-h-[850px]"
      style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Globe size={16} style={{ color: "var(--dash-accent)" }} aria-hidden="true" />
        <h3 className="text-sm font-bold" style={{ color: "var(--dash-fg)" }}>
          {t("forensic.globalGraphTitle")}
        </h3>
      </div>

      <div className="overflow-x-auto flex justify-center">
        <svg
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="max-w-full"
          aria-label={t("forensic.globalGraphAria")}
          style={{ minWidth: 400 }}
        >
          {/* Edges — percentage badges always visible; offset toward centre to avoid node overlap */}
          {edges.map((edge, i) => {
            const a = nodePositions.find((n) => n.name === edge.a)!
            const b = nodePositions.find((n) => n.name === edge.b)!
            // Midpoint, then pull 15% toward SVG centre so badge doesn't land on a node
            const rawMx = (a.x + b.x) / 2
            const rawMy = (a.y + b.y) / 2
            const mx = rawMx + (CX - rawMx) * 0.15
            const my = rawMy + (CY - rawMy) * 0.15
            const isHov = hoveredNode === edge.a || hoveredNode === edge.b
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#f97316"
                  strokeWidth={isHov ? 3 : 1.8}
                  strokeOpacity={isHov ? 1 : 0.5}
                />
                {/* Always-visible percentage badge */}
                <rect
                  x={mx - 14} y={my - 9}
                  width={28} height={16}
                  rx={4}
                  fill={isHov ? "#f97316" : "#fff7ed"}
                  stroke="#f97316"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
                <text
                  x={mx} y={my + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="700"
                  fill={isHov ? "#fff" : "#c2410c"}
                >
                  {edge.sim}%
                </text>
              </g>
            )
          })}

          {/* Nodes */}
          {nodePositions.map((node) => {
            const color   = nodeColor(node.name)
            const fill    = nodeFill(node.name)
            const isHov   = hoveredNode === node.name
            const isCurrent = node.name === currentStudentName
            const parts = node.name.split(" ")
            const firstName = parts[0] ?? ""
            const lastName  = parts[1] ?? ""
            // Use real AI score if available, otherwise use deterministic pseudo-score
            const aiScore = allScores?.[node.name] !== undefined
              ? allScores[node.name]
              : Math.abs(node.name.charCodeAt(0) * 7 + (node.name.charCodeAt(1) ?? 3) * 3) % 100

            return (
              <g
                key={node.name}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(node.name)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onOpenForensicStudent?.(node.name)}
                role="button"
                aria-label={`${t("forensic.nodeAria", { name: node.name })}${connectedNames.has(node.name) ? ` — ${t("forensic.nodeSuspect")}` : ` — ${t("forensic.nodeClean")}`}`}
              >
                {/* Glow ring for hovered or current node */}
                {(isHov || isCurrent) && (
                  <circle
                    cx={node.x} cy={node.y}
                    r={NODE_R + 8}
                    fill="none"
                    stroke={isCurrent ? "#2563eb" : color}
                    strokeWidth={2.5}
                    strokeOpacity={0.35}
                  />
                )}
                <circle
                  cx={node.x} cy={node.y}
                  r={NODE_R}
                  fill={isCurrent ? "#dbeafe" : fill}
                  stroke={isCurrent ? "#2563eb" : color}
                  strokeWidth={isCurrent ? 2.5 : 1.8}
                />
                {/* First name */}
                <text
                  x={node.x} y={node.y - 3}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight="700"
                  fill={isCurrent ? "#1d4ed8" : color}
                >
                  {firstName}
                </text>
                {/* Last name */}
                <text
                  x={node.x} y={node.y + 8}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill={isCurrent ? "#1d4ed8" : color}
                >
                  {lastName}
                </text>
                {/* AI score rendered directly below each node */}
                <text
                  x={node.x} y={node.y + NODE_R + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="700"
                  fill={color}
                >
                  {aiScore}%
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-5 text-xs" style={{ color: "var(--dash-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2" style={{ background: "#fff7ed", borderColor: "#f97316" }} />
          {t("forensic.globalLegendSuspect")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded" style={{ background: "#f97316" }} />
          {t("forensic.globalLegendEdge")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2" style={{ background: "#eff6ff", borderColor: "#3b82f6" }} />
          {t("forensic.globalLegendClean")}
        </span>
        <span className="ml-auto text-[10px] italic">
          {t("forensic.globalStats", { edges: edges.length, clean: names.length - connectedNames.size })}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TAB_SCHEMA = [
  { id: "graph" as const, Icon: Network },
  { id: "radar" as const, Icon: Radar },
  { id: "classification" as const, Icon: ShieldAlert },
  { id: "webscanner" as const, Icon: AlertTriangle },
  { id: "globalinteg" as const, Icon: Globe },
] as const

type TabId = (typeof TAB_SCHEMA)[number]["id"]

export default function ForensicAnalyzer({
  studentName,
  score,
  onBack,
  assignmentId,
  submissionId,
  submissionTexts,
  analysisScoreId,
  studentId,
  allScores,
  integrityGraphEdges,
  integrityGraphNodes,
  onPlagiarismReport,
  onStylometryComplete,
}: ForensicAnalyzerProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<TabId>("graph")

  const TAB_LABELS: Record<TabId, string> = {
    graph: t("forensic.tabGraph"),
    radar: t("forensic.tabRadar"),
    classification: t("forensic.tabClassification"),
    webscanner: t("forensic.tabWebScanner"),
    globalinteg: t("forensic.tabGlobalGraph"),
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      {/* ── Back nav ── high-visibility structural container, z-50 so it is NEVER
           clipped or pointer-blocked by any absolute/overflow parent layer.        */}
      <div className="relative z-50 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl border p-3 md:px-4 md:py-2.5 text-sm md:text-base font-medium cursor-pointer active:scale-95 transition-all select-none"
          style={{
            background: "var(--dash-card)",
            borderColor: "var(--dash-border)",
            color: "var(--dash-fg)",
          }}
          aria-label={t("forensic.backToTable")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{t("forensic.backToTable")}</span>
        </button>
        <span className="text-xs select-none" style={{ color: "var(--dash-border)" }}>/</span>
        <span className="text-xs font-semibold truncate max-w-[200px]" style={{ color: "var(--dash-accent)" }}>
          {studentName}
        </span>
      </div>

      {/* Header */}
      <div
        className="flex items-center justify-between rounded-2xl border p-5"
        style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
      >
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--dash-fg)" }}>
            {t("forensic.headerTitle", { name: studentName })}
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--dash-muted)" }}>
            {t("forensic.headerSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: score.aiScore >= 75 ? "rgba(239,68,68,0.1)" : score.aiScore >= 40 ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
              color: score.aiScore >= 75 ? "#EF4444" : score.aiScore >= 40 ? "#F59E0B" : "#10B981",
            }}
          >
            {t("forensic.aiScoreLabel", { score: score.aiScore })}
          </span>
        </div>
      </div>

      {/* Tab navigation — full-width fill layout per spec */}
      <div
        className="rounded-xl border p-1"
        style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)" }}
        role="tablist"
      >
        <div className="flex flex-row justify-around w-full items-stretch gap-1">
          {TAB_SCHEMA.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-1 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              style={{
                background: activeTab === tab.id ? "var(--dash-navy)" : "transparent",
                color: activeTab === tab.id ? "#fff" : "var(--dash-muted)",
              }}
            >
              <tab.Icon size={14} aria-hidden="true" />
              {TAB_LABELS[tab.id]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "graph" && (
          <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LocalSimilarityGraph studentName={studentName} score={score} submissionTexts={submissionTexts} />
          </motion.div>
        )}
        {activeTab === "radar" && (
          <motion.div key="radar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RadarStilometricTab
              studentName={studentName}
              assignmentId={assignmentId}
              submissionId={submissionId}
              analysisScoreId={analysisScoreId}
              studentId={studentId}
              text={submissionTexts[studentName] ?? ""}
              initialMetrics={score.stylometryMetrics ?? null}
              initialBaseline={score.stylometryBaseline ?? null}
              initialDeviation={score.stilometricDeviation ?? null}
              initialVerdict={
                score.stilometricDeviation != null
                  ? buildStylometryVerdict(score.stilometricDeviation)
                  : null
              }
              autoRunOnMount
              onAnalysisComplete={onStylometryComplete}
            />
          </motion.div>
        )}
        {activeTab === "classification" && (
          <motion.div key="classification" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AiClassification score={score} />
          </motion.div>
        )}
        {activeTab === "webscanner" && (
          <motion.div key="webscanner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WebScannerPanel
              studentName={studentName}
              assignmentId={assignmentId}
              submissionId={submissionId}
              initialReport={cachedScoreToUi(score)}
              onReport={onPlagiarismReport}
            />
          </motion.div>
        )}
        {activeTab === "globalinteg" && (
          <motion.div key="globalinteg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GlobalIntegrityGraph
              currentStudentName={studentName}
              allScores={allScores}
              integrityGraphEdges={integrityGraphEdges}
              integrityGraphNodes={integrityGraphNodes}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
