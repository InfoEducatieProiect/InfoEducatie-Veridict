"use client"

import { useLanguage } from "@/lib/i18n/language-provider"

export default function LanguageToggle() {
  const { locale, setLocale } = useLanguage()

  return (
    <div className="flex items-center rounded-full border border-border bg-card/80 px-1 py-1 shadow-lg backdrop-blur-sm">
      <button
        onClick={() => setLocale("ro")}
        aria-pressed={locale === "ro"}
        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
          locale === "ro"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        RO
      </button>
      <span className="text-xs text-muted-foreground select-none">|</span>
      <button
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
          locale === "en"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  )
}
