/**
 * Shimmer placeholder components for loading states.
 * Matches b1n0 dark theme and card layout dimensions.
 */

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--b1n0-card) 25%, var(--b1n0-surface) 50%, var(--b1n0-card) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: '8px',
}

/** A single rectangular shimmer block */
export function SkeletonBlock({ width = '100%', height = '16px', style }: {
  width?: string
  height?: string
  style?: React.CSSProperties
}) {
  return <div style={{ ...shimmerStyle, width, height, ...style }} />
}

/** Skeleton for an event card in the feed */
export function SkeletonEventCard() {
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <SkeletonBlock width="50%" height="12px" />
      <SkeletonBlock width="90%" height="18px" />
      <SkeletonBlock width="70%" height="14px" />
      <SkeletonBlock width="100%" height="32px" style={{ borderRadius: '16px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <SkeletonBlock width="40%" height="12px" />
        <SkeletonBlock width="30%" height="12px" />
      </div>
    </div>
  )
}

/** Skeleton for the featured hero card */
export function SkeletonHeroCard() {
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: '20px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <SkeletonBlock width="100%" height="140px" style={{ borderRadius: '14px' }} />
      <SkeletonBlock width="30%" height="12px" />
      <SkeletonBlock width="85%" height="20px" />
      <SkeletonBlock width="100%" height="36px" style={{ borderRadius: '18px' }} />
    </div>
  )
}

/** Skeleton for a prediction card */
export function SkeletonPredictionCard() {
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SkeletonBlock width="80px" height="20px" style={{ borderRadius: '20px' }} />
        <SkeletonBlock width="40px" height="14px" />
      </div>
      <SkeletonBlock width="90%" height="16px" />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SkeletonBlock width="35%" height="14px" />
        <SkeletonBlock width="35%" height="14px" />
      </div>
    </div>
  )
}

/** Loading state for a full feed (hero + grid) */
export function SkeletonFeed() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
      <SkeletonHeroCard />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <SkeletonEventCard />
        <SkeletonEventCard />
        <SkeletonEventCard />
        <SkeletonEventCard />
      </div>
    </div>
  )
}
