-- Persist an in-progress answer so an assessment can resume exactly where the candidate left it.
ALTER TABLE assessment_adaptive_logs
  ADD COLUMN IF NOT EXISTS draft_response TEXT;
