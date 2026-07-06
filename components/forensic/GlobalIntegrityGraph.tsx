"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Globe } from "lucide-react"
import { BALTAGUL_TEXTS } from "@/lib/assignment-store"
import { calculateCosineSimilarity } from "@/lib/analysisEngine"
import { useLanguage } from "@/lib/i18n/language-provider"

interface GlobalIntegrityGraphProps {
  currentStudentName: string
  allScores?: Record<string, number>
  integrityGraphEdges?: { a: string; b: string; sim: number }[]
  integrityGraphNodes?: string[]
  onOpenForensicStudent?: (name: string) => void
}

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

let _globalMatrix: Map<string, Map<string, number>> | null = null
function getGlobalMatrix() {
  if (!_globalMatrix) _globalMatrix = buildGlobalSimilarityMatrix()
  return _globalMatrix
}

export default function GlobalIntegrityGraph({
  currentStudentName,
  allScores,
  integrityGraphEdges,
  integrityGraphNodes,
  onOpenForensicStudent,
}: GlobalIntegrityGraphProps) {
  const { t } = useLanguage()
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const useLiveGraph = integrityGraphNodes != null && integrityGraphNodes.length > 0
  const names = useLiveGraph ? integrityGraphNodes : Object.keys(BALTAGUL_TEXTS)
  const matrix = useLiveGraph ? null : getGlobalMatrix()

  const SVG_W = 900
  const SVG_H = 900
  const CX = SVG_W / 2
  const CY = SVG_H / 2
  const RING_R = 360
  const NODE_R = 22

  const nodePositions = names.map((name, i) => {
    const angle = (2 * Math.PI * i) / names.length - Math.PI / 2
    return { name, x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) }
  })

  let edges: { a: string; b: string; sim: number }[] = []
  const connectedNames = new Set<string>()

  if (useLiveGraph) {
    edges = (integrityGraphEdges ?? []).filter((e) => e.sim >= 50)
    for (const edge of edges) {
      connectedNames.add(edge.a)
      connectedNames.add(edge.b)
    }
  } else if (matrix) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const sim = matrix.get(names[i])?.get(names[j]) ?? 0
        if (sim >= 50) {
          edges.push({ a: names[i], b: names[j], sim: Math.round(sim) })
          connectedNames.add(names[i])
          connectedNames.add(names[j])
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
          {edges.map((edge, i) => {
            const a = nodePositions.find((n) => n.name === edge.a)!
            const b = nodePositions.find((n) => n.name === edge.b)!
            const rawMx = (a.x + b.x) / 2
            const rawMy = (a.y + b.y) / 2
            const mx = rawMx + (CX - rawMx) * 0.15
            const my = rawMy + (CY - rawMy) * 0.15
            const isHov = hoveredNode === edge.a || hoveredNode === edge.b
            return (
              <g key={`edge-${i}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={isHov ? 3 : 1.8} strokeOpacity={isHov ? 1 : 0.5} />
                <rect x={mx - 14} y={my - 9} width={28} height={16} rx={4} fill={isHov ? "#f97316" : "#fff7ed"} stroke="#f97316" strokeWidth={1} strokeOpacity={0.6} />
                <text x={mx} y={my + 3} textAnchor="middle" fontSize={10} fontWeight="700" fill={isHov ? "#fff" : "#c2410c"}>{edge.sim}%</text>
              </g>
            )
          })}

          {nodePositions.map((node) => {
            const color = nodeColor(node.name)
            const fill  = nodeFill(node.name)
            const isHov = hoveredNode === node.name
            const isCurrent = node.name === currentStudentName
            const parts = node.name.split(" ")
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
                {(isHov || isCurrent) && (
                  <circle cx={node.x} cy={node.y} r={NODE_R + 8} fill="none" stroke={isCurrent ? "#2563eb" : color} strokeWidth={2.5} strokeOpacity={0.35} />
                )}
                <circle cx={node.x} cy={node.y} r={NODE_R} fill={isCurrent ? "#dbeafe" : fill} stroke={isCurrent ? "#2563eb" : color} strokeWidth={isCurrent ? 2.5 : 1.8} />
                <text x={node.x} y={node.y - 3} textAnchor="middle" fontSize={8.5} fontWeight="700" fill={isCurrent ? "#1d4ed8" : color}>{parts[0] ?? ""}</text>
                <text x={node.x} y={node.y + 8} textAnchor="middle" fontSize={7.5} fill={isCurrent ? "#1d4ed8" : color}>{parts[1] ?? ""}</text>
                <text x={node.x} y={node.y + NODE_R + 14} textAnchor="middle" fontSize={9} fontWeight="700" fill={color}>{aiScore}%</text>
              </g>
            )
          })}
        </svg>
      </div>

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
