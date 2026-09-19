-- migrations/038_adaptive_session_schema_alignment.sql
-- Align adaptive assessment state with the existing PATIMA assessment_sessions schema.

ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

UPDATE assessment_sessions
SET started_at = COALESCE(started_at, created_at)
WHERE started_at IS NULL;

ALTER TABLE assessment_sessions
  ALTER COLUMN started_at SET DEFAULT clock_timestamp();

ALTER TABLE assessment_sessions
  ALTER COLUMN started_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_adaptive_state
  ON assessment_sessions(user_id, domain, experience_level, status, current_step);

-- Keep the existing assessment lifecycle values used by the pre-adaptive flow.
-- ACTIVE/COMPLETED are represented by IN_PROGRESS/SUBMITTED in PATIMA.
-- EXPIRED is already supported by migration 034.
