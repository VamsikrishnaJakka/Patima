-- 042_authentic_verification_contract.sql
-- Adds the evidence-bearing question contract and verification telemetry.
-- Never treat lexical heuristics as verification.

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
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS verification_output JSONB,
  ADD COLUMN IF NOT EXISTS candidate_solution TEXT;

ALTER TABLE assessment_adaptive_logs
  DROP CONSTRAINT IF EXISTS assessment_adaptive_logs_verification_status_check;

ALTER TABLE assessment_adaptive_logs
  ADD CONSTRAINT assessment_adaptive_logs_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('NOT_RUN','FAILED','PASSED','UNAVAILABLE','ERROR'));

CREATE INDEX IF NOT EXISTS idx_assessment_adaptive_logs_verification
  ON assessment_adaptive_logs(session_id, step_index, verification_status);

-- Replace the structural placeholder SQL prompts with concrete, domain-specific
-- authored prompts for the currently seeded inventory. Variants remain distinct
-- through family/concept/difficulty selection; this migration only establishes
-- the domain contract and representative executable tasks.
UPDATE question_variants v
SET question_type='CODING',
    starter_code=CASE
      WHEN f.domain='python-concurrency' THEN 'from threading import Lock\n\nclass Counter:\n    def __init__(self):\n        self.value = 0\n        self.lock = Lock()\n\n    def increment(self):\n        # TODO: make this safe for concurrent callers\n        self.value += 1\n'
      WHEN f.domain='java.concurrency_memory' THEN 'import java.util.concurrent.atomic.AtomicInteger;\n\nclass Counter {\n    private final AtomicInteger value = new AtomicInteger();\n\n    void increment() {\n        // TODO\n    }\n\n    int get() { return value.get(); }\n}\n'
      WHEN f.domain='linux.process_signals' THEN '#!/bin/sh\n# Write a POSIX shell solution for the task.\n'
      WHEN f.domain='docker.container_internals' THEN 'FROM alpine:3.20\n# TODO: complete the image for the requested behavior\n'
      ELSE NULL
    END,
    public_tests=CASE
      WHEN f.domain='python-concurrency' THEN jsonb_build_array(jsonb_build_object('name','basic_counter','input','10 threads x 100 increments','expected','1000'))
      WHEN f.domain='java.concurrency_memory' THEN jsonb_build_array(jsonb_build_object('name','basic_counter','input','10 threads x 100 increments','expected','1000'))
      WHEN f.domain='linux.process_signals' THEN jsonb_build_array(jsonb_build_object('name','script_exit','input','normal execution','expected','exit 0'))
      WHEN f.domain='docker.container_internals' THEN jsonb_build_array(jsonb_build_object('name','image_builds','input','docker build','expected','success'))
      ELSE '[]'::jsonb
    END,
    hidden_tests=CASE
      WHEN f.domain='python-concurrency' THEN jsonb_build_array(jsonb_build_object('name','concurrent_stress','input','32 threads x 1000 increments','expected','32000'))
      WHEN f.domain='java.concurrency_memory' THEN jsonb_build_array(jsonb_build_object('name','concurrent_stress','input','32 threads x 1000 increments','expected','32000'))
      WHEN f.domain='linux.process_signals' THEN jsonb_build_array(jsonb_build_object('name','signal_boundary','input','SIGTERM while child is active','expected','child cleanup and deterministic exit'))
      WHEN f.domain='docker.container_internals' THEN jsonb_build_array(jsonb_build_object('name','runtime_boundary','input','network disabled container run','expected','deterministic exit'))
      ELSE '[]'::jsonb
    END,
    expected_time_complexity=CASE WHEN f.domain IN ('python-concurrency','java.concurrency_memory') THEN 'O(1) per increment' ELSE NULL END,
    expected_space_complexity=CASE WHEN f.domain IN ('python-concurrency','java.concurrency_memory') THEN 'O(1)' ELSE NULL END,
    reference_explanation='Verification is based on executable behavior and explicit test assertions, not keyword presence.',
    concept_rubric=jsonb_build_object('concept',f.concept_tag,'domain',f.domain),
    hidden_assertions=jsonb_build_object('domain',f.domain,'concept',f.concept_tag,'question_type','CODING')
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain IN ('python-concurrency','java.concurrency_memory','linux.process_signals','docker.container_internals');

-- SQL stays executable and receives its fixture from fixture_ddl.
UPDATE question_variants v
SET question_type='CODING',
    reference_explanation='The candidate query is executed against the exact customer_orders fixture and checked against deterministic assertions.',
    concept_rubric=jsonb_build_object('concept',f.concept_tag,'domain',f.domain),
    public_tests=jsonb_build_array(jsonb_build_object('name','returns_rows','expected','8 rows')),
    hidden_tests=jsonb_build_array(jsonb_build_object('name','deterministic_ordering','expected','customer_id, order_date, order_id'))
FROM question_families f
WHERE f.id=v.family_id AND f.domain='sql-window-functions';
