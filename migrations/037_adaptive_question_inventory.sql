-- migrations/037_adaptive_question_inventory.sql

-- 1. Upgrade assessment_sessions to track adaptive state authoritatively
ALTER TABLE assessment_sessions 
  ADD COLUMN IF NOT EXISTS domain VARCHAR(64) NOT NULL DEFAULT 'sql',
  ADD COLUMN IF NOT EXISTS experience_level VARCHAR(32) NOT NULL DEFAULT 'INTERMEDIATE',
  ADD COLUMN IF NOT EXISTS current_step INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS final_theta NUMERIC(3, 1);

-- 2. Configuration per Domain & Experience Level
CREATE TABLE IF NOT EXISTS assessment_level_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(64) NOT NULL,
  experience_level VARCHAR(32) NOT NULL,
  total_questions INT NOT NULL DEFAULT 15,
  duration_minutes INT NOT NULL DEFAULT 25,
  min_difficulty NUMERIC(3, 1) NOT NULL,
  max_difficulty NUMERIC(3, 1) NOT NULL,
  starting_difficulty NUMERIC(3, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(domain, experience_level)
);

-- 3. Question Families (Problem Concepts / Capabilities)
CREATE TABLE IF NOT EXISTS question_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(64) NOT NULL,
  family_code VARCHAR(64) UNIQUE NOT NULL,
  concept_tag VARCHAR(64) NOT NULL,
  description TEXT NOT NULL
);

-- 4. Question Variants (Concrete Instances with DDL & Hidden Assertions)
CREATE TABLE IF NOT EXISTS question_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES question_families(id) ON DELETE CASCADE,
  variant_code VARCHAR(32) NOT NULL,
  fingerprint CHAR(64) UNIQUE NOT NULL,
  difficulty_score NUMERIC(3, 1) NOT NULL,
  experience_level VARCHAR(32) NOT NULL,
  expected_time_seconds INT NOT NULL DEFAULT 120,
  prompt_markdown TEXT NOT NULL,
  scenario_entity VARCHAR(64) NOT NULL,
  fixture_ddl TEXT NOT NULL,
  hidden_assertions JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  exposure_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(family_id, variant_code)
);

CREATE INDEX IF NOT EXISTS idx_variants_domain_level_diff 
  ON question_variants(experience_level, difficulty_score, is_active);

-- 5. Active Question Reservations (Session-Bound Leases)
CREATE TABLE IF NOT EXISTS active_question_reservations (
  variant_id UUID PRIMARY KEY REFERENCES question_variants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_res_expiry 
  ON active_question_reservations(expires_at);

-- 6. Adaptive Session Progression Log
CREATE TABLE IF NOT EXISTS assessment_adaptive_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  variant_id UUID NOT NULL REFERENCES question_variants(id),
  family_id UUID NOT NULL REFERENCES question_families(id),
  difficulty_presented NUMERIC(3, 1) NOT NULL,
  candidate_response TEXT,
  is_correct BOOLEAN,
  time_taken_seconds INT,
  computed_theta_next NUMERIC(3, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(session_id, step_index)
);

