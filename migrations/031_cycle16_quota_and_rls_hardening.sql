-- PATIMA Cycle 16 post-030 hardening.
-- Keep this as a new migration so already-applied 030 databases receive the fixes deterministically.

-- 1. Database-level rolling contact quota is serialized per employer account.
-- hashtextextended gives a deterministic 64-bit advisory lock key without
-- relying on application-controlled identifiers or a shared global lock.
CREATE OR REPLACE FUNCTION enforce_weekly_contact_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employer_account_id::text, 0));

  SELECT COUNT(*)::integer
    INTO v_current_count
  FROM candidate_contact_intents c
  WHERE c.employer_account_id = NEW.employer_account_id
    AND c.created_at >= clock_timestamp() - INTERVAL '7 days';

  IF v_current_count >= 5 THEN
    RAISE EXCEPTION 'WEEKLY_CONTACT_QUOTA_EXCEEDED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_contact_quota ON candidate_contact_intents;
CREATE TRIGGER trg_weekly_contact_quota
BEFORE INSERT ON candidate_contact_intents
FOR EACH ROW
EXECUTE FUNCTION enforce_weekly_contact_quota();

-- 2. Candidate/employer authorization is candidate-controlled for writes.
-- Employers may read only authorizations belonging to their selected org.
ALTER TABLE candidate_employer_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_employer_authorizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_candidate_employer_authorizations ON candidate_employer_authorizations;
DROP POLICY IF EXISTS p_candidate_employer_authorizations_select ON candidate_employer_authorizations;
DROP POLICY IF EXISTS p_candidate_employer_authorizations_insert ON candidate_employer_authorizations;
DROP POLICY IF EXISTS p_candidate_employer_authorizations_update ON candidate_employer_authorizations;
DROP POLICY IF EXISTS p_candidate_employer_authorizations_delete ON candidate_employer_authorizations;

CREATE POLICY p_candidate_employer_authorizations_select
  ON candidate_employer_authorizations
  FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
  );

CREATE POLICY p_candidate_employer_authorizations_insert
  ON candidate_employer_authorizations
  FOR INSERT TO PUBLIC
  WITH CHECK (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY p_candidate_employer_authorizations_update
  ON candidate_employer_authorizations
  FOR UPDATE TO PUBLIC
  USING (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY p_candidate_employer_authorizations_delete
  ON candidate_employer_authorizations
  FOR DELETE TO PUBLIC
  USING (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- 3. Candidate contact requests are isolated to the selected employer org.
ALTER TABLE candidate_contact_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_contact_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_contact_intent_select ON candidate_contact_intents;
DROP POLICY IF EXISTS p_contact_intent_insert ON candidate_contact_intents;
DROP POLICY IF EXISTS p_contact_intent_update_candidate ON candidate_contact_intents;

CREATE POLICY p_contact_intent_select
  ON candidate_contact_intents
  FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
  );

CREATE POLICY p_contact_intent_insert
  ON candidate_contact_intents
  FOR INSERT TO PUBLIC
  WITH CHECK (
    requested_by_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
  );

CREATE POLICY p_contact_intent_update_candidate
  ON candidate_contact_intents
  FOR UPDATE TO PUBLIC
  USING (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- 4. Evidence access audit rows are tenant-scoped and candidate-readable.
ALTER TABLE evidence_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_access_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_access_events_visibility ON evidence_access_events;
DROP POLICY IF EXISTS p_access_events_insert_employer ON evidence_access_events;

CREATE POLICY p_access_events_visibility
  ON evidence_access_events
  FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
  );

CREATE POLICY p_access_events_insert_employer
  ON evidence_access_events
  FOR INSERT TO PUBLIC
  WITH CHECK (
    actor_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
  );

-- 5. Candidate capability discovery is also constrained to the selected org.
ALTER TABLE user_capability_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_capability_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_capability_discovery ON user_capability_states;

CREATE POLICY p_capability_discovery
  ON user_capability_states
  FOR SELECT TO PUBLIC
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM employer_members em
      JOIN candidate_visibility_settings cvs
        ON cvs.user_id = user_capability_states.user_id
      LEFT JOIN candidate_employer_authorizations cea
        ON cea.candidate_user_id = user_capability_states.user_id
       AND cea.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
       AND cea.revoked_at IS NULL
      WHERE em.user_account_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND em.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
        AND (
          cvs.visibility = 'PUBLIC'
          OR (cvs.visibility = 'APPROVED_EMPLOYERS_ONLY' AND cea.employer_account_id IS NOT NULL)
        )
        AND cvs.accepting_contact_requests = TRUE
    )
  );

-- 6. Candidate visibility lookup is tenant-scoped as well. Replace the older
-- permissive employer policy from 029; RLS policies are ORed when permissive,
-- so leaving it in place would defeat the selected-org invariant.
ALTER TABLE candidate_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_visibility_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_candidate_visibility_self ON candidate_visibility_settings;
DROP POLICY IF EXISTS p_candidate_visibility_employer ON candidate_visibility_settings;

CREATE POLICY p_candidate_visibility_self
  ON candidate_visibility_settings
  FOR ALL TO PUBLIC
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY p_candidate_visibility_employer
  ON candidate_visibility_settings
  FOR SELECT TO PUBLIC
  USING (
    visibility = 'PUBLIC'
    OR (
      visibility = 'APPROVED_EMPLOYERS_ONLY'
      AND EXISTS (
        SELECT 1
        FROM employer_members em
        JOIN candidate_employer_authorizations cea
          ON cea.employer_account_id = em.employer_account_id
         AND cea.candidate_user_id = candidate_visibility_settings.user_id
         AND cea.revoked_at IS NULL
        WHERE em.user_account_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND em.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
      )
    )
  );

-- 7. Evidence records must never cross the selected employer organization.
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_evidence_records_access ON evidence_records;

CREATE POLICY p_evidence_records_access
  ON evidence_records
  FOR SELECT TO PUBLIC
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM employer_members em
      JOIN candidate_visibility_settings cvs
        ON cvs.user_id = evidence_records.user_id
      LEFT JOIN candidate_employer_authorizations cea
        ON cea.candidate_user_id = evidence_records.user_id
       AND cea.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
       AND cea.revoked_at IS NULL
      WHERE em.user_account_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND em.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
        AND (
          cvs.visibility = 'PUBLIC'
          OR (cvs.visibility = 'APPROVED_EMPLOYERS_ONLY' AND cea.employer_account_id IS NOT NULL)
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_contact_intents_employer_created
  ON candidate_contact_intents(employer_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_authorizations_employer_candidate
  ON candidate_employer_authorizations(employer_account_id, candidate_user_id)
  WHERE revoked_at IS NULL;
