import { ArrowClockwise } from '@phosphor-icons/react'

/**
 * PullIndicator — visual feedback for usePullToRefresh.
 *
 * Renders an arrow that rotates as the user pulls past threshold,
 * then swaps to a spinning refresh icon while the refresh is in flight.
 * Sized so it sits comfortably above the first feed card without
 * displacing layout when at rest.
 */
export function PullIndicator({
  distance,
  refreshing,
  threshold,
}: {
  distance: number
  refreshing: boolean
  threshold: number
}) {
  const visible = distance > 4 || refreshing
  const past = distance >= threshold || refreshing
  const opacity = Math.min(distance / threshold, 1)
  const rotation = past ? 180 : Math.min((distance / threshold) * 180, 180)

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: distance,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity,
        transition: refreshing ? 'height var(--duration-base) var(--ease-out)' : 'none',
        zIndex: 5,
      }}
    >
      <ArrowClockwise
        size={20}
        weight={past ? 'bold' : 'regular'}
        color={past ? 'var(--b1n0-si)' : 'var(--b1n0-muted)'}
        style={{
          transform: `rotate(${refreshing ? 0 : rotation}deg)`,
          transition: refreshing
            ? 'none'
            : 'transform 0.18s var(--ease-out), color 0.15s var(--ease-out)',
          animation: refreshing ? 'p2r-spin 0.9s linear infinite' : 'none',
        }}
      />
      <style>{`
        @keyframes p2r-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
