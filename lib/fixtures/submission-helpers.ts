import type { DbStudent, DbSubmission } from "../types/db-types"
import type { Assignment, StudentSubmission } from "../types/academic-types"
import { DB_STUDENTS } from "./db-students"
import { DB_SUBMISSIONS } from "./db-submissions"

export function getStudentName(studentId: string): string {
  return DB_STUDENTS.find((s) => s.id === studentId)?.name ?? studentId
}

export function getSubmissionsForAssignment(assignmentId: string): Array<DbSubmission & { studentName: string }> {
  return DB_SUBMISSIONS
    .filter((sub) => sub.assignment_id === assignmentId)
    .map((sub) => ({
      ...sub,
      studentName: getStudentName(sub.student_id),
    }))
}

export function getUnsubmittedStudents(assignmentId: string): DbStudent[] {
  const submittedIds = new Set(
    DB_SUBMISSIONS.filter((s) => s.assignment_id === assignmentId).map((s) => s.student_id)
  )
  return DB_STUDENTS.filter((st) => !submittedIds.has(st.id))
}

export function getSubmissionStats(assignmentId: string) {
  const submitted = DB_SUBMISSIONS.filter((s) => s.assignment_id === assignmentId).length
  const total = DB_STUDENTS.length
  return { submitted, total, notSubmitted: total - submitted }
}

export const BALTAGUL_TEXTS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const sub of DB_SUBMISSIONS) {
    if (sub.assignment_id === "as_1") {
      const student = DB_STUDENTS.find((s) => s.id === sub.student_id)
      if (student) map[student.name] = sub.text
    }
  }
  return map
})()

export const CLASA_30_ELEVI: Record<string, string> = BALTAGUL_TEXTS

// ── Mock texts for other assignments ──────────────────────────────────────────

const MOCK_TEXT_1 = `Revoluția Industrială reprezintă una dintre cele mai profunde transformări din istoria omenirii. Începând cu Anglia secolului al XVIII-lea, procesul de industrializare a remodelat radical structura socială europeană, ducând la apariția proletariatului urban și a clasei burgheze.

Migrarea masivă de la sat la oraș a creat noi centre de putere economică, dar și zone de sărăcie extremă. Condiţiile de muncă în fabricile textile erau adesea inumane: copii de opt ani lucrau câte doisprezece ore pe zi, fără protecție legală.

Totodată, această perioadă a generat progrese tehnologice remarcabile — mașina cu aburi a lui James Watt, războiul mecanic de țesut, locomotiva cu aburi — care au comprimat distanțele și au accelerat comerțul internațional.`

const MOCK_TEXT_2 = `Impactul Revoluției Industriale nu poate fi subestimat. Transformările structurale ale societății europene din această perioadă au dus la apariția unor noi clase sociale și la modificarea fundamentală a relațiilor de producție.

Clasa muncitoare industrială, proletariatul, s-a format ca urmare directă a mecanizării producției. Aceasta a înlocuit meșteșugarul tradițional cu muncitorul de fabrică, anonim și înlocuibil.`

const MOCK_TEXT_3 = `Analiza istorică a Revoluției Industriale evidențiază un paradox fundamental: progresul material s-a construit pe suferința imediată a milioane de oameni. Urbanizarea accelerată a generat slumuri descrise vívid de Friedrich Engels în „Situația clasei muncitoare din Anglia".`

const MOCK_TEXT_BIO_1 = `Fotosinteza este procesul biochimic prin care plantele verzi convertesc energia luminoasă în energie chimică stocată sub formă de glucoză.

Ecuația globală: 6CO₂ + 6H₂O + energie luminoasă → C₆H₁₂O₆ + 6O₂

Procesul se desfășoară în reacțiile luminoase (în tilacoidele cloroplastului) și ciclul Calvin (în stroma cloroplastului).`

// ── Seed assignments ──────────────────────────────────────────────────────────

export const SEED_ASSIGNMENTS: Assignment[] = [
  {
    id: "a1",
    title: "Eseu — Revoluția Industrială",
    requirement: "Analizați impactul Revoluției Industriale asupra structurii sociale europene.",
    details: "Minimum 3 surse bibliografice. Format: .pdf sau .docx",
    deadline: "2026-05-25T23:59:00",
    createdAt: "10 mai 2026",
    submissionCount: 5,
    className: "12A",
    additional_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg",
    additional_filename: "Ghid_Revolutia_Industriala.pdf",
  },
  {
    id: "a2",
    title: "Monografia satului arhaic în Baltagul",
    requirement: "Analizați tema călătoriei inițiatice și construcția personajului Vitoria Lipan în romanul Baltagul de Mihail Sadoveanu.",
    details: "Minimum 400 cuvinte. Includeți citate din text. Format: .txt sau .docx",
    deadline: "2026-05-24T23:59:00",
    createdAt: "08 mai 2026",
    submissionCount: 29,
    className: "12B",
    additional_filename: "Baltagul_Sadoveanu_Editie_Critica.pdf",
  },
  {
    id: "a3",
    title: "Proiect — Fotosinteza",
    requirement: "Descrieți mecanismul fotosintezei și importanța sa ecologică.",
    details: "Includeți diagrame și scheme. Format: .pdf",
    deadline: "2026-06-01T23:59:00",
    createdAt: "05 mai 2026",
    submissionCount: 2,
    className: "10A",
  },
]

const DB_BALTAGUL_SUBS: StudentSubmission[] = getSubmissionsForAssignment("as_1").map((sub) => ({
  studentName: sub.studentName,
  assignmentId: "a2",
  fileName: `${sub.studentName.split(" ")[1] ?? sub.studentName}_Baltagul.docx`,
  uploadedAt: (() => {
    const d = new Date(sub.submitted_at)
    return d.toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  })(),
  aiScore: 0,
  analysed: false,
  textPreview: sub.text,
}))

export const SEED_SUBMISSIONS: StudentSubmission[] = [
  // 12A — Revoluția Industrială
  { studentName: "Andrei Popescu",   assignmentId: "a1", fileName: "Andrei_RevInd.pdf",   uploadedAt: "12 mai 2026, 09:14", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_1 },
  { studentName: "Maria Ionescu",    assignmentId: "a1", fileName: "Maria_RevInd.docx",   uploadedAt: "12 mai 2026, 11:02", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_2 },
  { studentName: "Vlad Constantin",  assignmentId: "a1", fileName: "Vlad_RevInd.pdf",     uploadedAt: "11 mai 2026, 16:45", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_3 },
  { studentName: "Elena Dumitrescu", assignmentId: "a1", fileName: "Elena_RevInd.pdf",    uploadedAt: "11 mai 2026, 14:30", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_1 },
  { studentName: "Radu Gheorghe",    assignmentId: "a1", fileName: "Radu_RevInd.docx",    uploadedAt: "10 mai 2026, 22:17", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_2 },
  // 12B — Baltagul (derived from DB_SUBMISSIONS relational join)
  ...DB_BALTAGUL_SUBS,
  // 10A — Fotosinteza
  { studentName: "Andrei Popescu", assignmentId: "a3", fileName: "Andrei_Fotosinteza.pdf",  uploadedAt: "07 mai 2026, 15:20", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_BIO_1 },
  { studentName: "Maria Ionescu",  assignmentId: "a3", fileName: "Maria_Fotosinteza.docx", uploadedAt: "06 mai 2026, 20:10", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_BIO_1 },
]
