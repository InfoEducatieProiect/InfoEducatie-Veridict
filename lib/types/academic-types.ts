export type SchoolClass = "10A" | "10B" | "11A" | "11B" | "12A" | "12B"

export const ALL_CLASSES: SchoolClass[] = ["10A", "10B", "11A", "11B", "12A", "12B"]

export interface Assignment {
  id: string
  title: string
  requirement: string
  details: string
  deadline: string
  createdAt: string
  submissionCount: number
  className: SchoolClass
  additional_url?: string
  additional_filename?: string
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
}

export interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistică"
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
  plagiarismWeb?: {
    verdict: string
    scor_maxim: number
    sursa_principala: string | null
    plagiarism_urls: { url: string; scor: number }[]
  } | null
  id?: string
  analysisScoreId?: string
  analysis_score_id?: string
  studentId?: string
  student_id?: string
  submissionId?: string
  submission_id?: string
  stilometricDeviation?: number
  stylometryMetrics?: {
    ttr: number
    asl: number
    verbs: number
    adjs: number
    punct: number
  } | null
  stylometryBaseline?: {
    ttr: number
    asl: number
    verbs: number
    adjs: number
    punct: number
  } | null
}

export interface StudentSubmission {
  studentName: string
  assignmentId: string
  fileName: string
  uploadedAt: string
  aiScore: number
  analysed: boolean
  textPreview: string
}
