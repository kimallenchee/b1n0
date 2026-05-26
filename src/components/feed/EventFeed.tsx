import type { Event } from '../../types'
import { EventCard } from './EventCard'

interface EventFeedProps {
  events: Event[]
  emptyMessage?: string
}

export function EventFeed({ events, emptyMessage }: EventFeedProps) {
  if (events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚡</div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--b1n0-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {emptyMessage || 'No hay votos activos. Volvé más tarde — esto se pone bueno.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {events.map((event) => (
        <div key={event.id}>
          <EventCard event={event} />
        </div>
      ))}
    </div>
  )
}
