-- Authored executable beginner SQL bank.
-- Beginner questions are intentionally foundational: filtering, aggregation,
-- ordering, simple ranking, and deterministic row selection. They are not
-- advanced window-function puzzles.

ALTER TABLE question_variants
  ADD COLUMN IF NOT EXISTS verification_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

WITH target AS (
  SELECT v.id,f.concept_tag
  FROM question_variants v
  JOIN question_families f ON f.id=v.family_id
  WHERE f.domain='sql-window-functions'
    AND v.experience_level='BEGINNER'
    AND v.variant_code IN ('VAR_A','VAR_B','VAR_C')
    AND f.concept_tag IN ('filtering_and_predicates','aggregation','ordering_and_ranking','data_correctness','edge_cases')
)
UPDATE question_variants v
SET
 question_type='CODING',
 starter_code='-- Write your SQL here',
 scenario_entity='customer_orders',
 expected_time_complexity='O(n log n)',
 expected_space_complexity='O(n)',
 reference_explanation=CASE t.concept_tag
   WHEN 'filtering_and_predicates' THEN 'Filter rows with a WHERE condition and return only the requested columns.'
   WHEN 'aggregation' THEN 'Use GROUP BY to calculate one total per customer.'
   WHEN 'ordering_and_ranking' THEN 'Sort the returned rows deterministically using amount and order_id.'
   WHEN 'data_correctness' THEN 'Return one row per order and preserve the requested row grain.'
   ELSE 'Use a deterministic ORDER BY so equal dates do not produce ambiguous output.'
 END,
 concept_rubric=jsonb_build_object('required',CASE t.concept_tag
   WHEN 'filtering_and_predicates' THEN jsonb_build_array('SELECT','WHERE')
   WHEN 'aggregation' THEN jsonb_build_array('SUM','GROUP BY')
   WHEN 'ordering_and_ranking' THEN jsonb_build_array('ORDER BY')
   WHEN 'data_correctness' THEN jsonb_build_array('SELECT')
   ELSE jsonb_build_array('ORDER BY','order_id')
 END),
 verification_policy=jsonb_build_object('allowedTables',jsonb_build_array('customer_orders'),'requireWindowFunction',false),
 public_tests=CASE t.concept_tag
   WHEN 'filtering_and_predicates' THEN jsonb_build_array(
     jsonb_build_object('name','paid orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, customer_id FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true),
     jsonb_build_object('name','high value orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id FROM customer_orders WHERE amount >= 100 ORDER BY order_id','order_sensitive',true)
   )
   WHEN 'aggregation' THEN jsonb_build_array(
     jsonb_build_object('name','customer totals','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true),
     jsonb_build_object('name','customer counts','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, COUNT(*) AS order_count FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true)
   )
   WHEN 'ordering_and_ranking' THEN jsonb_build_array(
     jsonb_build_object('name','amount descending','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC','order_sensitive',true),
     jsonb_build_object('name','amount ascending','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount ASC, order_id ASC','order_sensitive',true)
   )
   WHEN 'data_correctness' THEN jsonb_build_array(
     jsonb_build_object('name','one row per order','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, customer_id, amount FROM customer_orders ORDER BY order_id','order_sensitive',true),
     jsonb_build_object('name','paid row count','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT COUNT(*) AS paid_count FROM customer_orders WHERE status=''PAID''','order_sensitive',true)
   )
   ELSE jsonb_build_array(
     jsonb_build_object('name','deterministic date order','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC','order_sensitive',true),
     jsonb_build_object('name','latest first','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date DESC, order_id DESC','order_sensitive',true)
   )
 END,
 hidden_tests=CASE t.concept_tag
   WHEN 'filtering_and_predicates' THEN jsonb_build_array(
     jsonb_build_object('name','hidden cancelled exclusion','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT order_id, customer_id FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true)
   )
   WHEN 'aggregation' THEN jsonb_build_array(
     jsonb_build_object('name','hidden third customer','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true)
   )
   WHEN 'ordering_and_ranking' THEN jsonb_build_array(
     jsonb_build_object('name','hidden equal amount tie','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',110.00,''PAID'')'),'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC','order_sensitive',true)
   )
   ELSE jsonb_build_array(
     jsonb_build_object('name','hidden deterministic boundary','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-10'',110.00,''PAID'')'),'canonical_sql',CASE WHEN t.concept_tag='data_correctness' THEN 'SELECT order_id, customer_id, amount FROM customer_orders ORDER BY order_id' ELSE 'SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC' END,'order_sensitive',true)
   )
 END
FROM target t
WHERE v.id=t.id;
