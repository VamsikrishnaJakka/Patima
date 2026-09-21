-- 057: Real hackathon scheduling, parity and bilateral consent.
CREATE TABLE IF NOT EXISTS hackathon_arenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  domain VARCHAR(64) NOT NULL,
  experience_level VARCHAR(32) NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT '1V1' CHECK (mode IN ('1V1','TEAM')),
  scheduled_start TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 1440),
  arena_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','AGREED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS hackathon_participants (
  arena_id UUID NOT NULL REFERENCES hackathon_arenas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  declared_language VARCHAR(32) NOT NULL,
  verified_capability_level NUMERIC(5,2),
  agreed_terms BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_at TIMESTAMPTZ,
  PRIMARY KEY (arena_id,user_id)
);
CREATE TABLE IF NOT EXISTS hackathon_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id UUID NOT NULL REFERENCES hackathon_arenas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  artifact_code TEXT NOT NULL,
  execution_digest TEXT NOT NULL,
  tests_passed INT NOT NULL CHECK (tests_passed>=0),
  tests_total INT NOT NULL CHECK (tests_total>=tests_passed),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_hackathon_participants_user ON hackathon_participants(user_id,arena_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_arenas_schedule ON hackathon_arenas(scheduled_start,status);

ALTER TABLE hackathon_arenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathon_arenas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_hackathon_arenas_access ON hackathon_arenas;
CREATE POLICY p_hackathon_arenas_access ON hackathon_arenas FOR SELECT TO PUBLIC USING (
  created_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  OR EXISTS (SELECT 1 FROM hackathon_participants p WHERE p.arena_id=hackathon_arenas.id AND p.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid)
);
DROP POLICY IF EXISTS p_hackathon_arenas_insert ON hackathon_arenas;
CREATE POLICY p_hackathon_arenas_insert ON hackathon_arenas FOR INSERT TO PUBLIC WITH CHECK (created_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid);

ALTER TABLE hackathon_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathon_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_hackathon_participants_access ON hackathon_participants;
CREATE POLICY p_hackathon_participants_access ON hackathon_participants FOR SELECT TO PUBLIC USING (
  user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  OR EXISTS (SELECT 1 FROM hackathon_arenas a WHERE a.id=hackathon_participants.arena_id AND a.created_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid)
);
DROP POLICY IF EXISTS p_hackathon_participants_insert ON hackathon_participants;
CREATE POLICY p_hackathon_participants_insert ON hackathon_participants FOR INSERT TO PUBLIC WITH CHECK (
  EXISTS (SELECT 1 FROM hackathon_arenas a WHERE a.id=hackathon_participants.arena_id AND a.created_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid)
  OR user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
);

ALTER TABLE hackathon_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathon_contributions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_hackathon_contributions_access ON hackathon_contributions;
CREATE POLICY p_hackathon_contributions_access ON hackathon_contributions FOR SELECT TO PUBLIC USING (
  user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  OR EXISTS (SELECT 1 FROM hackathon_participants p WHERE p.arena_id=hackathon_contributions.arena_id AND p.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid)
);
DROP POLICY IF EXISTS p_hackathon_contributions_insert ON hackathon_contributions;
CREATE POLICY p_hackathon_contributions_insert ON hackathon_contributions FOR INSERT TO PUBLIC WITH CHECK (
  user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  AND EXISTS (SELECT 1 FROM hackathon_participants p WHERE p.arena_id=hackathon_contributions.arena_id AND p.user_id=p.user_id)
);
GRANT SELECT,INSERT,UPDATE ON hackathon_arenas,hackathon_participants,hackathon_contributions TO CURRENT_USER;
