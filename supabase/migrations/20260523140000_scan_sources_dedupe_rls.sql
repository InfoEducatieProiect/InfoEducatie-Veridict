-- Deduplicate existing rows: keep highest similarity_score per (submission_id, url)
DELETE FROM scan_sources
WHERE id NOT IN (
  SELECT DISTINCT ON (submission_id, url) id
  FROM scan_sources
  ORDER BY submission_id, url, similarity_score DESC NULLS LAST, created_at DESC
);

-- Unique constraint enables upsert ON CONFLICT (submission_id, url)
ALTER TABLE scan_sources
  ADD CONSTRAINT scan_sources_submission_id_url_key
  UNIQUE (submission_id, url);

-- DELETE policy was missing — caused wipeScanSourcesForSubmission to silently fail
CREATE POLICY "Permite stergerea surselor"
  ON scan_sources
  FOR DELETE
  USING (true);

-- UPDATE policy for upsert ON CONFLICT DO UPDATE branch
CREATE POLICY "Permite actualizarea surselor"
  ON scan_sources
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
