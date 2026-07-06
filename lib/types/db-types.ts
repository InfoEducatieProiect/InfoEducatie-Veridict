export interface DbStudent {
  id: string
  name: string
}

export interface DbAssignment {
  id: string
  title: string
  deadline: string
}

export interface DbSubmission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  text: string
}

export interface HistoricBaseline {
  ttr: number
  asl: number
  verbs: number
  adjs: number
  punct: number
}
