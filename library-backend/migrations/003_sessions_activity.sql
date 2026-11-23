-- =====================================================================
-- Migration 003: session activity tracking (staff inactivity logout)
-- Safe to run once. Run in pgAdmin on library_system, press F5.
-- =====================================================================

BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose);

INSERT INTO schema_migrations (version) VALUES ('003_sessions_activity')
ON CONFLICT (version) DO NOTHING;

COMMIT;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'sessions' ORDER BY ordinal_position;