"use client"

import { useState, useRef } from "react"
import { motion } from "framer-motion"
import { GitCompare, X } from "lucide-react"
import {
  calculateCosineSimilarity,
  getSimilarPhrases,
  spansFromSentences,
  gaseste_fraze_similare_ideatic,
} from "@/lib/analysisEngine"
import { useLanguage } from "@/lib/i18n/language-provider"
import HighlightedText from "./HighlightedText"

interface DualComparisonModalProps {
  studentA: string
  studentB: string
  textA: string
  textB: string
  similarity: number
  onClose: () => void
}

export default function DualComparisonModal({
  studentA,
  studentB,
  textA,
  textB,
  similarity,
  onClose,
}: DualComparisonModalProps) {
  const { t } = useLanguage()
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [activeSegIdx, setActiveSegIdx] = useState<number | null>(null)
  const [hoverSource, setHoverSource] = useState<"left" | "right" | null>(null)
  const isSyncing = useRef(false)

  const globalCosine = calculateCosineSimilarity(textA, textB)
  const severity: "yellow" | "orange" | "red" =
    globalCosine >= 65 ? "red" : globalCosine >= 50 ? "orange" : "yellow"

  const pragFraza = globalCosine >= 65 ? 0.20 : globalCosine >= 50 ? 0.22 : 0.15
  const suspiciousA_ideatic = gaseste_fraze_similare_ideatic(textA, textB, pragFraza)
  const suspiciousB_ideatic = gaseste_fraze_similare_ideatic(textB, textA, pragFraza)

  const suspiciousA_adaptive = getSimilarPhrases(textA, textB, globalCosine)
  const suspiciousB_adaptive = getSimilarPhrases(textB, textA, globalCosine)

  const mergeUnique = (a: string[], b: string[]) => [...new Set([...a, ...b])]
  const suspiciousA = mergeUnique(suspiciousA_ideatic, suspiciousA_adaptive)
  const suspiciousB = mergeUnique(suspiciousB_ideatic, suspiciousB_adaptive)

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

      <div className="flex flex-1 overflow-hidden">
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
