-- Restrict executable SQL verification to the explicitly authored
-- INTERMEDIATE window-function bank (043).
-- Migration 051 authored a separate BEGINNER SQL execution bank, but the
-- assessment integrity contract intentionally permits only the 30 variants
-- from SQL_INTERMEDIATE_F01..F10 (VAR_A/VAR_B/VAR_C) to execute.
-- Keep the beginner inventory available as THEORY until it has an explicit
-- executable authorization contract.

UPDATE question_variants v
SET
  question_type='THEORY',
  starter_code=NULL,
  scenario_entity=NULL,
  expected_time_complexity=NULL,
  expected_space_complexity=NULL,
  reference_explanation=NULL,
  concept_rubric='{}'::jsonb,
  public_tests='[]'::jsonb,
  hidden_tests='[]'::jsonb
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code IN ('VAR_A','VAR_B','VAR_C')
  AND f.concept_tag IN (
    'filtering_and_predicates',
    'aggregation',
    'ordering_and_ranking',
    'data_correctness',
    'edge_cases'
  );
