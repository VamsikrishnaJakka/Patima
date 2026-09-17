-- PATIMA adaptive assessment sessions
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  target_role VARCHAR(96) NOT NULL,
  seniority VARCHAR(16) NOT NULL CHECK (seniority IN ('JUNIOR','MID','SENIOR')),
  domain_slug VARCHAR(96) NOT NULL,
  capability_node_id UUID NOT NULL REFERENCES capability_nodes(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','SUBMITTED','VERIFIED')),
  current_probe SMALLINT NOT NULL DEFAULT 1 CHECK (current_probe BETWEEN 1 AND 3),
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  workspace_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome VARCHAR(32) CHECK (outcome IN ('DEMONSTRATED','DEVELOPING','PROVISIONAL')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user ON assessment_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_capability ON assessment_sessions(capability_node_id, created_at DESC);

ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_assessment_sessions_candidate ON assessment_sessions;
CREATE POLICY p_assessment_sessions_candidate ON assessment_sessions FOR ALL TO PUBLIC
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON assessment_sessions TO CURRENT_USER;

INSERT INTO capability_nodes(slug,name)
VALUES
  ('java.concurrency_memory','Java Concurrency & Memory Model'),
  ('linux.process_signals','Linux Systems & Signals'),
  ('docker.container_internals','Docker & Container Mechanics')
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO capability_decay_profiles(capability_node_id,half_life_days)
SELECT id,180 FROM capability_nodes
WHERE slug IN ('java.concurrency_memory','linux.process_signals','docker.container_internals')
ON CONFLICT(capability_node_id) DO NOTHING;
