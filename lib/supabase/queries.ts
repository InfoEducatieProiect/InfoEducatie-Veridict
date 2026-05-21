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
  updated_at: string
}

export interface AnalysisRun {
  id: string
  assignment_id: string
  ran_at: string
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
  /** Global web plagiarism report (Gemini grounding + cosine). */
  plagiarism_urls?: Record<string, unknown> | null
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
}): Promise<Assignment> {
  const supabase = createClient()
  const { data: assignment, error } = await supabase
    .from("assignments")
    .insert(data)
    .select("*, classes(code)")
    .single()
  
  if (error) throw error
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

// Get student baselines
export async function getStudentBaselines(
  supabaseClient?: SupabaseClient,
): Promise<Record<string, StudentBaseline>> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("student_baselines")
    .select("*")
  
  if (error) throw error
  
  const baselines: Record<string, StudentBaseline> = {}
  for (const b of data || []) {
    baselines[b.student_id] = b
  }
  return baselines
}

// Create an analysis run
export async function createAnalysisRun(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisRun> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("analysis_runs")
    .insert({ assignment_id: assignmentId })
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Save analysis scores (returns inserted rows with ids for peer_matches)
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
    .insert(scores)
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
    .insert(legacyScores)
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")

  if (second.error) throw second.error
  return parse(second.data || [])
}

// Save peer matches
export async function savePeerMatches(
  matches: PeerMatchInsert[],
  supabaseClient?: SupabaseClient,
): Promise<void> {
  const supabase = sb(supabaseClient)
  const first = await supabase
    .from("peer_matches")
    .insert(matches)

  if (!first.error) return
  if (!isMissingColumnError(first.error)) throw first.error

  // Backward-compatible fallback for databases missing `fraze_elev1/fraze_elev2`.
  const legacyMatches = matches.map((m) => ({
    analysis_score_id: m.analysis_score_id,
    peer_student_id: m.peer_student_id,
    similarity: m.similarity,
  }))
  const second = await supabase
    .from("peer_matches")
    .insert(legacyMatches)
  if (second.error) throw second.error
}

// Update submission with analysis results
export async function updateSubmissionAnalysis(
  submissionId: string,
  aiScore: number,
  supabaseClient?: SupabaseClient,
): Promise<void> {
  const supabase = sb(supabaseClient)
  const { error } = await supabase
    .from("submissions")
    .update({ analysed: true, ai_score: aiScore })
    .eq("id", submissionId)
  
  if (error) throw error
}

// Get the latest analysis run for an assignment
export async function getLatestAnalysisRun(
  assignmentId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisRun | null> {
  const supabase = sb(supabaseClient)
  const { data, error } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("ran_at", { ascending: false })
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
  
  if (error) throw error
  return (data || []).map(s => ({
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

  if (!first.error) {
    return (first.data || []).map((s) => ({
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
  if (second.error) throw second.error
  return (second.data || []).map((s) => ({
    ...s,
    student_name: (s as { profiles?: { display_name?: string } }).profiles?.display_name,
  }))
}

/** Latest analysis_scores row for a submission (current assignment run). */
export async function getAnalysisScoreForSubmission(
  assignmentId: string,
  submissionId: string,
  supabaseClient?: SupabaseClient,
): Promise<AnalysisScore | null> {
  const supabase = sb(supabaseClient)
  const run = await getLatestAnalysisRun(assignmentId, supabase)
  if (!run) return null

  const { data, error } = await supabase
    .from("analysis_scores")
    .select("*, profiles!analysis_scores_student_id_fkey(display_name)")
    .eq("analysis_run_id", run.id)
    .eq("submission_id", submissionId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return {
    ...data,
    student_name: (data as { profiles?: { display_name?: string } }).profiles
      ?.display_name,
  }
}

/** Persist global web plagiarism JSON on analysis_scores.plagiarism_urls. */
export async function updateAnalysisScorePlagiarism(
  analysisScoreId: string,
  report: Record<string, unknown>,
  supabaseClient?: SupabaseClient,
): Promise<void> {
  const supabase = sb(supabaseClient)
  const { error } = await supabase
    .from("analysis_scores")
    .update({ plagiarism_urls: report })
    .eq("id", analysisScoreId)

  if (error) throw error
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
