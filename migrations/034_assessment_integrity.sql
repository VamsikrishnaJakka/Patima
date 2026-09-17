-- PATIMA assessment integrity hardening.
-- Link each generated evidence record to the exact assessment session and
-- make session RLS fail closed when no authenticated UUID context is present.

ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE assessment_sessions
SET expires_at=created_at+INTERVAL '30 minutes'
WHERE expires_at IS NULL;

UPDATE assessment_sessions
SET last_activity_at=COALESCE(last_activity_at,updated_at,created_at)
WHERE last_activity_at IS NULL;

ALTER TABLE assessment_sessions
  ALTER COLUMN expires_at SET DEFAULT (clock_timestamp()+INTERVAL '30 minutes'),
  ALTER COLUMN last_activity_at SET DEFAULT clock_timestamp();

ALTER TABLE assessment_sessions
  DROP CONSTRAINT IF EXISTS assessment_sessions_status_check;
ALTER TABLE assessment_sessions
  ADD CONSTRAINT assessment_sessions_status_check
  CHECK (status IN ('IN_PROGRESS','SUBMITTED','VERIFIED','EXPIRED'));

ALTER TABLE assessment_sessions
  DROP POLICY IF EXISTS p_assessment_sessions_candidate;
DROP POLICY IF EXISTS p_assessment_sessions_candidate ON assessment_sessions;
CREATE POLICY p_assessment_sessions_candidate ON assessment_sessions FOR ALL TO PUBLIC
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS assessment_session_id UUID
    REFERENCES assessment_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_records_assessment_session
  ON evidence_records(assessment_session_id)
  WHERE assessment_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_active_user
  ON assessment_sessions(user_id, created_at DESC)
  WHERE status='IN_PROGRESS';
