"use client"

import { motion } from "framer-motion"

interface Segment {
  start: number
  end: number
  severity: "yellow" | "orange" | "red"
}

interface HighlightedTextProps {
  text: string
  segments: Segment[]
  activeSegIdx: number | null
  onSegHover: (idx: number | null) => void
  isPeer: boolean
}

export default function HighlightedText({
  text,
  segments,
  activeSegIdx,
  onSegHover,
  isPeer,
}: HighlightedTextProps) {
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
