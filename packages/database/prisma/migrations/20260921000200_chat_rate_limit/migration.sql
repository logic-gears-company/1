-- Atomic per-user, one-minute chat rate limit. No Prisma model is required; the
-- hot path uses a single UPSERT so concurrent requests cannot oversubscribe a window.
CREATE TABLE IF NOT EXISTS axis_chat_rate_limits (
  user_id      text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  requests     integer NOT NULL DEFAULT 0 CHECK (requests >= 0)
);

ALTER TABLE axis_chat_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS axis_chat_rate_limits_window_idx
  ON axis_chat_rate_limits (window_start);
