/**
 * Retry helper with exponential backoff for Supabase calls.
 *
 * Usage:
 *   const { data, error } = await withRetry(() =>
 *     supabase.from('events').select('*')
 *   )
 */

interface RetryOptions {
  /** Max number of attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in ms (default: 1000) */
  baseDelay?: number
  /** Multiplier per attempt (default: 2) */
  backoffFactor?: number
}

/**
 * Wraps a Supabase query with exponential backoff retry.
 * Only retries on network errors, not on application-level Supabase errors
 * (those indicate bad queries, not transient failures).
 */
export async function withRetry<T>(
  fn: () => PromiseLike<{ data: T; error: unknown }>,
  options: RetryOptions = {},
): Promise<{ data: T; error: unknown }> {
  const { maxAttempts = 3, baseDelay = 1000, backoffFactor = 2 } = options

  let lastResult: { data: T; error: unknown } = { data: null as T, error: null }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastResult = await fn()

      // If we got a response (even with a Supabase error), don't retry —
      // Supabase errors are application-level (bad query, RLS, etc.), not transient.
      return lastResult
    } catch (err) {
      // Network-level failure (fetch failed, timeout, etc.) — retry
      lastResult = { data: null as T, error: err }

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(backoffFactor, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  return lastResult
}
