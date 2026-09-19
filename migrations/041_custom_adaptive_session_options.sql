-- migrations/041_custom_adaptive_session_options.sql
-- Store the candidate-selected question count and duration on the session.

ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS question_count INT,
  ADD COLUMN IF NOT EXISTS duration_minutes_override INT;

UPDATE assessment_sessions s
SET
  question_count = COALESCE(question_count, c.total_questions),
  duration_minutes_override = COALESCE(duration_minutes_override, c.duration_minutes)
FROM assessment_level_configs c
WHERE c.domain = s.domain
  AND c.experience_level = s.experience_level
  AND (s.question_count IS NULL OR s.duration_minutes_override IS NULL);

ALTER TABLE assessment_sessions
  ADD CONSTRAINT assessment_sessions_question_count_chk
  CHECK (question_count IS NULL OR question_count BETWEEN 1 AND 20);

ALTER TABLE assessment_sessions
  ADD CONSTRAINT assessment_sessions_duration_override_chk
  CHECK (duration_minutes_override IS NULL OR duration_minutes_override BETWEEN 5 AND 60);
