-- migrations/047_single_active_assessment_session.sql
-- Enforce one active assessment session per candidate and assessment domain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_session_per_user_domain
ON assessment_sessions (user_id, domain)
WHERE status='IN_PROGRESS';
