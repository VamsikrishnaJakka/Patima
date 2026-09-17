-- Candidate profile and privacy persistence.
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS verification_tier TEXT NOT NULL DEFAULT 'PROVISIONAL_EMAIL';

DO $$
BEGIN
  ALTER TABLE user_accounts
    ADD CONSTRAINT user_accounts_verification_tier_check
    CHECK (verification_tier IN ('PROVISIONAL_EMAIL','IDENTITY_VERIFIED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE candidate_visibility_settings
  ADD COLUMN IF NOT EXISTS peer_visibility BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE user_accounts
SET verification_tier='PROVISIONAL_EMAIL'
WHERE verification_tier IS NULL OR verification_tier='';

-- Every candidate gets a private visibility row at account creation. This keeps
-- first-use behavior deterministic without requiring the application to guess
-- whether a row is missing.
INSERT INTO candidate_visibility_settings (user_id, visibility, accepting_contact_requests, peer_visibility)
SELECT u.id, 'PRIVATE', TRUE, FALSE
FROM user_accounts u
WHERE u.role='candidate'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION ensure_candidate_visibility_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role='candidate' THEN
    INSERT INTO candidate_visibility_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_visibility_defaults ON user_accounts;
CREATE TRIGGER trg_candidate_visibility_defaults
AFTER INSERT ON user_accounts
FOR EACH ROW
EXECUTE FUNCTION ensure_candidate_visibility_settings();

-- Candidate-owned privacy state remains protected by the existing self-only RLS
-- policy on candidate_visibility_settings. No peer-facing access is granted by
-- this migration; peer_visibility is an explicit persisted audience preference
-- for future community/review authorization checks.
