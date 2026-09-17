-- PATIMA Cycle 16 hiring backend
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('candidate','employer')),
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS capability_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS capability_decay_profiles (
  capability_node_id UUID PRIMARY KEY REFERENCES capability_nodes(id) ON DELETE RESTRICT,
  half_life_days INTEGER NOT NULL DEFAULT 180 CHECK (half_life_days > 0)
);

CREATE TABLE IF NOT EXISTS user_capability_states (
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  capability_node_id UUID NOT NULL REFERENCES capability_nodes(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('NOT_EVALUATED','INTRODUCED','ASSISTED','DEVELOPING','DEMONSTRATED','PROVISIONAL')),
  last_demonstrated_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  PRIMARY KEY (user_id, capability_node_id)
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  capability_node_id UUID NOT NULL REFERENCES capability_nodes(id) ON DELETE RESTRICT,
  verification_tier TEXT NOT NULL CHECK (verification_tier IN ('CLIENT_EVALUATED','PEER_ATTESTED','PLATFORM_ATTESTED','SANDBOX_REPRODUCED','CRYPTOGRAPHICALLY_SIGNED')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  summary TEXT NOT NULL,
  context TEXT,
  artifact_code TEXT,
  test_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  peer_review_summary TEXT,
  artifact_sha256 TEXT,
  merkle_root TEXT,
  attestation_signature TEXT
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON app_sessions(token_hash);

CREATE TABLE IF NOT EXISTS employer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name VARCHAR(200) NOT NULL,
  domain_verification_token CHAR(64),
  identity_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS employer_members (
  employer_account_id UUID NOT NULL REFERENCES employer_accounts(id) ON DELETE RESTRICT,
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  role VARCHAR(32) NOT NULL DEFAULT 'RECRUITER' CHECK (role IN ('OWNER','HIRING_MANAGER','TECHNICAL_REVIEWER','RECRUITER','ADMIN')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (employer_account_id, user_account_id)
);

DO $$ BEGIN
  CREATE TYPE candidate_visibility_enum AS ENUM ('PRIVATE','APPROVED_EMPLOYERS_ONLY','PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS candidate_visibility_settings (
  user_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE RESTRICT,
  visibility candidate_visibility_enum NOT NULL DEFAULT 'PRIVATE',
  accepting_contact_requests BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS candidate_employer_authorizations (
  candidate_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  employer_account_id UUID NOT NULL REFERENCES employer_accounts(id) ON DELETE RESTRICT,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (candidate_user_id, employer_account_id)
);

DO $$ BEGIN
  CREATE TYPE contact_intent_status_enum AS ENUM ('PENDING_CANDIDATE_APPROVAL','ACCEPTED','DECLINED','BLOCKED','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS candidate_contact_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_account_id UUID NOT NULL REFERENCES employer_accounts(id) ON DELETE RESTRICT,
  candidate_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  requested_by_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  role_title VARCHAR(128) NOT NULL,
  message_body TEXT NOT NULL,
  status contact_intent_status_enum NOT NULL DEFAULT 'PENDING_CANDIDATE_APPROVAL',
  released_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '7 days'),
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_employer_candidate_role
  ON candidate_contact_intents (employer_account_id, candidate_user_id, lower(role_title))
  WHERE status IN ('PENDING_CANDIDATE_APPROVAL','ACCEPTED');
CREATE INDEX IF NOT EXISTS idx_contact_intents_candidate ON candidate_contact_intents(candidate_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_intents_employer ON candidate_contact_intents(employer_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_account_id UUID NOT NULL REFERENCES employer_accounts(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  candidate_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  capability_node_id UUID REFERENCES capability_nodes(id) ON DELETE RESTRICT,
  disclosure_level VARCHAR(32) NOT NULL CHECK (disclosure_level IN ('LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE','LEVEL_4_INTEGRITY')),
  ip_address INET,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_evidence_access_candidate ON evidence_access_events(candidate_user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ucs_composite_match
  ON user_capability_states(capability_node_id, state, last_demonstrated_at)
  INCLUDE (user_id, evidence_count);

-- RLS is forced so the application DB role cannot bypass policies merely by owning tables.
ALTER TABLE candidate_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_visibility_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_candidate_visibility_self ON candidate_visibility_settings;
CREATE POLICY p_candidate_visibility_self ON candidate_visibility_settings
  FOR ALL TO PUBLIC
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE candidate_contact_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_contact_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_contact_intent_select ON candidate_contact_intents;
CREATE POLICY p_contact_intent_select ON candidate_contact_intents FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = current_setting('app.current_user_id', true)::uuid
    OR employer_account_id IN (
      SELECT employer_account_id FROM employer_members
      WHERE user_account_id = current_setting('app.current_user_id', true)::uuid
    )
  );
DROP POLICY IF EXISTS p_contact_intent_insert ON candidate_contact_intents;
CREATE POLICY p_contact_intent_insert ON candidate_contact_intents FOR INSERT TO PUBLIC
  WITH CHECK (
    requested_by_user_id = current_setting('app.current_user_id', true)::uuid
    AND employer_account_id IN (
      SELECT employer_account_id FROM employer_members
      WHERE user_account_id = current_setting('app.current_user_id', true)::uuid
    )
  );
DROP POLICY IF EXISTS p_contact_intent_update_candidate ON candidate_contact_intents;
CREATE POLICY p_contact_intent_update_candidate ON candidate_contact_intents FOR UPDATE TO PUBLIC
  USING (candidate_user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (candidate_user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE evidence_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_access_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_access_events_visibility ON evidence_access_events;
CREATE POLICY p_access_events_visibility ON evidence_access_events FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = current_setting('app.current_user_id', true)::uuid
    OR employer_account_id IN (
      SELECT employer_account_id FROM employer_members
      WHERE user_account_id = current_setting('app.current_user_id', true)::uuid
    )
  );
CREATE POLICY p_access_events_insert_employer ON evidence_access_events FOR INSERT TO PUBLIC
  WITH CHECK (
    actor_user_id = current_setting('app.current_user_id', true)::uuid
    AND employer_account_id IN (
      SELECT employer_account_id FROM employer_members
      WHERE user_account_id = current_setting('app.current_user_id', true)::uuid
    )
  );

ALTER TABLE user_capability_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_capability_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_capability_discovery ON user_capability_states;
CREATE POLICY p_capability_discovery ON user_capability_states FOR SELECT TO PUBLIC
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM user_accounts actor
      JOIN employer_members em ON em.user_account_id = actor.id
      JOIN candidate_visibility_settings cvs ON cvs.user_id = user_capability_states.user_id
      LEFT JOIN candidate_employer_authorizations cea
        ON cea.candidate_user_id = user_capability_states.user_id
       AND cea.employer_account_id = em.employer_account_id
       AND cea.revoked_at IS NULL
      WHERE actor.id = current_setting('app.current_user_id', true)::uuid
        AND actor.role = 'employer'
        AND (cvs.visibility = 'PUBLIC' OR (cvs.visibility = 'APPROVED_EMPLOYERS_ONLY' AND cea.employer_account_id IS NOT NULL))
        AND cvs.accepting_contact_requests = TRUE
    )
  );

-- Keep employer API from reading candidate credentials through direct SQL paths.
REVOKE ALL ON app_sessions FROM PUBLIC;
REVOKE ALL ON user_accounts FROM PUBLIC;
REVOKE ALL ON evidence_records FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON app_sessions TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE ON user_accounts TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE ON employer_accounts, employer_members, capability_nodes, capability_decay_profiles, user_capability_states, evidence_records, candidate_visibility_settings, candidate_employer_authorizations, candidate_contact_intents, evidence_access_events TO CURRENT_USER;
