"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { GraduationCap, ShieldCheck } from "lucide-react"
import NodeGraphBackground from "@/components/node-graph-background"
import PortalCard from "@/components/portal-card"
import LoginForm from "@/components/login-form"
import { useLanguage } from "@/lib/i18n/language-provider"

type Role = "Elev" | "Profesor" | null

export default function HeroSection() {
  const [selectedRole, setSelectedRole] = useState<Role>(null)
  const { t } = useLanguage()

  const handleSelectRole = (role: "Elev" | "Profesor") => {
    setSelectedRole(role)
  }

  const handleBack = () => {
    setSelectedRole(null)
  }

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      <NodeGraphBackground />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, rgba(0,10,25,0.7) 100%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full flex-col items-center gap-12">

        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 shadow-[0_0_24px_rgba(59,130,246,0.3)]">
            <ShieldCheck size={28} className="text-accent" strokeWidth={1.8} aria-hidden="true" />
          </div>

          <h1 className="font-sans text-6xl font-black tracking-tighter text-balance text-foreground sm:text-7xl md:text-8xl">
            Veridict
          </h1>

          <p className="max-w-md text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
            {t("hero.tagline").includes(",") ? (
              <>
                {t("hero.tagline").split(/,\s*/)[0]},{" "}
                <span className="text-accent font-semibold">
                  {t("hero.tagline").split(/,\s*/)[1]}
                </span>
              </>
            ) : (
              t("hero.tagline")
            )}
          </p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-2 flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            {t("hero.securityBadge")}
          </motion.div>
        </motion.header>

        <AnimatePresence mode="wait">
          {selectedRole === null ? (
            <motion.div
              key="portal-selection"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.97 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8"
            >
              <PortalCard
                Icon={GraduationCap}
                label={t("portalCard.elevLabel")}
                description={t("portalCard.elevDesc")}
                enterLabel={t("portalCard.enter")}
                onClick={() => handleSelectRole("Elev")}
              />
              <PortalCard
                Icon={ShieldCheck}
                label={t("portalCard.profesorLabel")}
                description={t("portalCard.profesorDesc")}
                enterLabel={t("portalCard.enter")}
                onClick={() => handleSelectRole("Profesor")}
              />
            </motion.div>
          ) : (
            <LoginForm role={selectedRole} onBack={handleBack} />
          )}
        </AnimatePresence>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-center text-xs text-muted-foreground/60"
        >
          {t("hero.footer", { year: new Date().getFullYear() })}
        </motion.footer>
      </div>
    </section>
  )
}
