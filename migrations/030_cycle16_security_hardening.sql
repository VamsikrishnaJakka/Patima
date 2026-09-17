-- PATIMA Cycle 16 final security hardening.
-- Organization context is explicit in the application session and mirrored into the transaction setting.

ALTER TABLE candidate_employer_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_employer_authorizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_candidate_employer_authorizations ON candidate_employer_authorizations;
CREATE POLICY p_candidate_employer_authorizations ON candidate_employer_authorizations FOR ALL TO PUBLIC
  USING (
    candidate_user_id = current_setting('app.current_user_id', true)::uuid
    OR employer_account_id = current_setting('app.current_employer_account_id', true)::uuid
  )
  WITH CHECK (
    candidate_user_id = current_setting('app.current_user_id', true)::uuid
    OR employer_account_id = current_setting('app.current_employer_account_id', true)::uuid
  );

ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_evidence_records_access ON evidence_records;
CREATE POLICY p_evidence_records_access ON evidence_records FOR SELECT TO PUBLIC
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM employer_members em
      JOIN candidate_visibility_settings cvs ON cvs.user_id = evidence_records.user_id
      LEFT JOIN candidate_employer_authorizations cea
        ON cea.candidate_user_id = evidence_records.user_id
       AND cea.employer_account_id = em.employer_account_id
       AND cea.revoked_at IS NULL
      WHERE em.user_account_id = current_setting('app.current_user_id', true)::uuid
        AND (
          cvs.visibility = 'PUBLIC'
          OR (cvs.visibility = 'APPROVED_EMPLOYERS_ONLY' AND cea.employer_account_id IS NOT NULL)
        )
    )
  );

-- Candidate contact quota is a database invariant, not merely an API convention.
CREATE OR REPLACE FUNCTION enforce_weekly_contact_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM candidate_contact_intents c
    WHERE c.employer_account_id = NEW.employer_account_id
      AND c.created_at >= clock_timestamp() - INTERVAL '7 days'
  ) >= 5 THEN
    RAISE EXCEPTION 'WEEKLY_CONTACT_QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_weekly_contact_quota ON candidate_contact_intents;
CREATE TRIGGER trg_weekly_contact_quota
BEFORE INSERT ON candidate_contact_intents
FOR EACH ROW EXECUTE FUNCTION enforce_weekly_contact_quota();

CREATE INDEX IF NOT EXISTS idx_evidence_records_user_capability_recorded
  ON evidence_records(user_id, capability_node_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_authorizations_employer_candidate
  ON candidate_employer_authorizations(employer_account_id, candidate_user_id)
  WHERE revoked_at IS NULL;
