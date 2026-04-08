import { useState } from 'react'
import { EventFeed } from '../components/feed/EventFeed'
import type { Category } from '../types'
import { useEvents } from '../context/EventsContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

type Filter = Category | 'todos'

const categories: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'politica', label: 'Política' },
  { id: 'economia', label: 'Economía' },
  { id: 'geopolitica', label: 'Geopolítica' },
  { id: 'cultura', label: 'Cultura' },
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'otro', label: 'Otro' },
]

export function EnVivo() {
  const { events } = useEvents()
  const [categoryFilter, setCategoryFilter] = useState<Filter>('todos')

  const liveEvents = events.filter((e) => e.isLive && e.status !== 'private')
  const totalPool = liveEvents.reduce((s, e) => s + e.poolSize, 0)

  const filtered = liveEvents.filter(
    (e) => categoryFilter === 'todos' || e.category === categoryFilter
  )

  const categoriesWithLive = new Set(liveEvents.map((e) => e.category))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Live header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--b1n0-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--b1n0-text-1)', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontFamily: D, fontWeight: 800, fontSize: '18px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
            En Vivo
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div>
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>Activos ahora</p>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', lineHeight: 1 }}>
              {liveEvents.length}
            </p>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div>
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>Pool total en juego</p>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', lineHeight: 1 }}>
              Q{totalPool.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '7px', padding: '10px 16px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {categories
            .filter((cat) => cat.id === 'todos' || categoriesWithLive.has(cat.id as Category))
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: '7px 14px', borderRadius: '20px', cursor: 'pointer',
                  border: categoryFilter === cat.id ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  background: categoryFilter === cat.id ? 'var(--b1n0-surface)' : 'var(--b1n0-card)',
                  color: categoryFilter === cat.id ? '#fff' : 'var(--b1n0-muted)',
                  fontFamily: F, fontWeight: 600, fontSize: '12px',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {cat.label}
              </button>
            ))}
        </div>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, background: 'linear-gradient(to right, transparent, #F7F4EF)', pointerEvents: 'none' }} />
      </div>

      {/* Feed */}
      <div className="feed-scroll" style={{ flex: 1, padding: '0 16px 16px' }}>
        <EventFeed
          events={filtered}
          emptyMessage={categoryFilter === 'todos'
            ? 'No hay votos en vivo en este momento.'
            : 'No hay votos en vivo en esta categoría ahora.'}
        />
      </div>
    </div>
  )
}
