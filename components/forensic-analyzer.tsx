"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Network, Radar, ShieldAlert, AlertTriangle, Globe, ArrowLeft } from "lucide-react"
import type { StudentScore } from "@/lib/assignment-store"
import RadarStilometricTab from "@/components/RadarStilometricTab"
import { buildStylometryVerdict, type StylometryMetrics, type StylometryVerdict } from "@/lib/stylometry-types"
import { useLanguage } from "@/lib/i18n/language-provider"
import LocalSimilarityGraph from "./forensic/LocalSimilarityGraph"
import StylometricRadar from "./forensic/StylometricRadar"
import AiClassification from "./forensic/AiClassification"
import WebScannerPanel from "./forensic/WebScannerPanel"
import GlobalIntegrityGraph from "./forensic/GlobalIntegrityGraph"
import { cachedScoreToUi } from "@/lib/plagiarism-formatters"

// Re-export types consumed by dashboard-profesor.tsx
export type { SursaWeb, RaportPlagiatWeb } from "@/lib/plagiarism-formatters"

interface ForensicAnalyzerProps {
  studentName: string
  score: StudentScore
  onBack: () => void
  /** Overrides the default "back to table" wording when opened from elsewhere. */
  backLabel?: string
  assignmentId: string
  submissionId: string
  submissionTexts: Record<string, string>
  allScores?: Record<string, number>
  integrityGraphEdges?: { a: string; b: string; sim: number }[]
  integrityGraphNodes?: string[]
  onPlagiarismReport?: (report: import("@/lib/plagiarism-formatters").RaportPlagiatWeb) => void
  onStylometryComplete?: (payload: {
    metrics: StylometryMetrics
    baseline_used: StylometryMetrics
    deviation: number
    verdict: StylometryVerdict
  }) => void
  analysisScoreId: string
  studentId: string
  /** Tab to open on mount (from the ?tab URL param); falls back to "graph". */
  initialTab?: string
  /** Fired when the user switches tabs, so the URL can be kept in sync. */
  onTabChange?: (tab: TabId) => void
}

const TAB_SCHEMA = [
  { id: "graph"          as const, Icon: Network     },
  { id: "radar"          as const, Icon: Radar        },
  { id: "classification" as const, Icon: ShieldAlert  },
  { id: "webscanner"     as const, Icon: AlertTriangle },
  { id: "globalinteg"    as const, Icon: Globe        },
] as const

type TabId = (typeof TAB_SCHEMA)[number]["id"]

export default function ForensicAnalyzer({
  studentName,
  score,
  onBack,
  backLabel,
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
  initialTab,
  onTabChange,
}: ForensicAnalyzerProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    TAB_SCHEMA.some((x) => x.id === initialTab) ? (initialTab as TabId) : "graph",
  )

  const TAB_LABELS: Record<TabId, string> = {
    graph:          t("forensic.tabGraph"),
    radar:          t("forensic.tabRadar"),
    classification: t("forensic.tabClassification"),
    webscanner:     t("forensic.tabWebScanner"),
    globalinteg:    t("forensic.tabGlobalGraph"),
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <div className="relative z-50 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl border p-3 md:px-4 md:py-2.5 text-sm md:text-base font-medium cursor-pointer active:scale-95 transition-all select-none"
          style={{ background: "var(--dash-card)", borderColor: "var(--dash-border)", color: "var(--dash-fg)" }}
          aria-label={backLabel ?? t("forensic.backToTable")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{backLabel ?? t("forensic.backToTable")}</span>
        </button>
        <span className="text-xs select-none" style={{ color: "var(--dash-border)" }}>/</span>
        <span className="text-xs font-semibold truncate max-w-[200px]" style={{ color: "var(--dash-accent)" }}>
          {studentName}
        </span>
      </div>

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
              onClick={() => { setActiveTab(tab.id); onTabChange?.(tab.id) }}
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
              text={submissionTexts[studentName] ?? ""}
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
