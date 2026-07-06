"use client"

// Barrel re-export — all consumers continue to import from this path unchanged.
export * from "./types/academic-types"
export * from "./types/db-types"
export * from "./fixtures/db-students"
export * from "./fixtures/db-submissions"
export * from "./fixtures/student-baselines"
export * from "./fixtures/submission-helpers"
export { AssignmentProvider, useAssignments } from "./context/assignment-context"
