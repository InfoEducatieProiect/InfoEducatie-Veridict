-- Extend peer_matches with phrase payloads for forensic previews.
-- Add stylometric_consistent flag alongside numeric deviation column.

ALTER TABLE peer_matches
  ADD COLUMN IF NOT EXISTS fraze_elev1 JSONB DEFAULT '[]'::JSONB NOT NULL,
  ADD COLUMN IF NOT EXISTS fraze_elev2 JSONB DEFAULT '[]'::JSONB NOT NULL;

ALTER TABLE analysis_scores
  ADD COLUMN IF NOT EXISTS stilometric_consistent BOOLEAN DEFAULT TRUE NOT NULL;

COMMENT ON COLUMN peer_matches.fraze_elev1 IS 'Phrases from the analysis_score student directed toward peer (overlap detection)';
COMMENT ON COLUMN peer_matches.fraze_elev2 IS 'Phrases from the peer toward the scored student';
