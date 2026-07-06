"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { computeFullScore, generateShingles } from "../analysisEngine"
import type { Assignment, AnalysisReport, StudentScore, StudentSubmission } from "../types/academic-types"
import { SEED_ASSIGNMENTS, SEED_SUBMISSIONS } from "../fixtures/submission-helpers"

interface AssignmentStore {
  assignments: Assignment[]
  submissions: StudentSubmission[]
  analysisReports: Record<string, AnalysisReport>
  addAssignment: (a: Omit<Assignment, "id" | "createdAt" | "submissionCount">) => void
  addSubmission: (s: Omit<StudentSubmission, "aiScore" | "analysed" | "textPreview">) => void
  runAiAnalysis: (assignmentId: string) => void
}

const AssignmentContext = createContext<AssignmentStore | null>(null)

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const [assignments, setAssignments] = useState<Assignment[]>(SEED_ASSIGNMENTS)
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(SEED_SUBMISSIONS)
  const [analysisReports, setAnalysisReports] = useState<Record<string, AnalysisReport>>({})

  const addAssignment = useCallback(
    (data: Omit<Assignment, "id" | "createdAt" | "submissionCount">) => {
      const newAssignment: Assignment = {
        ...data,
        id: `a${Date.now()}`,
        createdAt: new Date().toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }),
        submissionCount: 0,
      }
      setAssignments((prev) => [newAssignment, ...prev])
    },
    []
  )

  const addSubmission = useCallback(
    (data: Omit<StudentSubmission, "aiScore" | "analysed" | "textPreview">) => {
      const newSub: StudentSubmission = {
        ...data,
        aiScore: 0,
        analysed: false,
        textPreview: "Conținut lucrare indisponibil în modul demo.",
      }
      setSubmissions((prev) => [newSub, ...prev])
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === data.assignmentId ? { ...a, submissionCount: a.submissionCount + 1 } : a
        )
      )
    },
    []
  )

  const runAiAnalysis = useCallback(
    (assignmentId: string) => {
      const assnSubs = submissions.filter((s) => s.assignmentId === assignmentId)
      if (assnSubs.length === 0) return

      const corpus = assnSubs.map((s) => ({
        name: s.studentName,
        text: s.textPreview,
        shingles: new Set<string>(),
      }))
      for (const entry of corpus) {
        entry.shingles = generateShingles(entry.text)
      }

      const scores: AnalysisReport["scores"] = {}

      const updatedSubs = submissions.map((s) => {
        if (s.assignmentId !== assignmentId) return s
        const computed = computeFullScore(s.studentName, s.textPreview, corpus)
        scores[s.studentName] = {
          aiScore: computed.aiScore,
          similarity: computed.similarity,
          stilometric: computed.stilometric,
          lexicalDiversity: computed.lexicalDiversity,
          avgSentenceLength: computed.avgSentenceLength,
          verbDensity: computed.verbDensity,
          adjectiveDensity: computed.adjectiveDensity,
          punctuationUsage: computed.punctuationUsage,
          historicLexicalDiversity: computed.historicLexicalDiversity,
          historicAvgSentenceLength: computed.historicAvgSentenceLength,
          historicVerbDensity: computed.historicVerbDensity,
          historicAdjectiveDensity: computed.historicAdjectiveDensity,
          historicPunctuationUsage: computed.historicPunctuationUsage,
          peerMatches: computed.peerMatches,
        }
        return { ...s, aiScore: computed.aiScore, analysed: true }
      })

      setSubmissions(updatedSubs)
      setAnalysisReports((prev) => ({
        ...prev,
        [assignmentId]: {
          assignmentId,
          ranAt: new Date().toLocaleString("ro-RO", {
            day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }),
          scores,
        },
      }))
    },
    [submissions]
  )

  return (
    <AssignmentContext.Provider value={{ assignments, submissions, analysisReports, addAssignment, addSubmission, runAiAnalysis }}>
      {children}
    </AssignmentContext.Provider>
  )
}

export function useAssignments() {
  const ctx = useContext(AssignmentContext)
  if (!ctx) throw new Error("useAssignments must be used inside AssignmentProvider")
  return ctx
}
