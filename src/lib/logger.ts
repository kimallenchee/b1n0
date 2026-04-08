/**
 * Structured logger for b1n0.
 *
 * In development: logs to console with context.
 * In production: sends errors to Sentry (when configured)
 * and provides structured JSON output for any log aggregator.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Purchase completed', { eventId, amount, userId })
 *   logger.error('RPC failed', { rpc: 'execute_purchase', error })
 *   logger.warn('Rate limited', { userId, action: 'purchase' })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

const IS_PROD = import.meta.env.PROD
const IS_DEV = import.meta.env.DEV

// ── Sentry integration (lazy-loaded) ─────────────────────────────

let sentryLoaded = false
let Sentry: {
  captureException: (err: unknown, ctx?: unknown) => void
  captureMessage: (msg: string, level?: string) => void
  setUser: (user: { id: string; email?: string } | null) => void
  init: (config: Record<string, unknown>) => void
} | null = null

/**
 * Call once at app startup (main.tsx) with your Sentry DSN.
 * If no DSN is provided, Sentry is skipped silently.
 */
export async function initMonitoring(dsn?: string) {
  if (!dsn || sentryLoaded) return

  try {
    // Dynamic import — Sentry is only loaded if DSN is configured
    const mod = await import('@sentry/react')
    Sentry = mod as any
    Sentry!.init({
      dsn,
      environment: IS_PROD ? 'production' : 'development',
      tracesSampleRate: IS_PROD ? 0.2 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: IS_PROD ? 1.0 : 0,
    })
    sentryLoaded = true
  } catch {
    // Sentry not installed — that's fine, just log locally
    if (IS_DEV) console.warn('[logger] @sentry/react not installed — errors will only log to console')
  }
}

/**
 * Set user context for error tracking.
 * Call after login, clear on logout.
 */
export function setMonitoringUser(user: { id: string; email?: string } | null) {
  Sentry?.setUser(user)
}

// ── Core logging ─────────────────────────────────────────────────

function formatEntry(entry: LogEntry): string {
  if (IS_DEV) {
    // Human-readable in development
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    return `[${entry.level.toUpperCase()}] ${entry.message}${ctx}`
  }
  // Structured JSON in production (for log aggregators)
  return JSON.stringify(entry)
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  }

  const formatted = formatEntry(entry)

  switch (level) {
    case 'debug':
      if (IS_DEV) console.debug(formatted)
      break
    case 'info':
      console.info(formatted)
      break
    case 'warn':
      console.warn(formatted)
      if (Sentry) Sentry.captureMessage(message, 'warning')
      break
    case 'error':
      console.error(formatted)
      if (Sentry && context?.error) {
        Sentry.captureException(context.error, { extra: context })
      } else if (Sentry) {
        Sentry.captureMessage(message, 'error')
      }
      break
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
}
