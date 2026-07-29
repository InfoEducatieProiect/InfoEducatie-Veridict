"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-provider"

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { t } = useLanguage()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (pathname === "/") return null

  if (!mounted) return null

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark"
  const label = isDark ? t("common.themeLight") : t("common.themeDark")

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded-full border border-border bg-card/80 p-2 text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:text-foreground"
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
