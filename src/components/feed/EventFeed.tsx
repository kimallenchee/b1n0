import { useRef } from 'react'
import type { Event, NewsArticle } from '../../types'
import { EventCard } from './EventCard'
import { NewsCard } from './NewsCard'

interface EventFeedProps {
  events: Event[]
  news?: NewsArticle[]
  emptyMessage?: string
}

// Interleave: 2 news, then 1 event, repeat
function buildFeed(events: Event[], news: NewsArticle[]): Array<{ type: 'news'; item: NewsArticle } | { type: 'event'; item: Event }> {
  const feed: Array<{ type: 'news'; item: NewsArticle } | { type: 'event'; item: Event }> = []
  let ni = 0
  let ei = 0
  while (ni < news.length || ei < events.length) {
    if (ni < news.length) feed.push({ type: 'news', item: news[ni++] })
    if (ni < news.length) feed.push({ type: 'news', item: news[ni++] })
    if (ei < events.length) feed.push({ type: 'event', item: events[ei++] })
  }
  return feed
}

export function EventFeed({ events, news = [], emptyMessage }: EventFeedProps) {
  const eventRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const scrollToEvent = (eventId: string) => {
    eventRefs.current[eventId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (events.length === 0 && news.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚡</div>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '15px', color: 'var(--b1n0-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {emptyMessage || 'No hay votos activos. Volvé más tarde — esto se pone bueno.'}
        </p>
      </div>
    )
  }

  if (news.length === 0) {
    return (
      <div>
        {events.map((event) => (
          <div key={event.id} ref={(el) => { eventRefs.current[event.id] = el }}>
            <EventCard event={event} />
          </div>
        ))}
      </div>
    )
  }

  const feed = buildFeed(events, news)

  return (
    <div>
      {feed.map((item, i) => {
        if (item.type === 'news') {
          return (
            <NewsCard
              key={`n-${item.item.id}-${i}`}
              article={item.item}
              onBridgeTap={item.item.relatedEventId ? () => scrollToEvent(item.item.relatedEventId!) : undefined}
            />
          )
        }
        return (
          <div key={`e-${item.item.id}`} ref={(el) => { eventRefs.current[item.item.id] = el }}>
            <EventCard event={item.item} />
          </div>
        )
      })}
    </div>
  )
}
