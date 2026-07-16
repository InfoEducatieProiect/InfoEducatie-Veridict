-- Homework vs Test support + writable, averaged stylometric baselines.
--
-- 1. assignments.type: "tema" (homework) or "test". Homework is measured against
--    the baseline; a test instead UPDATES the student's baseline.
-- 2. student_baselines.sample_count: number of tests folded into the baseline,
--    driving the true running average new = (old*n + current)/(n+1).
-- 3. student_baselines was previously read-only from the app (only SELECT/INSERT
--    policies). Tests now upsert it, so add INSERT + UPDATE policies and make sure
--    a unique key on student_id exists for ON CONFLICT.

-- ── Columns ────────────────────────────────────────────────────────────────────
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'tema';

COMMENT ON COLUMN assignments.type IS 'Assignment type: ''tema'' (homework) or ''test''.';

ALTER TABLE student_baselines
  ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN student_baselines.sample_count IS 'Number of tests averaged into this baseline (running-average denominator).';

-- ── Unique key for upsert(onConflict: student_id) ──────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS student_baselines_student_id_key
  ON student_baselines (student_id);

-- ── RLS: allow profesori to write baselines ────────────────────────────────────
ALTER TABLE student_baselines ENABLE ROW LEVEL SECURITY;

-- Ensure reads keep working after RLS is (re)enabled. Additive to any existing
-- SELECT policy since policies are OR-ed.
DROP POLICY IF EXISTS student_baselines_select ON student_baselines;
CREATE POLICY student_baselines_select ON student_baselines FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

DROP POLICY IF EXISTS student_baselines_insert ON student_baselines;
CREATE POLICY student_baselines_insert ON student_baselines FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

DROP POLICY IF EXISTS student_baselines_update ON student_baselines;
CREATE POLICY student_baselines_update ON student_baselines FOR UPDATE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));
