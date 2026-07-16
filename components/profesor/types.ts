export interface ClassInfo {
  id: string
  code: string
}

export interface Assignment {
  id: string
  professor_id: string
  title: string
  requirement: string | null
  details: string | null
  deadline: string
  class_id: string
  created_at: string
  type?: "tema" | "test"
  class_code?: string
  additional_url?: string
  additional_filename?: string
}

export interface Submission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  file_name: string | null
  text: string | null
  analysed: boolean
  ai_score: number | null
  student_name?: string
}

export interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistica" | "Eroare analiză"
  lexicalDiversity: number
  avgSentenceLength: number
  verbDensity: number
  adjectiveDensity: number
  punctuationUsage: number
  historicLexicalDiversity: number
  historicAvgSentenceLength: number
  historicVerbDensity: number
  historicAdjectiveDensity: number
  historicPunctuationUsage: number
  peerMatches: { name: string; similarity: number }[]
  id?: string
  analysisScoreId?: string
  analysis_score_id?: string
  studentId?: string
  student_id?: string
  submissionId?: string
  submission_id?: string
  stilometricDeviation?: number
  stylometryMetrics?: {
    ttr: number; asl: number; verbs: number; adjs: number; punct: number
  } | null
  stylometryBaseline?: {
    ttr: number; asl: number; verbs: number; adjs: number; punct: number
  } | null
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
  graphEdges?: { a: string; b: string; sim: number }[]
  graphNodes?: string[]
}

export type SchoolClass = string

export const ALL_CLASSES: SchoolClass[] = ["10A", "11B", "12A", "12B"]

export const RISK_BRACKET_DEFS = [
  { key: "sigur",   label: "0%–19%",   fill: "#10b981", min: 0,  max: 19  },
  { key: "suspect", label: "20%–74%",  fill: "#f59e0b", min: 20, max: 74  },
  { key: "critic",  label: "75%–100%", fill: "#ef4444", min: 75, max: 100 },
] as const

export const ROWS_PER_PAGE = 10

export function aiColor(score: number) {
  if (score === 0) return "#94A3B8"
  if (score < 20) return "#10B981"
  if (score < 75) return "#F59E0B"
  return "#EF4444"
}

export function aiLabel(score: number, t: (key: string) => string) {
  if (score === 0) return "—"
  if (score < 20) return t("dashboardProfesor.aiLevelLow")
  if (score < 75) return t("dashboardProfesor.aiLevelSuspect")
  return t("dashboardProfesor.aiLevelCritical")
}
