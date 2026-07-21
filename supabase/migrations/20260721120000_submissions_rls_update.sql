-- Add the missing UPDATE policy for profesori on `submissions`.
--
-- `submissions.analysed` / `ai_score` are written by updateSubmissionAnalysis()
-- during an analysis run, under the *professor's* auth session — but the table's
-- RLS was authored for the student owner (SELECT + INSERT). PostgREST returns
-- 204/no-error for an UPDATE that RLS filters to 0 rows, so the write silently
-- did nothing and every analysed submission kept reading `analysed = false`.
--
-- Same gap as 20260523130000 (analysis_runs / analysis_scores / peer_matches)
-- and 20260523140000 (scan_sources). `submissions` was never audited.
--
-- Note: this does not backfill. Rows analysed before this migration stay false;
-- the UI derives the analysed state from `analysis_scores` instead, which was
-- always written correctly.

CREATE POLICY submissions_update ON submissions FOR UPDATE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));
