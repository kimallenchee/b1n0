import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '../retry'

describe('withRetry', () => {
  it('returns data on first success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: 'ok', error: null })
    const result = await withRetry(fn)
    expect(result.data).toBe('ok')
    expect(result.error).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry Supabase application errors', async () => {
    // Supabase returns { data: null, error: { message: '...' } } for bad queries
    const fn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RLS violation' },
    })
    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10 })
    expect(result.error).toEqual({ message: 'RLS violation' })
    // Should NOT retry — application errors are not transient
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on network errors (throw)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ data: 'recovered', error: null })

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10 })
    expect(result.data).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('returns last error after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await withRetry(fn, { maxAttempts: 2, baseDelay: 10 })
    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect((result.error as Error).message).toBe('network down')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('uses exponential backoff delays', async () => {
    const delays: number[] = []
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms: number) => {
      delays.push(ms)
      return originalSetTimeout(fn, 0) // execute immediately for test speed
    }) as typeof setTimeout)

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue({ data: 'ok', error: null })

    await withRetry(fn, { maxAttempts: 3, baseDelay: 100, backoffFactor: 2 })

    // First retry: 100 * 2^0 = 100ms
    // Second retry: 100 * 2^1 = 200ms
    expect(delays[0]).toBe(100)
    expect(delays[1]).toBe(200)

    vi.restoreAllMocks()
  })

  it('defaults to 3 attempts, 1000ms base, factor 2', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await withRetry(fn)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects custom maxAttempts = 1 (no retry)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await withRetry(fn, { maxAttempts: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
