import { Prisma, prisma } from "@ai-saas/database";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Atomic Postgres-backed per-user chat limiter. Fail-open only for DB errors so
 * a transient limiter failure never turns a healthy AXIS chat into a 500. */
export async function checkChatRateLimit(userId: string, now = new Date()): Promise<RateLimitResult> {
  const windowMs = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS;
  const windowStart = new Date(windowMs);
  const nextWindow = new Date(windowMs + WINDOW_MS);

  try {
    const rows = await prisma.$queryRaw<Array<{ requests: number; window_start: Date }>>(Prisma.sql`
      INSERT INTO axis_chat_rate_limits (user_id, window_start, requests)
      VALUES (${userId}, ${windowStart}, 1)
      ON CONFLICT (user_id) DO UPDATE
      SET window_start = CASE
            WHEN axis_chat_rate_limits.window_start = EXCLUDED.window_start THEN axis_chat_rate_limits.window_start
            ELSE EXCLUDED.window_start
          END,
          requests = CASE
            WHEN axis_chat_rate_limits.window_start = EXCLUDED.window_start
              THEN axis_chat_rate_limits.requests + 1
            ELSE 1
          END
      RETURNING requests, window_start
    `);

    const used = Number(rows[0]?.requests ?? 1);
    if (used > MAX_REQUESTS) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((nextWindow.getTime() - now.getTime()) / 1000)),
      };
    }
    return { allowed: true, remaining: MAX_REQUESTS - used, retryAfterSeconds: 0 };
  } catch {
    // The limiter is defense-in-depth. Chat availability is more important than
    // turning a database hiccup into a user-visible 500.
    return { allowed: true, remaining: MAX_REQUESTS, retryAfterSeconds: 0 };
  }
}
