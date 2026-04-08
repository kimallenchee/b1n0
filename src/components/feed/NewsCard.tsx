import type { NewsArticle } from '../../types'

interface NewsCardProps {
  article: NewsArticle
  onBridgeTap?: () => void
}

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const countryFlags: Record<string, string> = { GT: '🇬🇹', SV: '🇸🇻', HN: '🇭🇳' }

export function NewsCard({ article, onBridgeTap }: NewsCardProps) {
  const flag = article.country ? countryFlags[article.country] || '' : ''

  const card = (
    <div className="news-card" style={{ padding: 0, overflow: 'hidden', cursor: article.url ? 'pointer' : undefined }}>
      {/* Hero image */}
      {article.imageUrl && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden' }}>
          <img
            src={article.imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Gradient overlay for readability */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          }} />
          {/* Country + source on image */}
          <div style={{ position: 'absolute', top: '10px', left: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {flag && <span style={{ fontSize: '14px', filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.12))' }}>{flag}</span>}
            <span style={{
              fontFamily: F, fontSize: '10px', fontWeight: 600, color: '#fff',
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
              padding: '3px 8px', borderRadius: '6px',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {article.source}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '14px 16px 16px' }}>
        {/* Meta row (when no image) */}
        {!article.imageUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            {flag && <span style={{ fontSize: '12px' }}>{flag}</span>}
            <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {article.category}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{article.source}</span>
            <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{article.timeAgo}</span>
          </div>
        )}

        {/* Headline */}
        <h3 style={{
          fontFamily: D, fontWeight: 700, fontSize: '17px',
          color: 'var(--b1n0-text-1)', lineHeight: 1.35, marginBottom: '6px',
        }}>
          {article.headline}
        </h3>

        {/* Time ago + category (when image present) */}
        {article.imageUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: article.relatedEventId ? '12px' : 0 }}>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{article.timeAgo}</span>
            <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
            <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {article.category}
            </span>
          </div>
        )}

        {/* Bridge tag */}
        {article.relatedEventId && (
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBridgeTap?.() }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', borderRadius: '8px', marginTop: '8px',
              border: '1px solid rgba(20,184,166,0.25)',
              background: 'rgba(20,184,166,0.06)',
              cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '14px' }}>💡</span>
            <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: '#4ade80', flex: 1 }}>
              Hay un voto relacionado
            </span>
            <span style={{ fontFamily: F, fontSize: '12px', color: '#4ade80' }}>↓</span>
          </button>
        )}
      </div>
    </div>
  )

  if (article.url) {
    return (
      <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
        {card}
      </a>
    )
  }

  return card
}
