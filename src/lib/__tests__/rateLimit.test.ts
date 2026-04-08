import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clientRateCheck, clientRateWaitSec } from '../rateLimit'

// The module uses a module-level Map, so we need to use unique keys per test
// or re-import. Using unique keys is simpler.

let keyIdx = 0
function uniqueKey() {
  return `test_${++keyIdx}_${Date.now()}`
}

describe('clientRateCheck', () => {
  it('allows actions under the limit', () => {
    const key = uniqueKey()
    expect(clientRateCheck(key, 3, 60_000)).toBe(true)
    expect(clientRateCheck(key, 3, 60_000)).toBe(true)
    expect(clientRateCheck(key, 3, 60_000)).toBe(true)
  })

  it('blocks at the limit', () => {
    const key = uniqueKey()
    clientRateCheck(key, 2, 60_000)
    clientRateCheck(key, 2, 60_000)
    expect(clientRateCheck(key, 2, 60_000)).toBe(false)
  })

  it('resets after the window expires', () => {
    const key = uniqueKey()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    clientRateCheck(key, 1, 100)
    expect(clientRateCheck(key, 1, 100)).toBe(false)

    // Jump past the window
    vi.spyOn(Date, 'now').mockReturnValue(now + 101)
    expect(clientRateCheck(key, 1, 100)).toBe(true)

    vi.restoreAllMocks()
  })

  it('uses default values (5 max, 60s window)', () => {
    const key = uniqueKey()
    for (let i = 0; i < 5; i++) {
      expect(clientRateCheck(key)).toBe(true)
    }
    expect(clientRateCheck(key)).toBe(false)
  })

  it('tracks different keys independently', () => {
    const a = uniqueKey()
    const b = uniqueKey()
    clientRateCheck(a, 1, 60_000)
    expect(clientRateCheck(a, 1, 60_000)).toBe(false)
    expect(clientRateCheck(b, 1, 60_000)).toBe(true)
  })
})

describe('clientRateWaitSec', () => {
  it('returns 0 for unknown keys', () => {
    expect(clientRateWaitSec('nonexistent_key_xyz')).toBe(0)
  })

  it('returns seconds remaining when limited', () => {
    const key = uniqueKey()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    clientRateCheck(key, 1, 10_000)

    // Still within the window
    vi.spyOn(Date, 'now').mockReturnValue(now + 3_000)
    const wait = clientRateWaitSec(key)
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(7)

    vi.restoreAllMocks()
  })

  it('returns 0 after window expires', () => {
    const key = uniqueKey()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    clientRateCheck(key, 1, 100)

    vi.spyOn(Date, 'now').mockReturnValue(now + 200)
    expect(clientRateWaitSec(key)).toBe(0)

    vi.restoreAllMocks()
  })
})
