-- migrations/048_audit_event_access_hardening.sql
-- Bind employer evidence-audit writes to the same candidate visibility rules
-- that govern evidence access. This prevents forged audit entries for
-- candidates the selected employer cannot access.

DROP POLICY IF EXISTS p_access_events_insert_employer ON evidence_access_events;

CREATE POLICY p_access_events_insert_employer
  ON evidence_access_events
  FOR INSERT TO PUBLIC
  WITH CHECK (
    actor_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM employer_members em
      JOIN candidate_visibility_settings cvs
        ON cvs.user_id = evidence_access_events.candidate_user_id
      LEFT JOIN candidate_employer_authorizations cea
        ON cea.candidate_user_id = evidence_access_events.candidate_user_id
       AND cea.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
       AND cea.revoked_at IS NULL
      WHERE em.user_account_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND em.employer_account_id = NULLIF(current_setting('app.current_employer_account_id', true), '')::uuid
        AND (
          cvs.visibility = 'PUBLIC'
          OR (
            cvs.visibility = 'APPROVED_EMPLOYERS_ONLY'
            AND cea.employer_account_id IS NOT NULL
          )
        )
    )
  );
