-- migrations/043_seed_authored_sql_verification_bank.sql
-- Authored executable SQL verification bank for the student-facing window-functions track.
-- This migration intentionally covers the first ten SQL families and all three variants
-- at INTERMEDIATE level. The remaining inventory stays THEORY until independently authored.
-- Every executable variant is backed by the exact customer_orders fixture and
-- reference SQL; hidden tests use a second boundary fixture to prevent overfitting.

WITH target AS (
  SELECT
    v.id,
    f.family_code,
    f.concept_tag,
    v.experience_level,
    v.fixture_ddl,
    v.family_id,
    v.variant_code
  FROM question_variants v
  JOIN question_families f ON f.id=v.family_id
  WHERE f.domain='sql-window-functions'
    AND v.experience_level='INTERMEDIATE'
    AND split_part(v.variant_code,'_',2) IN ('A','B','C')
    AND regexp_replace(f.family_code,'^.*_F','') ~ '^[0-9]+$'
    AND regexp_replace(f.family_code,'^.*_F','')::int BETWEEN 1 AND 10
)
UPDATE question_variants v
SET
  question_type='CODING',
  starter_code='-- Write your SQL here',
  reference_explanation=CASE t.concept_tag
    WHEN 'core_concepts' THEN 'Use a window aggregate partitioned by customer_id so each order remains a row.'
    WHEN 'joins_and_relationships' THEN 'Preserve the order grain and derive customer-level metrics with window functions.'
    WHEN 'filtering_and_predicates' THEN 'Filter the input rows to PAID orders before computing the running total.'
    WHEN 'aggregation' THEN 'Use window aggregates to add total, average, and count without collapsing rows.'
    WHEN 'ordering_and_ranking' THEN 'Partition by customer_id and order by amount DESC, order_id ASC for deterministic ranking.'
    WHEN 'partitioning' THEN 'Partition by customer_id and use order_date, order_id as deterministic running order.'
    WHEN 'state_transitions' THEN 'Use LAG(status) over each customer ordered by order_date, order_id.'
    WHEN 'edge_cases' THEN 'Use ROWS framing with a deterministic tie-breaker rather than an ambiguous peer group.'
    WHEN 'null_and_missing_values' THEN 'Treat the first row of each partition as having no previous row and preserve the row grain.'
    ELSE 'Use a deterministic ROW_NUMBER window ordered by the relevant customer-level business key.'
  END,
  expected_time_complexity='O(n log n) due to partition/order sorting',
  expected_space_complexity='O(n) worst-case window working set',
  concept_rubric=CASE t.concept_tag
    WHEN 'core_concepts' THEN jsonb_build_object('required',jsonb_build_array('SUM','OVER','PARTITION BY'),'forbidden',jsonb_build_array('GROUP BY'))
    WHEN 'joins_and_relationships' THEN jsonb_build_object('required',jsonb_build_array('OVER','PARTITION BY'),'forbidden',jsonb_build_array('row collapse'))
    WHEN 'filtering_and_predicates' THEN jsonb_build_object('required',jsonb_build_array('WHERE','PAID','OVER'),'forbidden',jsonb_build_array('REFUNDED'))
    WHEN 'aggregation' THEN jsonb_build_object('required',jsonb_build_array('SUM','AVG','COUNT','OVER'))
    WHEN 'ordering_and_ranking' THEN jsonb_build_object('required',jsonb_build_array('RANK','PARTITION BY','ORDER BY','order_id'))
    WHEN 'partitioning' THEN jsonb_build_object('required',jsonb_build_array('PARTITION BY','ORDER BY','order_date','order_id'))
    WHEN 'state_transitions' THEN jsonb_build_object('required',jsonb_build_array('LAG','PARTITION BY','ORDER BY'))
    WHEN 'edge_cases' THEN jsonb_build_object('required',jsonb_build_array('ROWS','ORDER BY','order_id'))
    WHEN 'null_and_missing_values' THEN jsonb_build_object('required',jsonb_build_array('LAG','OVER'))
    ELSE jsonb_build_object('required',jsonb_build_array('ROW_NUMBER','PARTITION BY','ORDER BY'))
  END,
  public_tests=CASE t.concept_tag
    WHEN 'core_concepts' THEN jsonb_build_array(
      jsonb_build_object('name','customer totals','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true),
      jsonb_build_object('name','customer total row preservation','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'joins_and_relationships' THEN jsonb_build_array(
      jsonb_build_object('name','customer order metrics','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true),
      jsonb_build_object('name','grain preservation','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT order_id, customer_id, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'filtering_and_predicates' THEN jsonb_build_array(
      jsonb_build_object('name','paid running total','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS paid_running_total FROM customer_orders WHERE status=''PAID'' ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','paid rows only','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id FROM customer_orders WHERE status=''PAID'' ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'aggregation' THEN jsonb_build_array(
      jsonb_build_object('name','window aggregates','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total, AVG(amount) OVER (PARTITION BY customer_id) AS customer_avg, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true),
      jsonb_build_object('name','count preservation','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT order_id, COUNT(*) OVER (PARTITION BY customer_id) AS order_count FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'ordering_and_ranking' THEN jsonb_build_array(
      jsonb_build_object('name','deterministic ranks','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount, RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC, order_id ASC) AS amount_rank FROM customer_orders ORDER BY customer_id, amount DESC, order_id','order_sensitive',true),
      jsonb_build_object('name','highest order per customer','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, amount FROM (SELECT customer_id, order_id, amount, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC, order_id ASC) AS rn FROM customer_orders) x WHERE rn=1 ORDER BY customer_id','order_sensitive',true)
    )
    WHEN 'partitioning' THEN jsonb_build_array(
      jsonb_build_object('name','deterministic running amount','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','partition totals','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, SUM(amount) OVER (PARTITION BY customer_id) AS customer_total FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'state_transitions' THEN jsonb_build_array(
      jsonb_build_object('name','previous status','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, status, LAG(status) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS previous_status FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','status change flag','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, CASE WHEN LAG(status) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) IS NULL THEN 0 WHEN LAG(status) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) <> status THEN 1 ELSE 0 END AS status_changed FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'edge_cases' THEN jsonb_build_array(
      jsonb_build_object('name','same-day running total','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','deterministic row number','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    WHEN 'null_and_missing_values' THEN jsonb_build_array(
      jsonb_build_object('name','previous order','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, LAG(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS previous_amount FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','single row safety','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, CASE WHEN LAG(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) IS NULL THEN amount ELSE amount - LAG(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) END AS delta_from_previous FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true)
    )
    ELSE jsonb_build_array(
      jsonb_build_object('name','deterministic row number','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS rn FROM customer_orders ORDER BY customer_id, rn','order_sensitive',true),
      jsonb_build_object('name','latest order per customer','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, order_date, amount FROM (SELECT customer_id, order_id, order_date, amount, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS rn FROM customer_orders) x WHERE rn=1 ORDER BY customer_id','order_sensitive',true)
    )
  END,
  hidden_tests=CASE t.concept_tag
    WHEN 'core_concepts' THEN jsonb_build_array(
      jsonb_build_object('name','hidden preserved grain','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, COUNT(*) OVER (PARTITION BY customer_id) AS n FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
    WHEN 'ordering_and_ranking' THEN jsonb_build_array(
      jsonb_build_object('name','hidden deterministic ties','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC, order_id ASC) AS rn FROM customer_orders ORDER BY customer_id, rn','order_sensitive',true)
    )
    ELSE jsonb_build_array(
      jsonb_build_object('name','hidden boundary ordering','fixture_ddl',t.fixture_ddl,'canonical_sql',
        'SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true)
    )
  END
FROM target t
WHERE v.id=t.id;

-- Make only these explicitly authored variants executable. The rest remain THEORY.
