-- 042_authentic_verification_contract.sql
-- Evidence-bearing question contract and verification telemetry.
-- This migration intentionally does NOT seed fake tests or heuristic prompts.
-- Authored executable tests must be added per variant by the question bank.

ALTER TABLE question_variants
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'THEORY',
  ADD COLUMN IF NOT EXISTS starter_code TEXT,
  ADD COLUMN IF NOT EXISTS public_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hidden_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_solution TEXT,
  ADD COLUMN IF NOT EXISTS reference_explanation TEXT,
  ADD COLUMN IF NOT EXISTS expected_time_complexity TEXT,
  ADD COLUMN IF NOT EXISTS expected_space_complexity TEXT,
  ADD COLUMN IF NOT EXISTS concept_rubric JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE question_variants
  DROP CONSTRAINT IF EXISTS question_variants_question_type_check;

ALTER TABLE question_variants
  ADD CONSTRAINT question_variants_question_type_check
  CHECK (question_type IN ('CODING','THEORY','DEBUGGING','OUTPUT_PREDICTION','OPTIMIZATION','SCENARIO'));

ALTER TABLE assessment_adaptive_logs
  ADD COLUMN IF NOT EXISTS question_type TEXT,
  ADD COLUMN IF NOT EXISTS public_tests_passed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_tests_total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden_tests_passed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden_tests_total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS execution_time_ms NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS peak_memory_kb BIGINT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS verification_output JSONB,
  ADD COLUMN IF NOT EXISTS candidate_solution TEXT,
  ADD COLUMN IF NOT EXISTS execution_digest TEXT;

ALTER TABLE assessment_adaptive_logs
  DROP CONSTRAINT IF EXISTS assessment_adaptive_logs_verification_status_check;

ALTER TABLE assessment_adaptive_logs
  ADD CONSTRAINT assessment_adaptive_logs_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('NOT_RUN','FAILED','PASSED','UNAVAILABLE','ERROR'));

CREATE INDEX IF NOT EXISTS idx_assessment_adaptive_logs_verification
  ON assessment_adaptive_logs(session_id, step_index, verification_status);
