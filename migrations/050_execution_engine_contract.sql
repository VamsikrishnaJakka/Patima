-- PATIMA execution engine v1 contract.
-- These fields describe authored performance and adversarial evidence. They do not
-- make self-reported complexity authoritative; the server must execute benchmarks.

ALTER TABLE question_variants
  ADD COLUMN IF NOT EXISTS scaling_benchmarks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS adversarial_generators JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE question_variants
  DROP CONSTRAINT IF EXISTS question_variants_scaling_benchmarks_array_check;

ALTER TABLE question_variants
  ADD CONSTRAINT question_variants_scaling_benchmarks_array_check
  CHECK (jsonb_typeof(scaling_benchmarks)='array');

ALTER TABLE question_variants
  DROP CONSTRAINT IF EXISTS question_variants_adversarial_generators_array_check;

ALTER TABLE question_variants
  ADD CONSTRAINT question_variants_adversarial_generators_array_check
  CHECK (jsonb_typeof(adversarial_generators)='array');

COMMENT ON COLUMN question_variants.scaling_benchmarks IS
  'Authored N/time budgets used by the isolated execution harness for empirical complexity evidence.';

COMMENT ON COLUMN question_variants.adversarial_generators IS
  'Server-only generator definitions for boundary/pathological test data. Never expose hidden generator parameters to candidates.';
