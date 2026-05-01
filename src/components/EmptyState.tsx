import type { ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'

/**
 * Empty state component — used when there's no data to show.
 *
 * Two ways to use:
 *   1) Pass `illustration` for a custom inline SVG (preferred for the
 *      brand surfaces — feed, leaderboard, portfolio).
 *   2) Pass `icon` for a single Phosphor icon as a fallback (admin
 *      panels, internal tooling, places where personality is overkill).
 *
 * The illustration is rendered inside a 96x96 box that respects the
 * theme — use currentColor in the SVG's strokes/fills and they'll
 * pick up the parent text color, so the same illustration works in
 * dark and light without forking.
 */

interface EmptyStateProps {
  illustration?: ReactNode
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ illustration, icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-9) var(--space-7)',
        textAlign: 'center',
        minHeight: '240px',
      }}
    >
      {illustration ? (
        <div
          style={{
            width: 110,
            height: 110,
            marginBottom: 'var(--space-5)',
            color: 'var(--b1n0-muted)',
          }}
        >
          {illustration}
        </div>
      ) : icon ? (
        <div style={{ marginBottom: 'var(--space-5)', color: 'var(--b1n0-muted)' }}>{icon}</div>
      ) : (
        <DefaultIllustration />
      )}
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-md)',
          fontWeight: 700,
          color: 'var(--b1n0-text-1)',
          marginBottom: 'var(--space-2)',
          letterSpacing: 'var(--tracking-tight)',
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--b1n0-muted)',
            maxWidth: '320px',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          {subtitle}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary"
          style={{ marginTop: 'var(--space-5)' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/**
 * Default illustration — a hand-drawn-feeling stadium with empty stands.
 * Conveys "the game hasn't started yet" without being culturally
 * specific. Uses currentColor so it inherits the parent's text color
 * (we set var(--b1n0-muted) on the wrapper above, so strokes are
 * appropriately quiet).
 *
 * Why inline SVG instead of an image asset:
 *   1) Theme-aware via currentColor — works in dark and light without
 *      shipping two PNGs.
 *   2) Crisp at any DPI without 2x/3x assets.
 *   3) ~1KB instead of ~30KB for an equivalent PNG.
 *   4) Editable as code, not as a Figma file you have to find again later.
 */
function DefaultIllustration() {
  return (
    <div
      style={{
        width: 120,
        height: 120,
        marginBottom: 'var(--space-5)',
        color: 'var(--b1n0-muted)',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 120"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Field outline — perspective-skewed rectangle */}
        <path d="M20 90 L100 90 L92 60 L28 60 Z" opacity="0.7" />
        {/* Center circle */}
        <ellipse cx="60" cy="75" rx="14" ry="6" opacity="0.5" />
        {/* Center line */}
        <line x1="29" y1="75" x2="91" y2="75" opacity="0.35" strokeDasharray="2 3" />
        {/* Goal posts (left + right) */}
        <path d="M28 60 L28 50 L40 50 L40 60" opacity="0.85" />
        <path d="M92 60 L92 50 L80 50 L80 60" opacity="0.85" />
        {/* Empty stands — three rows of dashes */}
        <line x1="14" y1="40" x2="106" y2="40" strokeDasharray="3 4" opacity="0.55" />
        <line x1="18" y1="32" x2="102" y2="32" strokeDasharray="3 4" opacity="0.4" />
        <line x1="22" y1="24" x2="98" y2="24" strokeDasharray="3 4" opacity="0.28" />
        {/* Ball — single dot, in the center */}
        <circle cx="60" cy="75" r="2.4" fill="currentColor" stroke="none" opacity="0.9" />
        {/* Subtle "live dot" off to the side, indicating future motion */}
        <circle cx="100" cy="20" r="2" fill="var(--b1n0-si)" stroke="none" opacity="0.6">
          <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.4s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  )
}

/**
 * Error state — uses Phosphor's Warning icon. Errors are functional,
 * not brand moments — keep it terse, give the user a way out.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<Warning size={56} weight="regular" color="var(--b1n0-no)" />}
      title="Algo salió mal"
      subtitle={message}
      action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
    />
  )
}
