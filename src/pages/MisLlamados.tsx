import type { UserPrediction } from '../types'
import { useVotes } from '../context/VoteContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

function PredictionCard({ prediction }: { prediction: UserPrediction }) {
  const isActive = prediction.status === 'active'
  const isWon = prediction.status === 'won'

  return (
    <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderLeft: `3px solid ${isWon ? 'var(--b1n0-surface)' : isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '16px', padding: '18px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: isActive ? 'rgba(255,255,255,0.04)' : isWon ? 'rgba(255,255,255,0.06)' : 'transparent', color: isActive ? 'var(--b1n0-muted)' : isWon ? 'var(--b1n0-surface)' : 'var(--b1n0-muted)' }}>
          {isActive ? 'En juego' : isWon ? '¡Lo sabías!' : 'Esta vez no'}
        </span>
        <span style={{ fontFamily: D, fontWeight: 800, fontSize: '13px', color: prediction.side.includes('yes') ? 'var(--b1n0-surface)' : 'var(--b1n0-muted)' }}>
          {prediction.side.includes('::')
            ? `${prediction.side.split('::')[0]} — ${prediction.side.split('::')[1] === 'yes' ? 'SÍ' : 'NO'}`
            : prediction.side === 'yes' ? 'SÍ' : 'NO'}
        </span>
      </div>

      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '15px', color: 'var(--b1n0-text-1)', lineHeight: 1.35, marginBottom: '6px' }}>
        {prediction.event.question}
      </p>

      {/* Selection made */}
      <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-2)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px' }}>→</span>
        Tu voto: <span style={{ fontWeight: 700 }}>
          {prediction.side.includes('::')
            ? `${prediction.side.split('::')[0]} ${prediction.side.split('::')[1] === 'yes' ? 'SÍ' : 'NO'}`
            : prediction.side === 'yes' ? 'SÍ' : 'NO'}
        </span>
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>Participación</p>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
            {prediction.event.currency}{prediction.amount.toFixed(2)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>
            {isWon ? 'Cobrado' : isActive ? 'Cobro posible' : 'Fondos'}
          </p>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
            {isWon
              ? `${prediction.event.currency}${prediction.potentialCobro.toFixed(2)}`
              : isActive
              ? `${prediction.event.currency}${prediction.potentialCobro.toFixed(2)}`
              : `−${prediction.event.currency}${prediction.amount.toFixed(2)}`}
          </p>
        </div>
      </div>
    </div>
  )
}

export function MisVotos() {
  const { predictions } = useVotes()
  // Debug log removed
  const allPredictions = predictions
  const active = allPredictions.filter((p) => p.status === 'active')
  const resolved = allPredictions.filter((p) => p.status !== 'active')

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 16px' }}>
      {active.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Fondos en juego
          </p>
          {active.map((p) => <PredictionCard key={p.id} prediction={p} />)}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Historial de cobros
          </p>
          {resolved.map((p) => <PredictionCard key={p.id} prediction={p} />)}
        </div>
      )}

      {allPredictions.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', textAlign: 'center' }}>
          <p style={{ fontFamily: D, fontSize: '15px', color: 'var(--b1n0-muted)', fontStyle: 'italic' }}>
            Todavía no hiciste ningún voto. ¡Empezá ya!
          </p>
        </div>
      )}
    </div>
  )
}
