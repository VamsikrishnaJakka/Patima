-- migrations/045_fix_authored_sql_expected_suites.sql
-- The authored variants must use a single coherent executable problem contract.
-- Replace the previously seeded broad hidden expectations with hidden variants
-- that are semantically equivalent to the public task for each concept.

UPDATE question_variants v
SET hidden_tests =
  CASE f.concept_tag
    WHEN 'core_concepts' THEN jsonb_build_array(
      jsonb_build_object('name','hidden customer total','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'joins_and_relationships' THEN jsonb_build_array(
      jsonb_build_object('name','hidden customer metrics','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'filtering_and_predicates' THEN jsonb_build_array(
      jsonb_build_object('name','hidden paid running total','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS paid_running_total FROM customer_orders WHERE status=''PAID'' ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'aggregation' THEN jsonb_build_array(
      jsonb_build_object('name','hidden window aggregates','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total, AVG(amount) OVER (PARTITION BY customer_id) AS customer_avg, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'ordering_and_ranking' THEN jsonb_build_array(
      jsonb_build_object('name','hidden rank ties','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount, RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC, order_id ASC) AS amount_rank FROM customer_orders ORDER BY customer_id, amount DESC, order_id','order_sensitive',true)
    )
    WHEN 'partitioning' THEN jsonb_build_array(
      jsonb_build_object('name','hidden running amount','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'state_transitions' THEN jsonb_build_array(
      jsonb_build_object('name','hidden previous status','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, status, LAG(status) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS previous_status FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'edge_cases' THEN jsonb_build_array(
      jsonb_build_object('name','hidden deterministic running total','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'null_and_missing_values' THEN jsonb_build_array(
      jsonb_build_object('name','hidden previous amount','fixture_ddl',v.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, LAG(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS previous_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    ELSE v.hidden_tests
  END
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='INTERMEDIATE'
  AND v.variant_code IN ('VAR_A','VAR_B','VAR_C')
  AND regexp_replace(f.family_code,'^.*_F','') ~ '^[0-9]+$'
  AND regexp_replace(f.family_code,'^.*_F','')::int BETWEEN 1 AND 10;

-- The executable bank uses the same customer_orders fixture for all tests.
UPDATE question_variants v
SET scenario_entity='customer_orders'
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='INTERMEDIATE'
  AND v.variant_code IN ('VAR_A','VAR_B','VAR_C')
  AND regexp_replace(f.family_code,'^.*_F','') ~ '^[0-9]+$'
  AND regexp_replace(f.family_code,'^.*_F','')::int BETWEEN 1 AND 10;
