-- 054: Theory responses, beginner-only authored content, and skippable questions.
ALTER TABLE question_variants
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'CODE',
  ADD COLUMN IF NOT EXISTS answer_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- Keep beginner assessments beginner. VAR_A remains coding for SQL; VAR_B/VAR_C
-- are theory formats so the assessment mixes practical and conceptual questions.
UPDATE question_variants v
SET response_mode='CODE',
    question_type='CODING'
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code='VAR_A';

UPDATE question_variants v
SET public_tests=jsonb_build_array(
      jsonb_build_object('name','paid orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true),
      jsonb_build_object('name','high value orders','fixture_ddl',v.fixture_ddl,'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE amount >= 100 ORDER BY order_id','order_sensitive',true)
    ),
    hidden_tests=jsonb_build_array(
      jsonb_build_object('name','hidden paid order','fixture_ddl',replace(v.fixture_ddl,'(2,204,''2026-01-10'',110.00,''CANCELLED'')','(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id','order_sensitive',true)
    )
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code='VAR_A'
  AND v.response_mode='CODE';

UPDATE question_variants v
SET response_mode='MCQ',
    question_type='THEORY',
    answer_options=CASE f.concept_tag
      WHEN 'filtering_and_predicates' THEN '["WHERE filters rows","GROUP BY filters rows","ORDER BY filters rows","OVER filters rows"]'::jsonb
      WHEN 'aggregation' THEN '["SUM","WHERE","ORDER BY","DISTINCT"]'::jsonb
      WHEN 'ordering_and_ranking' THEN '["ORDER BY","WHERE","HAVING","JOIN"]'::jsonb
      ELSE '["PARTITION BY divides rows into groups for a window","PARTITION BY sorts the final result","PARTITION BY removes duplicates","PARTITION BY filters rows"]'::jsonb
    END,
    correct_answer=CASE f.concept_tag
      WHEN 'filtering_and_predicates' THEN 'WHERE filters rows'
      WHEN 'aggregation' THEN 'SUM'
      WHEN 'ordering_and_ranking' THEN 'ORDER BY'
      ELSE 'PARTITION BY divides rows into groups for a window'
    END
FROM question_families f
WHERE f.id=v.family_id AND f.domain='sql-window-functions' AND v.experience_level='BEGINNER' AND v.variant_code='VAR_B';

UPDATE question_variants v
SET response_mode='TEXT',
    question_type='THEORY',
    answer_options='[]'::jsonb,
    correct_answer=NULL
FROM question_families f
WHERE f.id=v.family_id AND f.domain='sql-window-functions' AND v.experience_level='BEGINNER' AND v.variant_code='VAR_C';

-- Author beginner-friendly SQL prompts.
UPDATE question_variants v
SET prompt_markdown=CASE f.concept_tag
  WHEN 'filtering_and_predicates' THEN 'Show all PAID orders from customer_orders. Return order_id and amount.'
  WHEN 'aggregation' THEN 'For each customer, calculate the total order amount using SUM. Return customer_id and total_amount.'
  WHEN 'ordering_and_ranking' THEN 'Return order_id and amount sorted from highest amount to lowest amount.'
  WHEN 'partitioning' THEN 'Explain in simple terms what PARTITION BY customer_id does in a window function.'
  WHEN 'edge_cases' THEN 'Why can order_id be useful as a tie-breaker when two orders have the same order_date?'
  WHEN 'core_concepts' THEN 'What is the difference between a normal aggregate such as SUM(amount) and SUM(amount) OVER (...)?'
  WHEN 'joins_and_relationships' THEN 'What is the purpose of an INNER JOIN? Give a simple example using two related tables.'
  WHEN 'state_transitions' THEN 'What does LAG() return for the first row in each customer partition?'
  WHEN 'null_and_missing_values' THEN 'What does NULL mean in SQL? Give one example of a NULL value.'
  WHEN 'data_correctness' THEN 'Why is ORDER BY important when you need deterministic query results?'
  ELSE 'Explain the SQL concept in the question using a simple example. Keep the answer focused on the basic idea.'
END
FROM question_families f
WHERE f.id=v.family_id AND f.domain='sql-window-functions' AND v.experience_level='BEGINNER' AND v.variant_code IN ('VAR_A','VAR_B','VAR_C');

-- Beginner Python theory.
UPDATE question_variants v
SET response_mode=CASE WHEN v.variant_code='VAR_B' THEN 'TEXT' ELSE 'MCQ' END,
    question_type='THEORY',
    answer_options=CASE WHEN v.variant_code='VAR_B' THEN '[]'::jsonb
      ELSE '["A list","A function","A class","A module"]'::jsonb END,
    correct_answer=CASE WHEN v.variant_code='VAR_B' THEN NULL ELSE 'A list' END,
    prompt_markdown=CASE v.variant_code
      WHEN 'VAR_A' THEN 'Which Python data type is commonly used to store an ordered collection of values?'
      WHEN 'VAR_B' THEN 'In simple terms, explain the difference between a list and a tuple in Python.'
      ELSE 'What does a Python function return when it reaches a return statement?'
    END
FROM question_families f
WHERE f.id=v.family_id AND f.domain='python-concurrency' AND v.experience_level='BEGINNER';

-- Beginner Java theory.
UPDATE question_variants v
SET response_mode=CASE WHEN v.variant_code='VAR_B' THEN 'TEXT' ELSE 'MCQ' END,
    question_type='THEORY',
    answer_options=CASE WHEN v.variant_code='VAR_B' THEN '[]'::jsonb
      ELSE '["A variable","A class","A package","A thread"]'::jsonb END,
    correct_answer=CASE WHEN v.variant_code='VAR_B' THEN NULL ELSE 'A class' END,
    prompt_markdown=CASE v.variant_code
      WHEN 'VAR_A' THEN 'Which Java construct is used as the blueprint for creating objects?'
      WHEN 'VAR_B' THEN 'Explain the difference between a class and an object in Java using a simple example.'
      ELSE 'What is the basic purpose of a Java thread?'
    END
FROM question_families f
WHERE f.id=v.family_id AND f.domain='java.concurrency_memory' AND v.experience_level='BEGINNER';

-- Beginner theory should not accidentally inherit advanced complexity guidance.
UPDATE question_variants
SET expected_time_complexity=NULL,
    expected_space_complexity=NULL
WHERE experience_level='BEGINNER' AND question_type='THEORY';
