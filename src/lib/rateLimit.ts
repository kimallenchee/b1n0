/**
 * Client-side rate limiter — prevents spammy UI interactions
 * from even hitting the server.
 *
 * This is a first line of defense. The real enforcement is in
 * the Supabase RPC (check_rate_limit + rate_limits table).
 */

interface BucketEntry {
  count: number
  resetAt: number
}

const buckets = new Map<string, BucketEntry>()

/**
 * Returns true if the action is allowed, false if rate-limited.
 *
 * @param key     Unique key, e.g. `purchase:${userId}` or `deposit`
 * @param max     Max actions in the window (default 5)
 * @param windowMs  Window size in ms (default 60_000 = 1 minute)
 */
export function clientRateCheck(
  key: string,
  max = 5,
  windowMs = 60_000,
): boolean {
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= max) return false

  entry.count++
  return true
}

/**
 * Returns seconds until the bucket resets (0 if not limited).
 */
export function clientRateWaitSec(key: string): number {
  const entry = buckets.get(key)
  if (!entry) return 0
  const remaining = entry.resetAt - Date.now()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}
