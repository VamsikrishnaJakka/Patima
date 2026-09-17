-- PATIMA Cycle 16 schema alignment.
-- Idempotent and compatible with migrations/028_enterprise_hiring.sql.

ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_user_accounts_status ON user_accounts(status);

ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry ON app_sessions(expires_at);

-- Employers may discover only visibility that is public, or explicitly authorized for that employer.
ALTER TABLE candidate_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_visibility_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_candidate_visibility_employer ON candidate_visibility_settings;
CREATE POLICY p_candidate_visibility_employer ON candidate_visibility_settings
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
        WHERE em.user_account_id = current_setting('app.current_user_id', true)::uuid
      )
    )
  );

-- The application's canonical user table has no soft-delete dependency in Cycle 16;
-- session resolution must therefore fail closed on an explicit inactive status.
UPDATE user_accounts SET status = 'ACTIVE' WHERE status IS NULL;

-- Duplicate/expired requests remain historical; only pending/accepted rows are unique per role.
DROP INDEX IF EXISTS uq_active_employer_candidate_role;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_employer_candidate_role
  ON candidate_contact_intents (employer_account_id, candidate_user_id, lower(role_title))
  WHERE status IN ('PENDING_CANDIDATE_APPROVAL','ACCEPTED');

-- RLS policies on protected tables are intentionally preserved and extended rather than replaced wholesale.
