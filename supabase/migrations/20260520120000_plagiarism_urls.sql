-- Web plagiarism scan results (Gemini grounding + cosine similarity).

ALTER TABLE analysis_scores
  ADD COLUMN IF NOT EXISTS plagiarism_urls JSONB DEFAULT NULL;

COMMENT ON COLUMN analysis_scores.plagiarism_urls IS
  'Global web plagiarism report: verdict, scor_maxim, sursa_principala, plagiarism_urls[{url,scor}]';
