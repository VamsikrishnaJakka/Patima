-- Assessment evidence and capability state are candidate-owned writes.
-- Discovery remains separately governed by the existing employer SELECT policy.

DROP POLICY IF EXISTS p_evidence_records_candidate_insert ON evidence_records;
CREATE POLICY p_evidence_records_candidate_insert
  ON evidence_records
  FOR INSERT TO PUBLIC
  WITH CHECK (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND assessment_session_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM assessment_sessions a
      WHERE a.id = evidence_records.assessment_session_id
        AND a.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS p_capability_states_candidate_write ON user_capability_states;
CREATE POLICY p_capability_states_candidate_write
  ON user_capability_states
  FOR INSERT TO PUBLIC
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY p_capability_states_candidate_update
  ON user_capability_states
  FOR UPDATE TO PUBLIC
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
