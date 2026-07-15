"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Cpu, CheckCircle2, Loader2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"

export default function AiAnalysisOverlay({
  onDone,
  progress,
}: {
  onDone: () => void
  progress?: { done: number; total: number } | null
}) {
  const { t } = useLanguage()
  const AI_STEPS = [
    t("dashboardProfesor.aiStep1"),
    t("dashboardProfesor.aiStep2"),
    t("dashboardProfesor.aiStep3"),
    t("dashboardProfesor.aiStep4"),
    t("dashboardProfesor.aiStep5"),
  ]
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      i++
      if (i < AI_STEPS.length) {
        setStep(i)
      } else {
        clearInterval(interval)
        setDone(true)
        setTimeout(onDone, 1200)
      }
    }, 500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-2xl"
      style={{ background: "rgba(0,31,63,0.96)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      {!done ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10">
            <Cpu size={26} className="text-blue-400 animate-pulse" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-bold text-white">{t("dashboardProfesor.aiOverlayTitle")}</p>
            <AnimatePresence mode="wait">
              <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }} className="text-xs" style={{ color: "#93C5FD" }}>
                {AI_STEPS[step]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="flex gap-2">
            {AI_STEPS.map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full transition-all duration-500"
                style={{ background: i <= step ? "#3B82F6" : "rgba(255,255,255,0.2)" }} />
            ))}
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 text-center">
          {progress && progress.total > 0 ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10">
                {progress.done >= progress.total
                  ? <CheckCircle2 size={26} className="text-emerald-400" aria-hidden="true" />
                  : <Loader2 size={26} className="text-blue-400 animate-spin" aria-hidden="true" />}
              </div>
              <p className="text-sm font-bold text-white">{t("dashboardProfesor.aiOverlayTitle")}</p>
              <p className="text-xs" style={{ color: "#93C5FD" }}>
                {progress.done >= progress.total
                  ? t("dashboardProfesor.rerunningFinalizing")
                  : t("dashboardProfesor.rerunningProgress", { done: progress.done, total: progress.total })}
              </p>
              <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-blue-400 transition-all duration-300"
                  style={{ width: `${Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <Loader2 size={40} className="text-blue-400 animate-spin" aria-hidden="true" />
              <p className="text-sm font-bold text-white">{t("dashboardProfesor.aiOverlayTitle")}</p>
              <p className="text-xs" style={{ color: "#93C5FD" }}>{t("dashboardProfesor.aiOverlayDoneMsg")}</p>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
