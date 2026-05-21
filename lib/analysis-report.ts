/**
 * Builds, persists, and loads analysis reports via Supabase.
 * Similarity core: cosine TF–IDF-like vectors + phrase Jaccard (see lib/analysisEngine.ts).
 */

import type { HistoricBaseline } from "./assignment-store"
import {
  parsePlagiarismWebReport,
  type PlagiarismWebReport,
} from "./plagiarism-web"
import {
  calculateManhattanDeviation,
  computeStylometricVector,
  resolveHistoricProfile,
} from "./analysisEngine"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getLatestAnalysisRun,
  getAnalysisScoresWithPeers,
  getStudentBaselines,
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
  /** Cached global web plagiarism (analysis_scores.plagiarism_urls). */
  plagiarismWeb?: PlagiarismWebReport | null
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
  /** Dedup unordered edges for Graful global (similarity ≥50%). */
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
  return deviation > 40 ? "Abatere Stilistica" : "Stil Consistent"
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

/** Încarcă ultimul raport pentru o temă. */
export async function loadAnalysisReportForAssignment(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisReport | null> {
  const run = await getLatestAnalysisRun(assignmentId, supabaseClient)
  if (!run) return null

  const rows = await getAnalysisScoresWithPeers(run.id, supabaseClient)
  if (!rows.length) return null

  const baselinesByStudentId = await getStudentBaselines(supabaseClient)
  const scores: Record<string, StudentScore> = {}
  const { graphEdges, graphNodes } = rebuildGraphFromRows(rows as ScoreWithPeers[])

  for (const row of rows as ScoreWithPeers[]) {
    const studentName =
      row.student_name ?? `Student ${row.student_id.slice(0, 8)}`
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

    scores[studentName] = {
      aiScore: row.ai_score ?? 0,
      similarity: row.similarity ?? 0,
      stilometric: stylometricLabel(deviation),
      lexicalDiversity: row.ttr ?? 0,
      avgSentenceLength: row.asl ?? 0,
      verbDensity: row.verbs ?? 0,
      adjectiveDensity: row.adjs ?? 0,
      punctuationUsage: row.punct ?? 0,
      historicLexicalDiversity: historicVec.lexicalDiversity,
      historicAvgSentenceLength: historicVec.avgSentenceLength,
      historicVerbDensity: historicVec.verbDensity,
      historicAdjectiveDensity: historicVec.adjectiveDensity,
      historicPunctuationUsage: historicVec.punctuationUsage,
      peerMatches,
      plagiarismWeb: parsePlagiarismWebReport(row.plagiarism_urls ?? null),
    }
  }

  return {
    assignmentId,
    ranAt: run.ran_at,
    scores,
    graphEdges,
    graphNodes,
  }
}
