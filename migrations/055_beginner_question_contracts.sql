-- 055: Coherent beginner question contracts.
-- Each beginner SQL family exposes exactly one concrete question variant.
-- Coding prompts, MCQs, and written theory prompts are authored independently
-- so the response mode can never disagree with the question being asked.

-- Disable the placeholder beginner variants first. The 20 VAR_A variants below
-- become the complete beginner SQL inventory, one distinct family per question.
UPDATE question_variants v
SET is_active = FALSE
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER';

UPDATE question_variants v
SET
  is_active=TRUE,
  scenario_entity='customer_orders',
  fixture_ddl=v.fixture_ddl,
  starter_code=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17)
      THEN '-- Write your SQL here'
    ELSE NULL
  END,
  response_mode=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17) THEN 'CODE'
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (1,2,6,7,9,10,13,16,19,20) THEN 'MCQ'
    ELSE 'TEXT'
  END,
  question_type=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17) THEN 'CODING'
    ELSE 'THEORY'
  END,
  prompt_markdown=CASE regexp_replace(f.family_code,'^.*_F','')::int
    WHEN 1 THEN 'Which SQL keyword is used to choose the columns returned by a query?'
    WHEN 2 THEN 'Which SQL keyword is used to combine rows from two related tables?'
    WHEN 3 THEN 'Show all PAID orders from customer_orders. Return order_id and amount, sorted by order_id from smallest to largest.'
    WHEN 4 THEN 'For each customer, calculate the total order amount. Return customer_id and total_amount, sorted by customer_id.'
    WHEN 5 THEN 'Return order_id and amount from customer_orders, sorted from highest amount to lowest amount. If two amounts are equal, sort by order_id ascending.'
    WHEN 6 THEN 'In simple terms, what does PARTITION BY customer_id do inside a SQL window function? Give a small example using customer_orders.'
    WHEN 7 THEN 'What does LAG() return for the first row in each customer''s ordered set?'
    WHEN 8 THEN 'Return order_id and order_date from customer_orders sorted by order_date ascending. If two orders have the same date, use order_id as the tie-breaker.'
    WHEN 9 THEN 'How do you check whether a column contains NULL in SQL?'
    WHEN 10 THEN 'In simple terms, why can filtering rows before a window calculation reduce the amount of data the window function processes?'
    WHEN 11 THEN 'In simple terms, what does transaction isolation control when multiple database operations happen at the same time?'
    WHEN 12 THEN 'What SQL expression can you use to safely prevent division-by-zero errors?'
    WHEN 13 THEN 'Which SQL clause can limit the number of rows returned by a query?'
    WHEN 14 THEN 'Return one row for every order with a row number within each customer. Number each customer''s orders by order_date ascending and use order_id as the tie-breaker.'
    WHEN 15 THEN 'A SQL query returns duplicate rows unexpectedly. Name two simple checks you would make to find the cause.'
    WHEN 16 THEN 'Which change can make a window query more expensive when the data grows?'
    WHEN 17 THEN 'Return the latest order for each customer. Use ROW_NUMBER() so that ties on order_date are resolved by the larger order_id.'
    WHEN 18 THEN 'After reloading customer_orders, what simple checks would you perform to make sure the data was not duplicated or lost?'
    WHEN 19 THEN 'What is the main difference between ROW_NUMBER() and RANK() when two rows have the same ordering value?'
    ELSE 'What makes the result of a SQL query deterministic when multiple rows have the same ordering value?'
  END,
  answer_options=CASE regexp_replace(f.family_code,'^.*_F','')::int
    WHEN 1 THEN '["SELECT","WHERE","GROUP BY","ORDER BY"]'::jsonb
    WHEN 2 THEN '["JOIN","ORDER BY","LIMIT","HAVING"]'::jsonb
    WHEN 6 THEN '["It divides rows into groups for the window calculation","It removes duplicate rows","It filters rows before SELECT","It sorts the final result"]'::jsonb
    WHEN 7 THEN '["The next row value","The previous row value, or NULL for the first row","The total of all rows","The current row number"]'::jsonb
    WHEN 9 THEN '["column = NULL","column IS NULL","column == NULL","column HAS NULL"]'::jsonb
    WHEN 10 THEN '["WHERE can reduce the rows that reach the window calculation","WHERE always sorts the result","WHERE removes all NULL values","WHERE changes DECIMAL to INTEGER"]'::jsonb
    WHEN 13 THEN '["LIMIT","PARTITION BY","OVER","DISTINCT"]'::jsonb
    WHEN 16 THEN '["A larger partition that must be processed and sorted","Selecting fewer output columns","Using a WHERE filter","Returning fewer rows"]'::jsonb
    WHEN 19 THEN '["ROW_NUMBER gives unique row numbers; RANK can give tied rows the same rank","They always produce identical results","RANK removes duplicate rows","ROW_NUMBER can only be used without ORDER BY"]'::jsonb
    WHEN 20 THEN '["An explicit ORDER BY with a tie-breaker","Leaving row order to the database","Using SELECT *","Removing ORDER BY"]'::jsonb
    ELSE '[]'::jsonb
  END,
  correct_answer=CASE regexp_replace(f.family_code,'^.*_F','')::int
    WHEN 1 THEN 'SELECT'
    WHEN 2 THEN 'JOIN'
    WHEN 6 THEN 'It divides rows into groups for the window calculation'
    WHEN 7 THEN 'The previous row value, or NULL for the first row'
    WHEN 9 THEN 'column IS NULL'
    WHEN 10 THEN 'WHERE can reduce the rows that reach the window calculation'
    WHEN 13 THEN 'LIMIT'
    WHEN 16 THEN 'A larger partition that must be processed and sorted'
    WHEN 19 THEN 'ROW_NUMBER gives unique row numbers; RANK can give tied rows the same rank'
    WHEN 20 THEN 'An explicit ORDER BY with a tie-breaker'
    ELSE NULL
  END,
  expected_time_complexity=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17) THEN 'O(n log n)'
    ELSE NULL
  END,
  expected_space_complexity=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17) THEN 'O(n)'
    ELSE NULL
  END,
  concept_rubric='{}'::jsonb,
  public_tests=CASE regexp_replace(f.family_code,'^.*_F','')::int
    WHEN 3 THEN jsonb_build_array(
      jsonb_build_object('name','paid orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true),
      jsonb_build_object('name','high value orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE amount >= 100 ORDER BY order_id','order_sensitive',true))
    WHEN 4 THEN jsonb_build_array(
      jsonb_build_object('name','customer totals','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true),
      jsonb_build_object('name','customer counts','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, COUNT(*) AS order_count FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true))
    WHEN 5 THEN jsonb_build_array(
      jsonb_build_object('name','amount descending','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC','order_sensitive',true),
      jsonb_build_object('name','amount ascending','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount ASC, order_id ASC','order_sensitive',true))
    WHEN 8 THEN jsonb_build_array(
      jsonb_build_object('name','date order','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC','order_sensitive',true),
      jsonb_build_object('name','latest first','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date DESC, order_id DESC','order_sensitive',true))
    WHEN 14 THEN jsonb_build_array(
      jsonb_build_object('name','customer row numbers','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true),
      jsonb_build_object('name','customer row counts','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_id','order_sensitive',true))
    WHEN 17 THEN jsonb_build_array(
      jsonb_build_object('name','latest order per customer','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id','order_sensitive',true),
      jsonb_build_object('name','latest order with tie','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1200.00,''PAID'')'),'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id','order_sensitive',true))
    ELSE '[]'::jsonb
  END,
  hidden_tests=CASE regexp_replace(f.family_code,'^.*_F','')::int
    WHEN 3 THEN jsonb_build_array(jsonb_build_object('name','hidden paid order','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true))
    WHEN 4 THEN jsonb_build_array(jsonb_build_object('name','hidden third customer','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id','order_sensitive',true))
    WHEN 5 THEN jsonb_build_array(jsonb_build_object('name','hidden equal amount tie','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',110.00,''PAID''),(3,302,''2026-01-12'',110.00,''PAID'' )'),'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC','order_sensitive',true))
    WHEN 8 THEN jsonb_build_array(jsonb_build_object('name','hidden same-date tie','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-10'',110.00,''PAID'')'),'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC','order_sensitive',true))
    WHEN 14 THEN jsonb_build_array(jsonb_build_object('name','hidden customer row','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_date, order_id','order_sensitive',true))
    WHEN 17 THEN jsonb_build_array(jsonb_build_object('name','hidden latest customer','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1200.00,''PAID'' )'),'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id','order_sensitive',true))
    ELSE '[]'::jsonb
  END,
  verification_policy=CASE
    WHEN regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17)
      THEN jsonb_build_object('allowedTables',jsonb_build_array('customer_orders'),'requireWindowFunction',FALSE)
    ELSE '{}'::jsonb
  END
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code='VAR_A';

-- Ensure non-active variants cannot accidentally be selected.
UPDATE question_variants v
SET is_active=FALSE
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code IN ('VAR_B','VAR_C');
