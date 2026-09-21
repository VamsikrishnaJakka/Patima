-- Assessment context must reflect only what the candidate explicitly supplied.
-- Difficulty/experience level is not an employment seniority declaration.

ALTER TABLE assessment_sessions
  ALTER COLUMN target_role DROP NOT NULL,
  ALTER COLUMN seniority DROP NOT NULL;

ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS target_role_source VARCHAR(24) NOT NULL DEFAULT 'SYSTEM_INFERRED',
  ADD COLUMN IF NOT EXISTS seniority_source VARCHAR(24) NOT NULL DEFAULT 'SYSTEM_INFERRED';

ALTER TABLE assessment_sessions
  DROP CONSTRAINT IF EXISTS assessment_sessions_target_role_source_check,
  DROP CONSTRAINT IF EXISTS assessment_sessions_seniority_source_check;

ALTER TABLE assessment_sessions
  ADD CONSTRAINT assessment_sessions_target_role_source_check
    CHECK (target_role_source IN ('USER_PROVIDED','SYSTEM_INFERRED')),
  ADD CONSTRAINT assessment_sessions_seniority_source_check
    CHECK (seniority_source IN ('USER_PROVIDED','SYSTEM_INFERRED'));

-- Existing sessions were created by the old server-side inference.
-- Keep their historical values for auditability, but mark them as inferred so
-- presentation layers never mistake them for candidate-provided context.
UPDATE assessment_sessions
SET target_role_source='SYSTEM_INFERRED',
    seniority_source='SYSTEM_INFERRED'
WHERE target_role_source IS NULL
   OR seniority_source IS NULL;
