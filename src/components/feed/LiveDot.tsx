export function LiveDot() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <span className="live-dot" />
      <span
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--b1n0-text-1)',
        }}
      >
        En vivo
      </span>
    </div>
  )
}
