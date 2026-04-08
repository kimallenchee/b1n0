/**
 * Input validation helpers for b1n0.
 *
 * Centralises every user-facing validation rule so components stay thin
 * and the rules are easy to test and audit before launch.
 */

// ── Result type ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean
  /** Spanish-language error message when ok === false */
  error?: string
}

const ok: ValidationResult = { ok: true }
const fail = (error: string): ValidationResult => ({ ok: false, error })

// ── Phone ────────────────────────────────────────────────────────────────────

/** Guatemalan (502), Salvadoran (503), or Honduran (504) phone number. */
const CA_PHONE = /^\+?(502|503|504)\d{8}$/

export function validatePhone(raw: string): ValidationResult {
  const digits = raw.replace(/[\s\-()]/g, '')
  if (!digits) return fail('Ingresá tu número de teléfono.')
  if (!CA_PHONE.test(digits)) return fail('Número inválido. Usá formato: +502 1234 5678')
  return ok
}

// ── Email ────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(raw: string): ValidationResult {
  const trimmed = raw.trim()
  if (!trimmed) return fail('Ingresá tu correo electrónico.')
  if (!EMAIL.test(trimmed)) return fail('Correo electrónico inválido.')
  return ok
}

// ── Password ─────────────────────────────────────────────────────────────────

export function validatePassword(pw: string): ValidationResult {
  if (pw.length < 6) return fail('Mínimo 6 caracteres.')
  if (pw.length > 128) return fail('Máximo 128 caracteres.')
  return ok
}

export function validatePasswordMatch(pw: string, confirm: string): ValidationResult {
  const pwResult = validatePassword(pw)
  if (!pwResult.ok) return pwResult
  if (pw !== confirm) return fail('Las contraseñas no coinciden.')
  return ok
}

// ── Display name ─────────────────────────────────────────────────────────────

export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim()
  if (!trimmed) return fail('Ingresá tu nombre.')
  if (trimmed.length < 2) return fail('Nombre muy corto.')
  if (trimmed.length > 40) return fail('Máximo 40 caracteres.')
  return ok
}

// ── Entry amount (prediction) ────────────────────────────────────────────────

export interface EntryLimits {
  min: number
  max: number
  balance: number
  currency: 'Q' | '$'
}

export function validateEntryAmount(raw: string, limits: EntryLimits): ValidationResult {
  const { min, max, balance, currency } = limits

  if (!raw || raw.trim() === '') return fail('Ingresá un monto.')

  const amount = Number(raw)
  if (isNaN(amount) || !isFinite(amount)) return fail('Monto inválido.')
  if (amount <= 0) return fail('El monto debe ser mayor a 0.')
  if (amount < min) return fail(`Mínimo ${currency}${min}.`)
  if (amount > max) return fail(`Máximo ${currency}${max} para tu nivel.`)
  if (amount > balance) return fail('Saldo insuficiente.')

  // Only allow up to 2 decimal places
  const parts = raw.split('.')
  if (parts.length === 2 && parts[1].length > 2) return fail('Máximo 2 decimales.')

  return ok
}

// ── DPI (Guatemala ID — Documento Personal de Identificación) ────────────────

const DPI = /^\d{4}\s?\d{5}\s?\d{4}$/

export function validateDPI(raw: string): ValidationResult {
  const cleaned = raw.replace(/[\s\-]/g, '')
  if (!cleaned) return fail('Ingresá tu número de DPI.')
  if (!DPI.test(raw.trim()) && !/^\d{13}$/.test(cleaned)) return fail('DPI inválido. Debe tener 13 dígitos.')
  return ok
}

// ── Age gate ─────────────────────────────────────────────────────────────────

export function validateAge(birthDate: Date): ValidationResult {
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  if (age < 18) return fail('Debés ser mayor de 18 años.')
  if (age > 120) return fail('Fecha de nacimiento inválida.')
  return ok
}

// ── Generic helpers ──────────────────────────────────────────────────────────

/** Trim + collapse whitespace. Useful before saving any text input. */
export function sanitizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** True when the string contains only digits (for numeric-only inputs). */
export function isDigitsOnly(s: string): boolean {
  return /^\d+$/.test(s)
}
