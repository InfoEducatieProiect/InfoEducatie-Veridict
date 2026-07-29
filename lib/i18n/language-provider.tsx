"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import ro from "./dictionaries/ro.json"
import en from "./dictionaries/en.json"

export type Locale = "ro" | "en"

type Dict = typeof ro

const DICTS: Record<Locale, Dict> = { ro, en }

function lookup(dict: Dict, key: string): string {
  const parts = key.split(".")
  let val: unknown = dict
  for (const part of parts) {
    if (val == null || typeof val !== "object") return key
    val = (val as Record<string, unknown>)[part]
  }
  return typeof val === "string" ? val : key
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  dateLocale: string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readPersistedLocale(): Locale {
  try {
    const cookie = document.cookie
      .split(";")
      .find((c) => c.trim().startsWith("lang="))
      ?.split("=")[1]
      ?.trim()
    if (cookie === "en" || cookie === "ro") return cookie
    const ls = localStorage.getItem("lang")
    if (ls === "en" || ls === "ro") return ls
  } catch {
  }
  return "ro"
}

function persistLocale(locale: Locale) {
  try {
    document.cookie = `lang=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
    localStorage.setItem("lang", locale)
    document.documentElement.lang = locale === "ro" ? "ro" : "en"
  } catch {
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ro")

  useEffect(() => {
    const persisted = readPersistedLocale()
    setLocaleState(persisted)
    if (persisted !== "ro") document.documentElement.lang = "en"
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    persistLocale(l)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const str = lookup(DICTS[locale], key)
      if (str === key && locale !== "ro") {
        const fallback = lookup(DICTS["ro"], key)
        return interpolate(fallback, vars)
      }
      return interpolate(str, vars)
    },
    [locale],
  )

  const dateLocale = locale === "ro" ? "ro-RO" : "en-US"

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dateLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider")
  return ctx
}
