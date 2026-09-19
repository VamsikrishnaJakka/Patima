-- migrations/041_adaptive_session_choices.sql
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS selected_question_count INT,
  ADD COLUMN IF NOT EXISTS selected_duration_minutes INT;

UPDATE assessment_sessions
SET selected_question_count = COALESCE(selected_question_count, current_step - 1),
    selected_duration_minutes = COALESCE(selected_duration_minutes, 25)
WHERE selected_question_count IS NULL OR selected_duration_minutes IS NULL;
