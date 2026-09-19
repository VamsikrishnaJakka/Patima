-- migrations/040_adaptive_fixture_preview.sql
-- Add a structured fixture preview so student-facing SQL questions show actual data.

ALTER TABLE question_variants
  ADD COLUMN IF NOT EXISTS fixture_preview JSONB;

UPDATE question_variants v
SET
  fixture_ddl = 'CREATE TABLE customer_orders (
  customer_id INT,
  order_id INT,
  order_date DATE,
  amount NUMERIC(10,2),
  status TEXT
);

INSERT INTO customer_orders(customer_id, order_id, order_date, amount, status) VALUES
(1,101,''2026-01-01'',120.00,''PAID''),
(1,102,''2026-01-03'',80.00,''PAID''),
(1,103,''2026-01-03'',50.00,''REFUNDED''),
(1,104,''2026-01-08'',200.00,''PAID''),
(2,201,''2026-01-02'',90.00,''PAID''),
(2,202,''2026-01-05'',150.00,''PAID''),
(2,203,''2026-01-05'',70.00,''PAID''),
(2,204,''2026-01-10'',110.00,''CANCELLED'');',
  fixture_preview = jsonb_build_object(
    'columns', jsonb_build_array('customer_id','order_id','order_date','amount','status'),
    'rows', jsonb_build_array(
      jsonb_build_array(1,101,'2026-01-01',120.00,'PAID'),
      jsonb_build_array(1,102,'2026-01-03',80.00,'PAID'),
      jsonb_build_array(1,103,'2026-01-03',50.00,'REFUNDED'),
      jsonb_build_array(1,104,'2026-01-08',200.00,'PAID'),
      jsonb_build_array(2,201,'2026-01-02',90.00,'PAID'),
      jsonb_build_array(2,202,'2026-01-05',150.00,'PAID'),
      jsonb_build_array(2,203,'2026-01-05',70.00,'PAID'),
      jsonb_build_array(2,204,'2026-01-10',110.00,'CANCELLED')
    )
  )
WHERE v.family_id IN (
  SELECT f.id FROM question_families f WHERE f.domain = 'sql-window-functions'
);

UPDATE question_variants v
SET prompt_markdown = CASE
  WHEN f.concept_tag = 'core_concepts' THEN
    'Write a query that returns every order together with the customer total, without collapsing the individual order rows. Explain why the window expression preserves row-level detail.'
  WHEN f.concept_tag = 'joins_and_relationships' THEN
    'Return each order with the customer total and customer order count. Explain where the join belongs and why the window calculation must be applied at the intended row grain.'
  WHEN f.concept_tag = 'filtering_and_predicates' THEN
    'Return each customer order with a running total of only PAID orders. Explain how filtering before the window changes the rows visible to the window.'
  WHEN f.concept_tag = 'aggregation' THEN
    'Return each order with the customer total, customer average order amount, and order count using window functions. Do not collapse the rows.'
  WHEN f.concept_tag = 'ordering_and_ranking' THEN
    'Rank each customer''s orders from highest to lowest amount. Break ties deterministically with order_id and explain the partition and ordering.'
  WHEN f.concept_tag = 'partitioning' THEN
    'Compute a running order amount per customer ordered by order_date and order_id. Explain exactly what PARTITION BY and ORDER BY each control.'
  WHEN f.concept_tag = 'state_transitions' THEN
    'Use LAG to compare each order with the previous order for the same customer and identify where the status changes. Explain NULL handling for the first row.'
  WHEN f.concept_tag = 'edge_cases' THEN
    'Calculate a running total per customer when two orders share the same order_date. Explain why order_id is needed as a deterministic tie-breaker.'
  WHEN f.concept_tag = 'null_and_missing_values' THEN
    'Explain how LAG and window aggregates behave when the previous value is NULL or when a customer has only one row. Give a safe query pattern.'
  WHEN f.concept_tag = 'performance_behavior' THEN
    'Explain how partition size, sort order, and indexes can affect a window query over customer_orders. Identify what you would inspect in EXPLAIN ANALYZE.'
  WHEN f.concept_tag = 'concurrency' THEN
    'Explain what a window query sees under concurrent inserts and updates. Discuss transaction isolation and why deterministic ordering still matters.'
  WHEN f.concept_tag = 'error_handling' THEN
    'Write a window query that avoids accidental division by zero when comparing each order amount with the customer total. Explain the guard.'
  WHEN f.concept_tag = 'resource_boundaries' THEN
    'Explain how a very large PARTITION BY customer_id can affect sorting and memory. Describe practical ways to reduce the working set without changing the required result.'
  WHEN f.concept_tag = 'data_correctness' THEN
    'Produce a deterministic row number for every order within each customer. Explain how duplicate dates are handled and how you would validate the result.'
  WHEN f.concept_tag = 'debugging' THEN
    'A running total is unexpectedly duplicated for same-day orders. Diagnose the likely window-frame or ordering issue and provide a corrected query.'
  WHEN f.concept_tag = 'scalability' THEN
    'Design a scalable running-total query for customer_orders. Explain partitioning, ordering, window-frame choice, indexes, and what you would validate at larger data volumes.'
  WHEN f.concept_tag = 'determinism' THEN
    'Return the latest order per customer using ROW_NUMBER. Explain why ordering only by order_date is not deterministic when dates tie.'
  WHEN f.concept_tag = 'failure_recovery' THEN
    'Explain how you would validate a window query after a partial data reload. Include checks for duplicate rows, ordering, and partition-level totals.'
  WHEN f.concept_tag = 'trade_offs' THEN
    'Compare ROW_NUMBER, RANK, and DENSE_RANK for ranking customer orders. Explain how ties affect each result and when each is appropriate.'
  ELSE
    'Write and explain a production-ready window query over customer_orders. State the partition, ordering, frame, edge cases, and validation strategy.'
END
FROM question_families f
WHERE f.id = v.family_id
  AND f.domain = 'sql-window-functions';

UPDATE question_variants v
SET hidden_assertions = jsonb_build_object(
  'domain','sql-window-functions',
  'experience_level',v.experience_level,
  'concept',f.concept_tag,
  'required_terms',
    CASE
      WHEN f.concept_tag IN ('core_concepts','partitioning','ordering_and_ranking','state_transitions','edge_cases','data_correctness','debugging','scalability','determinism','trade_offs')
      THEN jsonb_build_array('partition','order','over')
      ELSE jsonb_build_array('partition','order','window')
    END
)
FROM question_families f
WHERE f.id=v.family_id AND f.domain='sql-window-functions';
