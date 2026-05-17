/**
 * LastUpdated — small subtle indicator showing when the current
 * page's data was last refreshed. Sits near the top of live-data
 * pages (Inicio, Portafolio) and snapshot pages (Historial) to
 * signal "we know what time it is, the data is fresh."
 *
 * Two variants:
 *   - "rolling"   → "Actualizado hace Xs / Xm" (re-ticks every 5s)
 *     For live-data pages where the user wants to know how stale
 *     things are right now (Inicio, Portafolio).
 *   - "timestamp" → "Actualizado a las HH:mm"
 *     For snapshot pages where the moment of the snapshot is more
 *     meaningful than the elapsed time (Historial).
 *
 * Why a single component (not just inline text per page):
 *   - Single source of truth for the "hace X" formatting
 *   - One place to retune cadence / wording later
 *   - Same visual treatment everywhere so users recognize the chrome
 */

import { useEffect, useState } from 'react'

interface LastUpdatedProps {
  /** Date.now() of the most recent successful data fetch. Null = no fetch yet. */
  timestamp: number | null
  /** Display format. Default 'rolling'. */
  variant?: 'rolling' | 'timestamp'
}

export function LastUpdated({ timestamp, variant = 'rolling' }: LastUpdatedProps) {
  // Re-render every 5 seconds so the "hace X" string stays fresh.
  // 5s is the sweet spot: cheap enough to ignore, fast enough that
  // users don't see "hace 0s" frozen on a still page.
  const [, force] = useState(0)
  useEffect(() => {
    if (variant !== 'rolling') return
    const id = setInterval(() => force((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [variant])

  if (!timestamp) return null

  let label: string
  if (variant === 'timestamp') {
    const t = new Date(timestamp)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    label = `Actualizado a las ${hh}:${mm}`
  } else {
    label = `Actualizado ${formatRelative(timestamp)}`
  }

  return (
    <p
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        color: 'var(--b1n0-muted)',
        margin: 0,
        opacity: 0.75,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Pulse />
      {label}
    </p>
  )
}

// Subtle pulsing dot — same visual vocabulary as the LiveDot on
// event cards. Signals "this is live data" without text.
function Pulse() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--b1n0-si)',
        opacity: 0.8,
        animation: 'b1n0LastUpdatedPulse 2.4s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes b1n0LastUpdatedPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50%      { opacity: 0.3; transform: scale(0.85); }
        }
      `}</style>
    </span>
  )
}

// ── Relative-time formatter (es-GT voseo) ─────────────────────
function formatRelative(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 5) return 'hace un instante'
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}
