"use client"

import { motion, AnimatePresence } from "framer-motion"
import { FileText, X } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"

interface TextPreviewerProps {
  studentName: string
  fileName: string
  text: string
  onClose: () => void
}

export default function TextPreviewer({ studentName, fileName, text, onClose }: TextPreviewerProps) {
  const { t } = useLanguage()
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0" style={{ background: "rgba(0,15,35,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose} aria-hidden="true" />
        <motion.aside
          className="relative flex h-full w-full max-w-xl flex-col shadow-2xl"
          style={{ background: "var(--dash-card)", borderLeft: "1px solid var(--dash-border)" }}
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          aria-label={t("dashboardProfesor.previewAria")}
        >
          <div className="flex items-center justify-between gap-4 border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--dash-border)", background: "var(--dash-navy)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <FileText size={18} className="text-blue-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{studentName}</p>
                <p className="text-xs truncate" style={{ color: "#93C5FD" }}>{fileName}</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 transition-colors" aria-label={t("dashboardProfesor.closePreview")}>
              <X size={16} className="text-blue-300" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-7">
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--dash-fg)" }}>{text}</p>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  )
}
