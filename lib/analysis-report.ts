
import type { HistoricBaseline } from "./assignment-store"
import type { PlagiarismWebReport } from "./plagiarism-web"
import { fetchScanSourcesMapBySubmissionIds, plagiarismReportFromScanSources } from "./plagiarism-scan-sources"
import {
  parseStylometryMetricsFromDb,
  type StylometryDbMetrics,
} from "./stylometry-db-metrics"

export type { StylometryDbMetrics } from "./stylometry-db-metrics"
import {
  calculateManhattanDeviation,
  computeStylometricVector,
  resolveHistoricProfile,
} from "./analysisEngine"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient as createBrowserClient } from "@/lib/supabase/client"
import {
  getLatestAnalysisRun,
  getAnalysisScoresWithPeers,
  getStudentBaselines,
  sortByCreatedAtDesc,
  type StudentBaseline,
  type AnalysisScore,
} from "@/lib/supabase/queries"

export interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistica"
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
  plagiarismWeb?: PlagiarismWebReport | null
  id?: string
  analysisScoreId?: string
  analysis_score_id?: string
  studentId?: string
  student_id?: string
  submissionId?: string
  submission_id?: string
  stilometricDeviation?: number
  stylometryMetrics?: StylometryDbMetrics | null
  stylometryBaseline?: StylometryDbMetrics | null
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
  graphEdges?: { a: string; b: string; sim: number }[]
  graphNodes?: string[]
}

export interface SubmissionInput {
  id: string
  studentId: string
  studentName: string
  text: string
}

function baselineFromRow(row: StudentBaseline | undefined): HistoricBaseline | null {
  if (!row || row.ttr == null || row.asl == null || row.verbs == null || row.adjs == null || row.punct == null) {
    return null
  }
  return {
    ttr: row.ttr,
    asl: row.asl,
    verbs: row.verbs,
    adjs: row.adjs,
    punct: row.punct,
  }
}

function stylometricLabel(deviation: number): StudentScore["stilometric"] {
  return deviation >= 38 ? "Abatere Stilistica" : "Stil Consistent"
}

function rawMetricsFromScoreRow(row: AnalysisScore): StylometryDbMetrics | null {
  return parseStylometryMetricsFromDb(row)
}

function rawBaselineFromRow(row: StudentBaseline | undefined): StylometryDbMetrics | null {
  if (!row) return null
  return parseStylometryMetricsFromDb(row)
}

type ScoreWithPeers = AnalysisScore & {
  peer_matches?: {
    similarity: number
    peer_student_id: string
    fraze_elev1?: unknown
    fraze_elev2?: unknown
    profiles?: { display_name?: string } | null
  }[]
}

function rebuildGraphFromRows(
  rows: ScoreWithPeers[],
): {
  graphEdges: { a: string; b: string; sim: number }[]
  graphNodes: string[]
} {
  const graphNodes: string[] = []
  const nseen = new Set<string>()
  for (const row of rows) {
    const name = row.student_name ?? ""
    if (name && !nseen.has(name)) {
      nseen.add(name)
      graphNodes.push(name)
    }
  }

  type EdgeAgg = { a: string; b: string; sim: number }
  const agg = new Map<string, EdgeAgg>()

  for (const row of rows) {
    const nameA = row.student_name
    if (!nameA) continue
    for (const pm of row.peer_matches ?? []) {
      if ((pm.similarity ?? 0) < 50) continue
      const nameB =
        pm.profiles?.display_name ??
        rows.find((r) => r.student_id === pm.peer_student_id)?.student_name ??
        ""
      if (!nameB) continue

      const [lo, hi] = nameA <= nameB ? [nameA, nameB] : [nameB, nameA]
      const key = `${lo}\0${hi}`
      const sim = Math.round(Number(pm.similarity))
      const prev = agg.get(key)
      if (!prev || sim > prev.sim) {
        agg.set(key, { a: lo, b: hi, sim })
      }
    }
  }

  return {
    graphEdges: [...agg.values()],
    graphNodes,
  }
}

export async function loadAnalysisReportForAssignment(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisReport | null> {
  const supabase = supabaseClient ?? createBrowserClient()

  const run = await getLatestAnalysisRun(assignmentId, supabase)
  if (!run) return null

  const rows = await getAnalysisScoresWithPeers(run.id, supabase)
  if (!rows.length) return null

  const baselinesByStudentId = await getStudentBaselines(supabase)
  
  const submissionIds = (rows as ScoreWithPeers[])
    .map((r) => r.submission_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    
  const scanSourcesBySubmission = await fetchScanSourcesMapBySubmissionIds(
    supabase,
    submissionIds,
  )

  const scores: Record<string, StudentScore> = {}
  const sortedRows = sortByCreatedAtDesc(rows as ScoreWithPeers[])
  const { graphEdges, graphNodes } = rebuildGraphFromRows(sortedRows)
  const seenStudentIds = new Set<string>()

  for (const row of sortedRows) {
    if (seenStudentIds.has(row.student_id)) continue
    seenStudentIds.add(row.student_id)

    const studentName = row.student_name ?? `Student ${row.student_id.slice(0, 8)}`
    const dbBaseline = baselineFromRow(baselinesByStudentId[row.student_id])
    const historicVec = resolveHistoricProfile(studentName, dbBaseline)
    const deviation = row.stilometric ?? 0

    const peerMatches = (row.peer_matches ?? [])
      .filter((pm) => (pm.similarity ?? 0) >= 50)
      .map((pm) => ({
        name: pm.profiles?.display_name ?? "Unknown",
        similarity: Math.round(Number(pm.similarity)),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4)

    const rawMetrics = rawMetricsFromScoreRow(row)
    const rawBaseline = rawBaselineFromRow(baselinesByStudentId[row.student_id])

    const uiTtr = rawMetrics?.ttr ?? historicVec.lexicalDiversity
    const uiAsl = rawMetrics?.asl ?? historicVec.avgSentenceLength
    const uiVerbs = rawMetrics?.verbs ?? historicVec.verbDensity
    const uiAdjs = rawMetrics?.adjs ?? historicVec.adjectiveDensity
    const uiPunct = rawMetrics?.punct ?? historicVec.punctuationUsage

    console.log("[Stylometry Debug] loadAnalysisReportForAssignment row", {
      studentName,
      verbsRawFromDb: row.verbs,
      verbsMappedToUi: uiVerbs,
      stylometryMetrics: rawMetrics,
    })

    scores[studentName] = {
      aiScore: row.ai_score ?? 0,
      similarity: row.similarity ?? 0,
      stilometric: stylometricLabel(deviation),
      lexicalDiversity: uiTtr,
      avgSentenceLength: uiAsl,
      verbDensity: uiVerbs,
      adjectiveDensity: uiAdjs,
      punctuationUsage: uiPunct,
      historicLexicalDiversity: rawBaseline?.ttr ?? historicVec.lexicalDiversity,
      historicAvgSentenceLength: rawBaseline?.asl ?? historicVec.avgSentenceLength,
      historicVerbDensity: rawBaseline?.verbs ?? historicVec.verbDensity,
      historicAdjectiveDensity: rawBaseline?.adjs ?? historicVec.adjectiveDensity,
      historicPunctuationUsage: rawBaseline?.punct ?? historicVec.punctuationUsage,
      peerMatches,
      plagiarismWeb: row.submission_id
        ? (() => {
            const sources = scanSourcesBySubmission.get(row.submission_id!) ?? []
            return sources.length > 0
              ? plagiarismReportFromScanSources(sources)
              : null
          })()
        : null,
      id: row.id,
      analysisScoreId: row.id,
      analysis_score_id: row.id,
      studentId: row.student_id,
      student_id: row.student_id,
      submissionId: row.submission_id ?? undefined,
      submission_id: row.submission_id ?? undefined,
      stilometricDeviation: deviation,
      
      stylometryMetrics: rawMetrics,
      stylometryBaseline: rawBaseline,
    }
  }

  return {
    assignmentId,
    ranAt: run.created_at ?? run.ran_at,
    scores,
    graphEdges,
    graphNodes,
  }
}
