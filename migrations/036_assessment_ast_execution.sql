-- PATIMA AST + deterministic execution verification.
-- This migration extends the existing evidence model; it does not replace
-- the earlier assessment-session or RLS contracts.

ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS ast_fingerprint JSONB,
  ADD COLUMN IF NOT EXISTS behavioral_assertions JSONB,
  ADD COLUMN IF NOT EXISTS execution_trace_digest CHAR(64);

CREATE TABLE IF NOT EXISTS assessment_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  probe_index INTEGER NOT NULL CHECK (probe_index BETWEEN 1 AND 3),
  submitted_code TEXT NOT NULL,
  ast_tree JSONB NOT NULL,
  assertions_passed INTEGER NOT NULL CHECK (assertions_passed >= 0),
  assertions_total INTEGER NOT NULL CHECK (assertions_total >= assertions_passed),
  execution_time_ms NUMERIC(8,2) NOT NULL CHECK (execution_time_ms >= 0),
  output_hash CHAR(64) NOT NULL CHECK (output_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_assessment_execution_runs_session
  ON assessment_execution_runs(session_id, created_at DESC);

ALTER TABLE assessment_execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_execution_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_assessment_execution_runs_select ON assessment_execution_runs;
CREATE POLICY p_assessment_execution_runs_select
  ON assessment_execution_runs
  FOR SELECT TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
      FROM assessment_sessions s
      WHERE s.id = assessment_execution_runs.session_id
        AND s.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS p_assessment_execution_runs_insert ON assessment_execution_runs;
CREATE POLICY p_assessment_execution_runs_insert
  ON assessment_execution_runs
  FOR INSERT TO PUBLIC
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM assessment_sessions s
      WHERE s.id = assessment_execution_runs.session_id
        AND s.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

GRANT SELECT, INSERT ON assessment_execution_runs TO CURRENT_USER;
