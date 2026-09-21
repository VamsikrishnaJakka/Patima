-- 056: Make every beginner coding test a variation of the SAME authored question contract.
-- A public/hidden test may change the fixture, but it must never change the requested
-- output shape, calculation, filters, ordering rule, or task semantics.

UPDATE question_variants v
SET public_tests = CASE regexp_replace(f.family_code,'^.*_F','')::int
  WHEN 3 THEN jsonb_build_array(
    jsonb_build_object(
      'name','paid orders — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','paid orders — additional PAID row',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),
      'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id',
      'order_sensitive',true
    )
  )
  WHEN 4 THEN jsonb_build_array(
    jsonb_build_object(
      'name','customer totals — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','customer totals — additional customer',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1200.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id',
      'order_sensitive',true
    )
  )
  WHEN 5 THEN jsonb_build_array(
    jsonb_build_object(
      'name','amount descending — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','amount descending — equal amount tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',110.00,''PAID''),(3,302,''2026-01-12'',110.00,''PAID'')'),
      'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC',
      'order_sensitive',true
    )
  )
  WHEN 8 THEN jsonb_build_array(
    jsonb_build_object(
      'name','date ascending — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','date ascending — same-date tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-10'',110.00,''PAID'')'),
      'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC',
      'order_sensitive',true
    )
  )
  WHEN 14 THEN jsonb_build_array(
    jsonb_build_object(
      'name','row number by customer/date — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_date, order_id',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','row number by customer/date — same-date tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1000.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_date, order_id',
      'order_sensitive',true
    )
  )
  WHEN 17 THEN jsonb_build_array(
    jsonb_build_object(
      'name','latest order per customer — baseline fixture',
      'fixture_ddl',v.fixture_ddl,
      'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id',
      'order_sensitive',true
    ),
    jsonb_build_object(
      'name','latest order per customer — same-date tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1200.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id',
      'order_sensitive',true
    )
  )
  ELSE v.public_tests
END,
hidden_tests = CASE regexp_replace(f.family_code,'^.*_F','')::int
  WHEN 3 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — additional PAID row',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),
      'canonical_sql','SELECT order_id, amount FROM customer_orders WHERE status=''PAID'' ORDER BY order_id',
      'order_sensitive',true
    )
  )
  WHEN 4 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — additional customer',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, SUM(amount) AS total_amount FROM customer_orders GROUP BY customer_id ORDER BY customer_id',
      'order_sensitive',true
    )
  )
  WHEN 5 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — equal amount tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',110.00,''PAID''),(3,302,''2026-01-12'',110.00,''PAID'')'),
      'canonical_sql','SELECT order_id, amount FROM customer_orders ORDER BY amount DESC, order_id ASC',
      'order_sensitive',true
    )
  )
  WHEN 8 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — same-date tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-10'',110.00,''PAID'')'),
      'canonical_sql','SELECT order_id, order_date FROM customer_orders ORDER BY order_date ASC, order_id ASC',
      'order_sensitive',true
    )
  )
  WHEN 14 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — additional customer row',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS row_num FROM customer_orders ORDER BY customer_id, order_date, order_id',
      'order_sensitive',true
    )
  )
  WHEN 17 THEN jsonb_build_array(
    jsonb_build_object(
      'name','hidden — latest customer with tie',
      'fixture_ddl',replace(v.fixture_ddl,
        '(2,204,''2026-01-10'',110.00,''CANCELLED'')',
        '(2,204,''2026-01-10'',110.00,''CANCELLED''),(3,301,''2026-01-11'',1000.00,''PAID''),(3,302,''2026-01-11'',1200.00,''PAID'')'),
      'canonical_sql','SELECT customer_id, order_id, order_date FROM customer_orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC)=1 ORDER BY customer_id',
      'order_sensitive',true
    )
  )
  ELSE v.hidden_tests
END
FROM question_families f
WHERE f.id=v.family_id
  AND f.domain='sql-window-functions'
  AND v.experience_level='BEGINNER'
  AND v.variant_code='VAR_A'
  AND regexp_replace(f.family_code,'^.*_F','')::int IN (3,4,5,8,14,17);
