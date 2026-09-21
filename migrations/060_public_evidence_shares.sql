-- PATIMA public evidence inspection links
-- Randomized share tokens provide an unguessable public URL while the
-- candidate's visibility setting remains the authoritative revocation switch.

CREATE TABLE IF NOT EXISTS public_evidence_shares (
  token TEXT PRIMARY KEY,
  evidence_id UUID NOT NULL UNIQUE REFERENCES evidence_records(id) ON DELETE CASCADE,
  candidate_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  capability_slug TEXT NOT NULL,
  capability_name TEXT NOT NULL,
  state TEXT NOT NULL,
  verification_tier TEXT NOT NULL,
  summary TEXT NOT NULL,
  context TEXT,
  artifact_code TEXT,
  test_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  artifact_sha256 TEXT,
  merkle_root TEXT,
  attestation_signature TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_public_evidence_shares_candidate
  ON public_evidence_shares(candidate_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_evidence_shares_active_token
  ON public_evidence_shares(token)
  WHERE revoked_at IS NULL;

ALTER TABLE public_evidence_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_evidence_shares FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_public_evidence_shares_candidate ON public_evidence_shares;
CREATE POLICY p_public_evidence_shares_candidate
  ON public_evidence_shares
  FOR SELECT TO PUBLIC
  USING (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS p_public_evidence_shares_public_inspection ON public_evidence_shares;
CREATE POLICY p_public_evidence_shares_public_inspection
  ON public_evidence_shares
  FOR SELECT TO PUBLIC
  USING (
    revoked_at IS NULL
    AND token = NULLIF(current_setting('app.public_share_token', true), '')
  );

DROP POLICY IF EXISTS p_public_evidence_shares_insert_candidate ON public_evidence_shares;
CREATE POLICY p_public_evidence_shares_insert_candidate
  ON public_evidence_shares
  FOR INSERT TO PUBLIC
  WITH CHECK (
    candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS p_public_evidence_shares_update_candidate ON public_evidence_shares;
CREATE POLICY p_public_evidence_shares_update_candidate
  ON public_evidence_shares
  FOR UPDATE TO PUBLIC
  USING (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (candidate_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- The public inspection endpoint reads only the share snapshot. It never
-- reads candidate accounts, sessions, or evidence_records anonymously.
GRANT SELECT ON public_evidence_shares TO CURRENT_USER;
GRANT INSERT, UPDATE ON public_evidence_shares TO CURRENT_USER;

CREATE OR REPLACE FUNCTION sync_public_evidence_shares_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.visibility = 'PUBLIC' THEN
    UPDATE public_evidence_shares
       SET revoked_at = NULL
     WHERE candidate_user_id = NEW.user_id;
  ELSE
    UPDATE public_evidence_shares
       SET revoked_at = clock_timestamp()
     WHERE candidate_user_id = NEW.user_id
       AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_evidence_shares_visibility ON candidate_visibility_settings;
CREATE TRIGGER trg_sync_public_evidence_shares_visibility
AFTER INSERT OR UPDATE OF visibility ON candidate_visibility_settings
FOR EACH ROW
EXECUTE FUNCTION sync_public_evidence_shares_visibility();
