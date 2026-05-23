"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface PortalCardProps {
  Icon: LucideIcon
  label: string
  description: string
  enterLabel: string
  onClick: () => void
}

export default function PortalCard({
  Icon,
  label,
  description,
  enterLabel,
  onClick,
}: PortalCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04, y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group relative flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 text-card-foreground shadow-lg
                 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent
                 hover:border-accent hover:shadow-[0_0_32px_rgba(59,130,246,0.25)]
                 transition-colors duration-300 w-full max-w-xs"
      aria-label={label}
    >
      <span
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/10 group-hover:bg-accent/20 transition-colors duration-300">
        <Icon
          size={38}
          className="text-accent drop-shadow-[0_0_8px_rgba(59,130,246,0.7)]"
          strokeWidth={1.5}
        />
      </span>

      <span className="relative flex flex-col items-center gap-2 text-center">
        <span className="text-2xl font-bold tracking-tight text-foreground">
          {label}
        </span>
        <span className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>

      <span className="relative mt-2 text-xs font-semibold uppercase tracking-widest text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {enterLabel}
      </span>
    </motion.button>
  )
}
