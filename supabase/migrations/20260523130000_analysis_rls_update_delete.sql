-- Add missing UPDATE and DELETE policies for profesori on analysis tables.
-- INSERT/SELECT already exist; these were the missing gap causing silent no-ops
-- when upserts hit the UPDATE branch after the dedupe migration.

CREATE POLICY analysis_runs_update ON analysis_runs FOR UPDATE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

CREATE POLICY analysis_runs_delete ON analysis_runs FOR DELETE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

CREATE POLICY analysis_scores_update ON analysis_scores FOR UPDATE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

CREATE POLICY analysis_scores_delete ON analysis_scores FOR DELETE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

CREATE POLICY peer_matches_update ON peer_matches FOR UPDATE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));

CREATE POLICY peer_matches_delete ON peer_matches FOR DELETE TO public
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'profesor'));
