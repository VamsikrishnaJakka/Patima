-- migrations/039_seed_all_adaptive_assessments.sql
-- Enable all student-facing technology/experience combinations.
-- This seeds structural inventory for every configured assessment. Real authored
-- question content can replace these variants later without changing the engine.

INSERT INTO assessment_level_configs
  (domain, experience_level, total_questions, duration_minutes, min_difficulty, max_difficulty, starting_difficulty)
VALUES
  ('sql-window-functions','BEGINNER',10,15,1.0,4.0,2.5),
  ('sql-window-functions','INTERMEDIATE',15,25,4.1,7.0,5.5),
  ('sql-window-functions','ADVANCED',20,40,7.1,10.0,8.5),
  ('python-concurrency','BEGINNER',10,15,1.0,4.0,2.5),
  ('python-concurrency','INTERMEDIATE',15,25,4.1,7.0,5.5),
  ('python-concurrency','ADVANCED',20,40,7.1,10.0,8.5),
  ('java.concurrency_memory','BEGINNER',10,15,1.0,4.0,2.5),
  ('java.concurrency_memory','INTERMEDIATE',15,25,4.1,7.0,5.5),
  ('java.concurrency_memory','ADVANCED',20,40,7.1,10.0,8.5),
  ('linux.process_signals','BEGINNER',10,15,1.0,4.0,2.5),
  ('linux.process_signals','INTERMEDIATE',15,25,4.1,7.0,5.5),
  ('linux.process_signals','ADVANCED',20,40,7.1,10.0,8.5),
  ('docker.container_internals','BEGINNER',10,15,1.0,4.0,2.5),
  ('docker.container_internals','INTERMEDIATE',15,25,4.1,7.0,5.5),
  ('docker.container_internals','ADVANCED',20,40,7.1,10.0,8.5)
ON CONFLICT (domain, experience_level) DO UPDATE SET
  total_questions=EXCLUDED.total_questions,
  duration_minutes=EXCLUDED.duration_minutes,
  min_difficulty=EXCLUDED.min_difficulty,
  max_difficulty=EXCLUDED.max_difficulty,
  starting_difficulty=EXCLUDED.starting_difficulty;

DO $$
DECLARE
  d RECORD;
  lvl RECORD;
  fam RECORD;
  qfam RECORD;
  v INT;
  base_diff NUMERIC;
  concept TEXT;
  v_family_code TEXT;
  fingerprint TEXT;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      ('sql-window-functions','SQL'),
      ('python-concurrency','Python'),
      ('java.concurrency_memory','Java'),
      ('linux.process_signals','Linux'),
      ('docker.container_internals','Docker')
    ) AS x(domain,label)
  LOOP
    FOR lvl IN
      SELECT * FROM (VALUES
        ('BEGINNER',2.5),
        ('INTERMEDIATE',5.5),
        ('ADVANCED',8.5)
      ) AS x(experience_level,starting_difficulty)
    LOOP
      FOR fam IN SELECT generate_series(1,20) AS n
      LOOP
        v_family_code := upper(regexp_replace(d.label,'[^A-Za-z0-9]','','g')) || '_' || lvl.experience_level || '_F' || lpad(fam.n::text,2,'0');
        concept := CASE fam.n
          WHEN 1 THEN 'core concepts'
          WHEN 2 THEN 'joins and relationships'
          WHEN 3 THEN 'filtering and predicates'
          WHEN 4 THEN 'aggregation'
          WHEN 5 THEN 'ordering and ranking'
          WHEN 6 THEN 'partitioning'
          WHEN 7 THEN 'state transitions'
          WHEN 8 THEN 'edge cases'
          WHEN 9 THEN 'null and missing values'
          WHEN 10 THEN 'performance behavior'
          WHEN 11 THEN 'concurrency'
          WHEN 12 THEN 'error handling'
          WHEN 13 THEN 'resource boundaries'
          WHEN 14 THEN 'data correctness'
          WHEN 15 THEN 'debugging'
          WHEN 16 THEN 'scalability'
          WHEN 17 THEN 'determinism'
          WHEN 18 THEN 'failure recovery'
          WHEN 19 THEN 'trade-offs'
          ELSE 'production behavior'
        END;

        INSERT INTO question_families(domain,family_code,concept_tag,description)
        VALUES(
          d.domain,
          v_family_code,
          lower(replace(concept,' ','_')),
          d.label || ' ' || lvl.experience_level || ' assessment family covering ' || concept || '.'
        )
        ON CONFLICT (family_code) DO NOTHING;

        FOR v IN 1..3 LOOP
          base_diff := CASE lvl.experience_level
            WHEN 'BEGINNER' THEN 1.4 + ((fam.n-1) % 9) * 0.25
            WHEN 'INTERMEDIATE' THEN 4.3 + ((fam.n-1) % 11) * 0.25
            ELSE 7.3 + ((fam.n-1) % 11) * 0.25
          END + CASE v WHEN 1 THEN 0 WHEN 2 THEN 0.1 ELSE 0.2 END;

          SELECT q.id INTO STRICT qfam FROM question_families q WHERE q.family_code=v_family_code;

          fingerprint := repeat(md5(v_family_code || ':' || v::text),2);

          INSERT INTO question_variants(
            family_id,variant_code,fingerprint,difficulty_score,experience_level,
            expected_time_seconds,prompt_markdown,scenario_entity,fixture_ddl,hidden_assertions
          )
          VALUES(
            qfam.id,
            'VAR_' || chr(64+v),
            fingerprint,
            round(base_diff,1),
            lvl.experience_level,
            CASE lvl.experience_level WHEN 'BEGINNER' THEN 90 WHEN 'INTERMEDIATE' THEN 120 ELSE 150 END,
            '**' || d.label || ' — ' || initcap(concept) || '**' || E'\n\n' ||
            'Solve this ' || lvl.experience_level || '-level problem. Explain your approach, the relevant boundary conditions, and how you would validate correctness. ' ||
            'Discuss concurrency where relevant and identify important implementation details. ' ||
            'For SQL, explicitly discuss partitioning, ordering, window behavior, and edge cases where applicable.',
            lower(replace(d.label,' ','_')) || '_scenario',
            'CREATE TABLE assessment_fixture (id INT, value TEXT);',
            jsonb_build_object(
              'variant',v,
              'domain',d.domain,
              'experience_level',lvl.experience_level,
              'concept',concept,
              'required_terms',CASE WHEN d.domain='sql-window-functions'
                THEN jsonb_build_array('partition','order','window')
                ELSE jsonb_build_array('explain','concurrency','boundary') END
            )
          )
          ON CONFLICT (family_id,variant_code) DO UPDATE SET
            difficulty_score=EXCLUDED.difficulty_score,
            prompt_markdown=EXCLUDED.prompt_markdown,
            hidden_assertions=EXCLUDED.hidden_assertions,
            expected_time_seconds=EXCLUDED.expected_time_seconds,
            is_active=TRUE;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
