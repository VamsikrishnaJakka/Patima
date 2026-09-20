-- PATIMA beginner assessment calibration.
-- Beginner means foundational recognition and straightforward application,
-- not compressed intermediate/advanced reasoning.
UPDATE question_variants
SET
 difficulty_score=LEAST(difficulty_score,3.0),
 expected_time_seconds=GREATEST(expected_time_seconds,90),
 prompt_markdown=CASE
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='sql-window-functions' AND concept_tag='core_concepts')
   THEN '**SQL beginner — reading a query**\n\nLook at a simple SELECT query and identify which rows are returned by its WHERE condition. Explain your answer in one or two sentences.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='sql-window-functions' AND concept_tag='joins_and_relationships')
   THEN '**SQL beginner — understanding a join**\n\nExplain in simple terms what an INNER JOIN does when two tables share a matching key. Give a small example.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='sql-window-functions' AND concept_tag='filtering_and_predicates')
   THEN '**SQL beginner — filtering rows**\n\nWrite a simple SELECT statement that returns rows matching one condition. Keep the solution straightforward.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='python-concurrency' AND concept_tag='core_concepts')
   THEN '**Python beginner — basic control flow**\n\nWrite a small Python example that checks a value with an if/else statement and explain what happens for each case.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='java.concurrency_memory' AND concept_tag='core_concepts')
   THEN '**Java beginner — variables and conditions**\n\nWrite a small Java example that stores a value and prints one message when a condition is true and another when it is false.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='linux.process_signals' AND concept_tag='core_concepts')
   THEN '**Linux beginner — finding a process**\n\nExplain what a PID is and name one basic command you would use to inspect running processes.'
  WHEN family_id IN (SELECT id FROM question_families WHERE domain='docker.container_internals' AND concept_tag='core_concepts')
   THEN '**Docker beginner — image vs container**\n\nExplain the difference between a Docker image and a running container in simple terms.'
  ELSE prompt_markdown
 END
WHERE experience_level='BEGINNER' AND is_active=TRUE;
