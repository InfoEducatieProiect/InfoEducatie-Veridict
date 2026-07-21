import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Browser client by default; pass a server `createClient()` for Route Handlers. */
function sb(client?: SupabaseClient): SupabaseClient {
  return client ?? createClient()
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { code?: string; message?: string }
  return (
    e.code === "42703" ||
    e.code === "PGRST204" ||
    (typeof e.message === "string" &&
      (e.message.includes("does not exist") || e.message.includes("schema cache")))
  )
}

/**
 * True when an `upsert(..., { onConflict })` fails because the target table has
 * no matching unique constraint/index (Postgres `42P10`). Happens on an
 * un-migrated DB where `student_baselines_student_id_key` doesn't exist yet.
 */
function isMissingUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { code?: string; message?: string }
  return (
    e.code === "42P10" ||
    (typeof e.message === "string" &&
      e.message.includes("no unique or exclusion constraint matching the ON CONFLICT"))
  )
}

/** Newest-first for in-memory rows when DB order cannot be relied on. */
export function sortByCreatedAtDesc<T extends { created_at?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime(),
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "elev" | "profesor"

export interface Profile {
  id: string
  role: UserRole
  display_name: string
  class_id: string | null
  created_at: string
}

export interface ClassInfo {
  id: string
  code: string
  created_at: string
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
  /** "tema" (homework) or "test"; defaults to "tema" when the column is absent. */
  type?: "tema" | "test"
  // Joined fields
  class_code?: string
  professor_name?: string
}

export interface AssignmentAttachment {
  id: string
  assignment_id: string
  storage_path: string
  filename: string
  size_bytes: number | null
  created_at: string
}

export interface Submission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  file_name: string | null
  text: string | null
  file_storage_path: string | null
  analysed: boolean
  ai_score: number | null
  // Joined fields
  student_name?: string
}

export interface StudentBaseline {
  student_id: string
  ttr: number | null
  asl: number | null
  verbs: number | null
  adjs: number | null
  punct: number | null
  /** Number of tests averaged into this baseline; drives the running-average formula. */
  sample_count?: number | null
  updated_at: string
}

export interface AnalysisRun {
  id: string
  assignment_id: string
  ran_at: string
  created_at?: string
}

export interface AnalysisScore {
  id: string
  analysis_run_id: string
  student_id: string
  submission_id: string | null
  ai_score: number | null
  similarity: number | null
  stilometric: number | null
  /** True when stylistic deviation is within acceptable bounds (typically deviation ≤ 40). */
  stilometric_consistent?: boolean | null
  ttr: number | null
  asl: number | null
  verbs: number | null
  adjs: number | null
  punct: number | null
  created_at: string
  // Joined fields
  student_name?: string
}

export interface PeerMatch {
  id: string
  analysis_score_id: string
  peer_student_id: string
  similarity: number
  fraze_elev1?: string[] | null
  fraze_elev2?: string[] | null
  created_at: string
  // Joined fields
  peer_name?: string
}

/** Rows inserted into peer_matches */
export type PeerMatchInsert = {
  analysis_score_id: string
  peer_student_id: string
  similarity: number
  fraze_elev1: string[]
  fraze_elev2: string[]
}

// ─── Query Functions ──────────────────────────────────────────────────────────

// Get current user's profile
export async function getCurrentProfile() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, classes(code)")
    .eq("id", user.id)
    .single()
  
  return profile
}

// Get all classes
export async function getClasses(): Promise<ClassInfo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .order("code")
  
  if (error) throw error
  return data || []
}

// Get students in a class
export async function getStudentsByClass(classId: string): Promise<Profile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("class_id", classId)
    .eq("role", "elev")
    .order("display_name")
  
  if (error) throw error
  return data || []
}

// Get all students (for professors)
export async function getAllStudents(): Promise<(Profile & { class_code?: string })[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("*, classes(code)")
    .eq("role", "elev")
    .order("display_name")
  
  if (error) throw error
  return (data || []).map(s => ({
    ...s,
    class_code: (s as { classes?: { code: string } }).classes?.code
  }))
}

// ─── Assignment Functions ─────────────────────────────────────────────────────

// Get assignments for a student (by their class)
export async function getAssignmentsForStudent(classId: string): Promise<Assignment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("assignments")
    .select("*, classes(code), profiles!assignments_professor_id_fkey(display_name)")
    .eq("class_id", classId)
    .order("deadline", { ascending: true })
  
  if (error) throw error
  return (data || []).map(a => ({
    ...a,
    class_code: (a as { classes?: { code: string } }).classes?.code,
    professor_name: (a as { profiles?: { display_name: string } }).profiles?.display_name
  }))
}

// Get all assignments (for professors)
export async function getAssignmentsForProfessor(professorId: string): Promise<Assignment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("assignments")
    .select("*, classes(code)")
    .eq("professor_id", professorId)
    .order("created_at", { ascending: false })
  
  if (error) throw error
  return (data || []).map(a => ({
    ...a,
    class_code: (a as { classes?: { code: string } }).classes?.code
  }))
}

// Create a new assignment
export async function createAssignment(data: {
  professor_id: string
  title: string
  requirement?: string
  details?: string
  deadline: string
  class_id: string
  type?: "tema" | "test"
}): Promise<Assignment> {
  const supabase = createClient()
  let res = await supabase
    .from("assignments")
    .insert(data)
    .select("*, classes(code)")
    .single()

  // Backward-compat: retry without `type` if the column hasn't been migrated yet.
  if (res.error && isMissingColumnError(res.error)) {
    const { type: _type, ...rest } = data
    res = await supabase
      .from("assignments")
      .insert(rest)
      .select("*, classes(code)")
      .single()
  }

  if (res.error) throw res.error
  const assignment = res.data
  return {
    ...assignment,
    class_code: (assignment as { classes?: { code: string } }).classes?.code
  }
}

// ─── Submission Functions ─────────────────────────────────────────────────────

// Get student's own submissions
export async function getStudentSubmissions(studentId: string): Promise<(Submission & { assignment_title?: string })[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("submissions")
    .select("*, assignments(title)")
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false })
  
  if (error) throw error
  return (data || []).map(s => ({
    ...s,
    assignment_title: (s as { assignments?: { title: string } }).assignments?.title
  }))
}

/** A student's submission enriched with its parent assignment's metadata. */
export interface ProfessorStudentSubmission extends Submission {
  assignment_title?: string
  assignment_type?: "tema" | "test"
  assignment_deadline?: string
  assignment_class_code?: string
}

const PROF_STUDENT_SUB_SELECT =
  "*, assignments!inner(id, title, type, deadline, professor_id, classes(code))"
const PROF_STUDENT_SUB_SELECT_LEGACY =
  "*, assignments!inner(id, title, deadline, professor_id, classes(code))"

/**
 * Every submission this student has ever made, restricted to assignments owned
 * by `professorId`. The `!inner` join is what makes the
 * `assignments.professor_id` filter actually restrict rows — with a plain embed
 * PostgREST returns every submission and just nulls the embedded object.
 */
export async function getStudentSubmissionsForProfessor(
  studentId: string,
  professorId: string,
  supabaseClient?: SupabaseClient,
): Promise<ProfessorStudentSubmission[]> {
  const supabase = sb(supabaseClient)
  const run = (select: string) =>
    supabase
      .from("submissions")
      .select(select)
      .eq("student_id", studentId)
      .eq("assignments.professor_id", professorId)
      .order("submitted_at", { ascending: false })

  let res = await run(PROF_STUDENT_SUB_SELECT)
  // Backward-compat: retry without `type` if the column hasn't been migrated yet.
  if (res.error && isMissingColumnError(res.error)) {
    res = await run(PROF_STUDENT_SUB_SELECT_LEGACY)
  }
  if (res.error) throw res.error

  return (res.data || []).map((s) => {
    const a = (s as {
      assignments?: {
        title?: string
        type?: "tema" | "test"
        deadline?: string
        classes?: { code?: string }
      }
    }).assignments
    return {
      ...(s as object),
      assignment_title: a?.title,
      // Legacy rows without a `type` are treated as homework ("tema").
      assignment_type: a?.type ?? "tema",
      assignment_deadline: a?.deadline,
      assignment_class_code: a?.classes?.code,
    } as ProfessorStudentSubmission
  })
}

// Get submissions for an assignment (professor view)
export async function getSubmissionsForAssignment(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<Submission[]> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("submissions")
    .select("*, profiles!submissions_student_id_fkey(display_name)")
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false })
  
  if (error) throw error
  return (data || []).map(s => ({
    ...s,
    student_name: (s as { profiles?: { display_name: string } }).profiles?.display_name
  }))
}

/** Submissions turned in with non-empty essay text (live analysis input). */
export function filterSubmittedWithText(rows: Submission[]): Submission[] {
  return rows.filter(
    (s) =>
      s.submitted_at != null &&
      typeof s.text === "string" &&
      s.text.trim().length > 0,
  )
}

export async function getSubmittedSubmissionsForAssignment(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<Submission[]> {
  const all = await getSubmissionsForAssignment(assignmentId, supabaseClient)
  return filterSubmittedWithText(all)
}

// Check if student has submitted an assignment
export async function hasStudentSubmitted(studentId: string, assignmentId: string): Promise<boolean> {
  const supabase = createClient()
  const { data } = await supabase
    .from("submissions")
    .select("id")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .single()
  
  return !!data
}

// Create a submission
export async function createSubmission(data: {
  student_id: string
  assignment_id: string
  file_name?: string
  text?: string
  file_storage_path?: string
}): Promise<Submission> {
  const supabase = createClient()
  const { data: submission, error } = await supabase
    .from("submissions")
    .insert(data)
    .select()
    .single()
  
  if (error) throw error
  return submission
}

// ─── Analysis Functions ───────────────────────────────────────────────────────

// Get student baselines. Pass `studentIds` to fetch only the rows needed for one
// assignment instead of the entire table (avoids a growing full-table scan).
export async function getStudentBaselines(
  supabaseClient?: SupabaseClient,
  studentIds?: string[],
): Promise<Record<string, StudentBaseline>> {
  const supabase = sb(supabaseClient)
  let query = supabase.from("student_baselines").select("*")

  if (studentIds) {
    const uniqueIds = [...new Set(studentIds.filter(Boolean))]
    if (uniqueIds.length === 0) return {}
    query = query.in("student_id", uniqueIds)
  }

  const { data, error } = await query

  if (error) throw error

  const baselines: Record<string, StudentBaseline> = {}
  for (const b of data || []) {
    baselines[b.student_id] = b
  }
  return baselines
}

const BASELINE_METRIC_KEYS = ["ttr", "asl", "verbs", "adjs", "punct"] as const
type BaselineMetrics = Record<(typeof BASELINE_METRIC_KEYS)[number], number>

function round2Metric(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * All `analysis_runs.id` values belonging to TEST-type assignments. Fetch this
 * once per batch/analysis call and reuse across students — cheap, global (a
 * school's assignment count is small), and avoids depending on PostgREST
 * embedded-relationship syntax.
 */
export async function getTestAssignmentRunIds(supabaseClient?: SupabaseClient): Promise<string[]> {
  const supabase = sb(supabaseClient)
  const { data: testAssignments, error: aErr } = await supabase
    .from("assignments")
    .select("id")
    .eq("type", "test")
  if (aErr) {
    if (!isMissingColumnError(aErr)) console.error("[baseline] failed to load test assignments:", aErr.message)
    return []
  }
  if (!testAssignments?.length) return []

  const { data: runs, error: rErr } = await supabase
    .from("analysis_runs")
    .select("id")
    .in("assignment_id", testAssignments.map((a) => a.id))
  if (rErr) {
    console.error("[baseline] failed to load test analysis_runs:", rErr.message)
    return []
  }
  return (runs || []).map((r) => r.id)
}

/**
 * Recompute a student's stylometric baseline as the arithmetic mean of their
 * `analysis_scores` across every TEST assignment they've been analyzed on.
 * `analysis_scores` is upserted on `(analysis_run_id, submission_id)`, so
 * re-analyzing the same test overwrites its single row rather than adding a
 * new sample — making this recompute idempotent under reruns. `sample_count`
 * reflects the number of distinct tests, not the number of analysis runs.
 */
export async function recomputeStudentBaseline(
  studentId: string,
  testRunIds: string[],
  supabaseClient?: SupabaseClient,
): Promise<void> {
  if (testRunIds.length === 0) return
  const supabase = sb(supabaseClient)

  const { data: rows, error: sErr } = await supabase
    .from("analysis_scores")
    .select("ttr, asl, verbs, adjs, punct")
    .eq("student_id", studentId)
    .in("analysis_run_id", testRunIds)
  if (sErr) throw sErr
  if (!rows?.length) return

  const sums = { ttr: 0, asl: 0, verbs: 0, adjs: 0, punct: 0 }
  let n = 0
  for (const row of rows) {
    if (BASELINE_METRIC_KEYS.some((k) => row[k] == null || !Number.isFinite(Number(row[k])))) continue
    for (const k of BASELINE_METRIC_KEYS) sums[k] += Number(row[k])
    n++
  }
  if (n === 0) return

  const now = new Date().toISOString()
  const next = {} as BaselineMetrics
  for (const k of BASELINE_METRIC_KEYS) next[k] = round2Metric(sums[k] / n)

  const full = { student_id: studentId, ...next, sample_count: n, updated_at: now }
  let { error } = await writeBaselineRow(supabase, studentId, full)

  // Backward-compat: DB without `sample_count` → write the averaged metrics without it.
  if (error && isMissingColumnError(error)) {
    ;({ error } = await writeBaselineRow(supabase, studentId, { student_id: studentId, ...next, updated_at: now }))
  }

  if (error) throw error
}

/**
 * Write a baseline row via `upsert(onConflict: student_id)`. If the DB is missing
 * the unique index (un-migrated → `42P10`), fall back to an explicit
 * read → update-or-insert so the baseline still persists.
 */
async function writeBaselineRow(
  supabase: SupabaseClient,
  studentId: string,
  payload: Record<string, unknown>,
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("student_baselines")
    .upsert(payload, { onConflict: "student_id" })
  if (!error || !isMissingUniqueConstraintError(error)) return { error }

  const { data: existingRow } = await supabase
    .from("student_baselines")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle()
  if (existingRow) {
    return await supabase.from("student_baselines").update(payload).eq("student_id", studentId)
  }
  return await supabase.from("student_baselines").insert(payload)
}

// Get or create an analysis run for an assignment (one row per assignment, upserted)
export async function getOrCreateAnalysisRun(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisRun> {
  const supabase = sb(supabaseClient)
  const ranAt = new Date().toISOString()
  const { data, error } = await supabase
    .from("analysis_runs")
    .upsert(
      { assignment_id: assignmentId, ran_at: ranAt },
      { onConflict: "assignment_id" },
    )
    .select()
    .single()

  if (error) throw error
  return data
}

// Save analysis scores — upsert on (analysis_run_id, submission_id) so reruns overwrite in place
export async function saveAnalysisScores(
  scores: Omit<AnalysisScore, "id" | "created_at" | "student_name">[],
  supabaseClient?: SupabaseClient,
): Promise<AnalysisScore[]> {
  const supabase = sb(supabaseClient)
  const parse = (data: unknown[]) =>
    (data || []).map((s) => ({
      ...(s as object),
      student_name: (s as { profiles?: { display_name?: string } }).profiles?.display_name,
    })) as AnalysisScore[]

  const first = await supabase
    .from("analysis_scores")
    .upsert(scores, { onConflict: "analysis_run_id,submission_id" })
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")

  if (!first.error) return parse(first.data || [])
  if (!isMissingColumnError(first.error)) throw first.error

  // Backward-compatible fallback for databases missing `stilometric_consistent`.
  const legacyScores = scores.map((s) => {
    const { stilometric_consistent: _ignored, ...rest } = s
    return rest
  })
  const second = await supabase
    .from("analysis_scores")
    .upsert(legacyScores, { onConflict: "analysis_run_id,submission_id" })
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")

  if (second.error) throw second.error
  return parse(second.data || [])
}

// Save peer matches — delete existing for these score IDs then insert fresh set
export async function savePeerMatches(
  matches: PeerMatchInsert[],
  supabaseClient?: SupabaseClient,
  scoreIdsToWipe?: string[],
): Promise<void> {
  if (matches.length === 0) return
  const supabase = sb(supabaseClient)

  // Delete stale peer_matches for the affected analysis_score rows before reinserting
  const idsToDelete =
    scoreIdsToWipe ??
    [...new Set(matches.map((m) => m.analysis_score_id))]
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("peer_matches")
      .delete()
      .in("analysis_score_id", idsToDelete)
    if (delErr) throw delErr
  }

  const first = await supabase.from("peer_matches").insert(matches)
  if (!first.error) return
  if (!isMissingColumnError(first.error)) throw first.error

  // Backward-compatible fallback for databases missing `fraze_elev1/fraze_elev2`.
  const legacyMatches = matches.map((m) => ({
    analysis_score_id: m.analysis_score_id,
    peer_student_id: m.peer_student_id,
    similarity: m.similarity,
  }))
  const second = await supabase.from("peer_matches").insert(legacyMatches)
  if (second.error) throw second.error
}

// Update submission with analysis results
export async function updateSubmissionAnalysis(
  submissionId: string,
  aiScore: number,
  supabaseClient?: SupabaseClient,
): Promise<void> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("submissions")
    .update({ analysed: true, ai_score: aiScore })
    .eq("id", submissionId)
    .select("id")

  if (error) throw error
  // An UPDATE filtered out by RLS returns 204/no-error while affecting 0 rows,
  // which is how `submissions.analysed` silently stayed false for every
  // analysis before migration 20260721120000. Warn rather than throw: throwing
  // would reject the Promise.all in analysis-report-persist and abort the whole
  // run on any deployment that hasn't applied that migration yet.
  if (!data || data.length === 0) {
    console.warn(
      `[Veridict] updateSubmissionAnalysis affected 0 rows for submission ${submissionId} — ` +
        "the submissions UPDATE policy is probably missing (see migration 20260721120000).",
    )
  }
}

/**
 * Submission ids that have an `analysis_scores` row — the authoritative
 * "has been analysed" signal.
 *
 * Prefer this over `submissions.analysed`, which is unreliable: its UPDATE runs
 * under the professor's session and was silently blocked by RLS until migration
 * 20260721120000, so historical rows read false despite having been analysed.
 */
export async function getAnalysedSubmissionIds(
  submissionIds: string[],
  supabaseClient?: SupabaseClient,
): Promise<Set<string>> {
  if (submissionIds.length === 0) return new Set()
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("analysis_scores")
    .select("submission_id")
    .in("submission_id", submissionIds)

  if (error) throw error
  return new Set(
    (data ?? [])
      .map((r) => (r as { submission_id?: string | null }).submission_id)
      .filter((id): id is string => !!id),
  )
}

// Get the latest analysis run for an assignment (newest first: created_at → ran_at → id)
export async function getLatestAnalysisRun(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisRun | null> {
  const supabase = sb(supabaseClient)
  
  // Sortăm direct după ran_at DESC pentru a aduce mereu cea mai nouă rulare la refresh
  const { data, error } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("ran_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}
// Get analysis scores for a run
export async function getAnalysisScores(
  runId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisScore[]> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("analysis_scores")
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")
    .eq("analysis_run_id", runId)
    .order("created_at", { ascending: false })
  
  if (error) throw error
  return sortByCreatedAtDesc(data || []).map(s => ({
    ...s,
    student_name: (s as { profiles?: { display_name: string } }).profiles?.display_name
  }))
}

// Get analysis scores with nested peer matches for a run
export async function getAnalysisScoresWithPeers(
  runId: string,
  supabaseClient?: SupabaseClient,
) {
  const supabase = sb(supabaseClient)
  const first = await supabase
    .from("analysis_scores")
    .select(`
      *,
      profiles!analysis_scores_student_id_fkey(display_name),
      peer_matches(
        similarity,
        peer_student_id,
        fraze_elev1,
        fraze_elev2,
        profiles!peer_matches_peer_student_id_fkey(display_name)
      )
    `)
    .eq("analysis_run_id", runId)
    .order("created_at", { ascending: false })

  if (!first.error) {
    return sortByCreatedAtDesc(first.data || []).map((s) => ({
      ...s,
      student_name: (s as { profiles?: { display_name?: string } }).profiles?.display_name,
    }))
  }
  if (!isMissingColumnError(first.error)) throw first.error

  // Backward-compatible fallback for databases missing `fraze_elev1/fraze_elev2`.
  const second = await supabase
    .from("analysis_scores")
    .select(`
      *,
      profiles!analysis_scores_student_id_fkey(display_name),
      peer_matches(
        similarity,
        peer_student_id,
        profiles!peer_matches_peer_student_id_fkey(display_name)
      )
    `)
    .eq("analysis_run_id", runId)
    .order("created_at", { ascending: false })
  if (second.error) throw second.error
  return sortByCreatedAtDesc(second.data || []).map((s) => ({
    ...s,
    student_name: (s as { profiles?: { display_name?: string } }).profiles?.display_name,
  }))
}

/** Latest analysis_scores row for a submission (newest run + newest row). */
export async function getAnalysisScoreForSubmission(
  assignmentId: string,
  submissionId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisScore | null> {
  const supabase = sb(supabaseClient)

  const { data, error } = await supabase
    .from("analysis_scores")
    .select(
      "*, profiles!analysis_scores_student_id_fkey(display_name), analysis_runs!inner(assignment_id)",
    )
    .eq("submission_id", submissionId)
    .eq("analysis_runs.assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!error && data) {
    return {
      ...data,
      student_name: (data as { profiles?: { display_name?: string } }).profiles
        ?.display_name,
    }
  }

  if (error && !isMissingColumnError(error)) throw error

  // Fallback when inner join on analysis_runs is unavailable in schema cache
  const run = await getLatestAnalysisRun(assignmentId, supabase)
  if (!run) return null

  const legacy = await supabase
    .from("analysis_scores")
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")
    .eq("analysis_run_id", run.id)
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (legacy.error) throw legacy.error
  if (!legacy.data) return null
  return {
    ...legacy.data,
    student_name: (legacy.data as { profiles?: { display_name?: string } })
      .profiles?.display_name,
  }
}

// Get peer matches for an analysis score
export async function getPeerMatches(scoreId: string): Promise<PeerMatch[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("peer_matches")
    .select("*, profiles!peer_matches_peer_student_id_fkey(display_name)")
    .eq("analysis_score_id", scoreId)
    .order("similarity", { ascending: false })
  
  if (error) throw error
  return (data || []).map(m => ({
    ...m,
    peer_name: (m as { profiles?: { display_name: string } }).profiles?.display_name
  }))
}

// ─── Submission Stats ─────────────────────────────────────────────────────────

export async function getSubmissionStats(assignmentId: string, classId: string): Promise<{
  submitted: number
  total: number
  notSubmitted: number
}> {
  const supabase = createClient()
  
  // Get total students in the class
  const { count: totalStudents } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("role", "elev")
  
  // Get submitted count
  const { count: submittedCount } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("assignment_id", assignmentId)
  
  const total = totalStudents || 0
  const submitted = submittedCount || 0
  
  return {
    submitted,
    total,
    notSubmitted: total - submitted
  }
}

// Get students who haven't submitted
export async function getUnsubmittedStudents(assignmentId: string, classId: string): Promise<Profile[]> {
  const supabase = createClient()
  
  // Get all students in the class
  const { data: students } = await supabase
    .from("profiles")
    .select("*")
    .eq("class_id", classId)
    .eq("role", "elev")
  
  // Get students who have submitted
  const { data: submissions } = await supabase
    .from("submissions")
    .select("student_id")
    .eq("assignment_id", assignmentId)
  
  const submittedIds = new Set((submissions || []).map(s => s.student_id))
  
  return (students || []).filter(s => !submittedIds.has(s.id))
}
