/**
 * Reusable empty state component for when there's no data to show.
 * Consistent look across all b1n0 pages.
 */

interface EmptyStateProps {
  /** Emoji or icon character */
  icon?: string
  /** Primary message */
  title: string
  /** Secondary descriptive text */
  subtitle?: string
  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon = '📭', title, subtitle, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        minHeight: '200px',
      }}
    >
      <span style={{ fontSize: '36px', marginBottom: '12px' }}>{icon}</span>
      <p
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--b1n0-text-1)',
          marginBottom: '6px',
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '13px',
            color: 'var(--b1n0-muted)',
            maxWidth: '280px',
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: '16px',
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            background: '#4ade80',
            color: '#fff',
            fontFamily: '"DM Sans", sans-serif',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/**
 * Error state with retry button.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Algo salió mal"
      subtitle={message}
      action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
    />
  )
}
