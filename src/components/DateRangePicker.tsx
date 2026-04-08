import { useState } from 'react'

const F = '"DM Sans", sans-serif'

export interface DateRange {
  from: string
  to: string
}

export function withinDateRange(date: string | undefined, range: DateRange): boolean {
  if (!date) return true
  if (!range.from && !range.to) return true
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

function fmt(d: string): string {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${parseInt(day)} ${months[parseInt(m) - 1]}`
}

interface Props {
  value: DateRange
  onChange: (v: DateRange) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const hasRange = value.from || value.to
  const label = hasRange
    ? `${value.from ? fmt(value.from) : '—'} → ${value.to ? fmt(value.to) : '—'}`
    : 'Fechas'

  const clear = () => { onChange({ from: '', to: '' }); setOpen(false) }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        />
      )}

      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 11px', borderRadius: '20px', cursor: 'pointer',
          fontFamily: F, fontWeight: hasRange ? 600 : 500, fontSize: '11px',
          border: hasRange ? 'none' : '1px solid rgba(255,255,255,0.08)',
          background: hasRange ? 'var(--b1n0-surface)' : 'var(--b1n0-card)',
          color: hasRange ? '#fff' : 'var(--b1n0-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {label}
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
            background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
            borderRadius: '14px', padding: '14px 16px',
            boxShadow: '0 6px 20px var(--b1n0-border)',
            minWidth: '240px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                Desde
              </p>
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)', background: 'var(--b1n0-bg)',
                  fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                Hasta
              </p>
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)', background: 'var(--b1n0-bg)',
                  fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              {hasRange && (
                <button
                  onClick={clear}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 500, fontSize: '12px', color: 'var(--b1n0-muted)' }}
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
