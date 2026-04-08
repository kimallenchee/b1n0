import { describe, it, expect } from 'vitest'
import {
  validatePhone,
  validateEmail,
  validatePassword,
  validatePasswordMatch,
  validateDisplayName,
  validateEntryAmount,
  validateDPI,
  validateAge,
  sanitizeText,
  isDigitsOnly,
} from '../validate'

// ── Phone ──────────────────────────────────────────────────────────────────

describe('validatePhone', () => {
  it('accepts valid Guatemala numbers', () => {
    expect(validatePhone('+50212345678').ok).toBe(true)
    expect(validatePhone('50212345678').ok).toBe(true)
  })

  it('accepts valid El Salvador numbers', () => {
    expect(validatePhone('+50312345678').ok).toBe(true)
  })

  it('accepts valid Honduras numbers', () => {
    expect(validatePhone('+50412345678').ok).toBe(true)
  })

  it('strips spaces and dashes before validating', () => {
    expect(validatePhone('+502 1234 5678').ok).toBe(true)
    expect(validatePhone('502-1234-5678').ok).toBe(true)
  })

  it('rejects empty input', () => {
    const r = validatePhone('')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('número')
  })

  it('rejects non-CA country codes', () => {
    expect(validatePhone('+12125551234').ok).toBe(false)
    expect(validatePhone('+52155512345678').ok).toBe(false)
  })

  it('rejects too few digits', () => {
    expect(validatePhone('+5021234567').ok).toBe(false)
  })

  it('rejects too many digits', () => {
    expect(validatePhone('+502123456789').ok).toBe(false)
  })
})

// ── Email ──────────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com').ok).toBe(true)
    expect(validateEmail('a.b+tag@sub.domain.co').ok).toBe(true)
  })

  it('rejects empty', () => {
    expect(validateEmail('').ok).toBe(false)
  })

  it('rejects missing @', () => {
    expect(validateEmail('userexample.com').ok).toBe(false)
  })

  it('rejects missing TLD', () => {
    expect(validateEmail('user@example').ok).toBe(false)
  })
})

// ── Password ──────────────────────────────────────────────────────────────

describe('validatePassword', () => {
  it('accepts 6+ chars', () => {
    expect(validatePassword('abc123').ok).toBe(true)
    expect(validatePassword('a'.repeat(128)).ok).toBe(true)
  })

  it('rejects under 6 chars', () => {
    expect(validatePassword('12345').ok).toBe(false)
  })

  it('rejects over 128 chars', () => {
    expect(validatePassword('a'.repeat(129)).ok).toBe(false)
  })
})

describe('validatePasswordMatch', () => {
  it('passes when both valid and matching', () => {
    expect(validatePasswordMatch('abc123', 'abc123').ok).toBe(true)
  })

  it('fails when passwords differ', () => {
    const r = validatePasswordMatch('abc123', 'abc124')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no coinciden')
  })

  it('fails when password itself is invalid', () => {
    expect(validatePasswordMatch('12', '12').ok).toBe(false)
  })
})

// ── Display name ──────────────────────────────────────────────────────────

describe('validateDisplayName', () => {
  it('accepts normal names', () => {
    expect(validateDisplayName('Kim').ok).toBe(true)
    expect(validateDisplayName('María José').ok).toBe(true)
  })

  it('rejects empty', () => {
    expect(validateDisplayName('').ok).toBe(false)
    expect(validateDisplayName('   ').ok).toBe(false)
  })

  it('rejects single char', () => {
    expect(validateDisplayName('K').ok).toBe(false)
  })

  it('rejects over 40 chars', () => {
    expect(validateDisplayName('a'.repeat(41)).ok).toBe(false)
  })
})

// ── Entry amount ──────────────────────────────────────────────────────────

describe('validateEntryAmount', () => {
  const limits = { min: 10, max: 500, balance: 200, currency: 'Q' as const }

  it('accepts valid amounts', () => {
    expect(validateEntryAmount('50', limits).ok).toBe(true)
    expect(validateEntryAmount('10', limits).ok).toBe(true)
    expect(validateEntryAmount('200', limits).ok).toBe(true)
  })

  it('accepts amounts with 2 decimals', () => {
    expect(validateEntryAmount('50.25', limits).ok).toBe(true)
  })

  it('rejects empty', () => {
    expect(validateEntryAmount('', limits).ok).toBe(false)
  })

  it('rejects non-numeric', () => {
    expect(validateEntryAmount('abc', limits).ok).toBe(false)
  })

  it('rejects zero', () => {
    expect(validateEntryAmount('0', limits).ok).toBe(false)
  })

  it('rejects negative', () => {
    expect(validateEntryAmount('-10', limits).ok).toBe(false)
  })

  it('rejects below min', () => {
    const r = validateEntryAmount('5', limits)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Mínimo')
  })

  it('rejects above max', () => {
    const r = validateEntryAmount('501', limits)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Máximo')
  })

  it('rejects above balance', () => {
    const r = validateEntryAmount('201', limits)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('insuficiente')
  })

  it('rejects more than 2 decimal places', () => {
    const r = validateEntryAmount('50.123', limits)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('decimales')
  })

  it('uses correct currency in error messages', () => {
    const usdLimits = { ...limits, currency: '$' as const }
    const r = validateEntryAmount('5', usdLimits)
    expect(r.error).toContain('$10')
  })
})

// ── DPI ───────────────────────────────────────────────────────────────────

describe('validateDPI', () => {
  it('accepts valid 13-digit DPIs', () => {
    expect(validateDPI('1234567890123').ok).toBe(true)
    expect(validateDPI('1234 56789 0123').ok).toBe(true)
  })

  it('rejects empty', () => {
    expect(validateDPI('').ok).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(validateDPI('123456789012').ok).toBe(false)
    expect(validateDPI('12345678901234').ok).toBe(false)
  })
})

// ── Age gate ──────────────────────────────────────────────────────────────

describe('validateAge', () => {
  it('accepts 18+', () => {
    const eighteenYearsAgo = new Date()
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18)
    eighteenYearsAgo.setDate(eighteenYearsAgo.getDate() - 1) // safely past 18
    expect(validateAge(eighteenYearsAgo).ok).toBe(true)
  })

  it('rejects under 18', () => {
    const sixteenYearsAgo = new Date()
    sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16)
    const r = validateAge(sixteenYearsAgo)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('18')
  })

  it('rejects impossible age', () => {
    const ancient = new Date(1800, 0, 1)
    expect(validateAge(ancient).ok).toBe(false)
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('')
  })
})

describe('isDigitsOnly', () => {
  it('returns true for digit strings', () => {
    expect(isDigitsOnly('12345')).toBe(true)
  })

  it('returns false for non-digits', () => {
    expect(isDigitsOnly('12.3')).toBe(false)
    expect(isDigitsOnly('abc')).toBe(false)
    expect(isDigitsOnly('')).toBe(false)
  })
})
