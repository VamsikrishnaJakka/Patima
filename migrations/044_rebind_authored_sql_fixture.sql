-- migrations/044_rebind_authored_sql_fixture.sql
-- Migration 043 was already applied before the fixture binding correction.
-- Persist the executable SQL bank's authoritative fixture binding in the database.
UPDATE question_variants v
SET scenario_entity='customer_orders'
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='INTERMEDIATE'
  AND v.variant_code IN ('VAR_A','VAR_B','VAR_C');
