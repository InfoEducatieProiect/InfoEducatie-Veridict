-- Deduplicate analysis_runs (one per assignment) and analysis_scores (one per run+submission).
-- Adds UNIQUE constraints and ON DELETE CASCADE to FKs so reruns upsert in place.

-- Step 1: Keep only the newest analysis_run per assignment; delete stale cascades manually
-- (CASCADE doesn't exist yet, so delete in dependency order)

WITH kept_runs AS (
  SELECT DISTINCT ON (assignment_id) id
  FROM analysis_runs
  ORDER BY assignment_id, ran_at DESC NULLS LAST, id DESC
),
old_scores AS (
  SELECT id FROM analysis_scores
  WHERE analysis_run_id NOT IN (SELECT id FROM kept_runs)
)
DELETE FROM peer_matches
WHERE analysis_score_id IN (SELECT id FROM old_scores);

WITH kept_runs AS (
  SELECT DISTINCT ON (assignment_id) id
  FROM analysis_runs
  ORDER BY assignment_id, ran_at DESC NULLS LAST, id DESC
)
DELETE FROM analysis_scores
WHERE analysis_run_id NOT IN (SELECT id FROM kept_runs);

WITH kept_runs AS (
  SELECT DISTINCT ON (assignment_id) id
  FROM analysis_runs
  ORDER BY assignment_id, ran_at DESC NULLS LAST, id DESC
)
DELETE FROM analysis_runs
WHERE id NOT IN (SELECT id FROM kept_runs);

-- Step 2: Collapse any duplicate analysis_scores within surviving runs

WITH kept_scores AS (
  SELECT DISTINCT ON (analysis_run_id, submission_id) id
  FROM analysis_scores
  WHERE submission_id IS NOT NULL
  ORDER BY analysis_run_id, submission_id, created_at DESC NULLS LAST, id DESC
)
DELETE FROM peer_matches
WHERE analysis_score_id NOT IN (SELECT id FROM kept_scores);

WITH kept_scores AS (
  SELECT DISTINCT ON (analysis_run_id, submission_id) id
  FROM analysis_scores
  WHERE submission_id IS NOT NULL
  ORDER BY analysis_run_id, submission_id, created_at DESC NULLS LAST, id DESC
)
DELETE FROM analysis_scores
WHERE submission_id IS NOT NULL
  AND id NOT IN (SELECT id FROM kept_scores);

-- Step 3: Add UNIQUE constraints
ALTER TABLE analysis_runs
  ADD CONSTRAINT analysis_runs_assignment_id_key UNIQUE (assignment_id);

ALTER TABLE analysis_scores
  ADD CONSTRAINT analysis_scores_run_submission_key UNIQUE (analysis_run_id, submission_id);

-- Step 4: Recreate FKs with ON DELETE CASCADE
ALTER TABLE analysis_scores
  DROP CONSTRAINT analysis_scores_analysis_run_id_fkey;
ALTER TABLE analysis_scores
  ADD CONSTRAINT analysis_scores_analysis_run_id_fkey
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE;

ALTER TABLE peer_matches
  DROP CONSTRAINT peer_matches_analysis_score_id_fkey;
ALTER TABLE peer_matches
  ADD CONSTRAINT peer_matches_analysis_score_id_fkey
  FOREIGN KEY (analysis_score_id) REFERENCES analysis_scores(id) ON DELETE CASCADE;
