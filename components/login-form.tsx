"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Lock, Mail, Loader2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/i18n/language-provider"

interface LoginFormProps {
  role: "Elev" | "Profesor"
  onBack: () => void
}

export default function LoginForm({ role, onBack }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { t } = useLanguage()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setIsLoading(false)
      setError(authError.message === "Invalid login credentials"
        ? t("loginForm.errInvalidCreds")
        : authError.message)
      return
    }

    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, class_id')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        setIsLoading(false)
        setError(t("loginForm.errProfileNotFound"))
        await supabase.auth.signOut()
        return
      }

      const expectedRole = role === "Elev" ? "elev" : "profesor"
      if (profile.role !== expectedRole) {
        setIsLoading(false)
        setError(t("loginForm.errWrongRole", { role: role.toLowerCase() }))
        await supabase.auth.signOut()
        return
      }

      router.push(profile.role === 'profesor' ? '/dashboard/profesor' : '/dashboard/elev')
      router.refresh()
    }
  }

  return (
    <motion.div
      key="login-form"
      initial={{ opacity: 0, y: 32, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="relative w-full max-w-sm"
    >
      <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_0_48px_rgba(0,0,0,0.5)] backdrop-blur-sm">
        <div className="mb-8 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            {t("loginForm.portalLabel", { role })}
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {t("loginForm.heading", { role })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loginForm.subtitle")}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="veridict-email"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t("loginForm.emailLabel")}
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="veridict-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("loginForm.emailPlaceholder")}
                className="w-full rounded-lg border border-input bg-muted py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors duration-200"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="veridict-password"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t("loginForm.passwordLabel")}
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="veridict-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-input bg-muted py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-bold text-accent-foreground
                       hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 transition-colors duration-200
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {t("loginForm.loggingIn")}
              </>
            ) : (
              t("loginForm.loginBtn")
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-muted-foreground
                     hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t("loginForm.backBtn")}
        </button>
      </div>
    </motion.div>
  )
}
