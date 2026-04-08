import { useState } from 'react'
import { mockUser } from '../../data/mockEvents'
import { DepositSheet } from '../wallet/DepositSheet'
import { RetiroSheet } from '../wallet/RetiroSheet'
import { KYCSheet } from '../wallet/KYCSheet'
import { useVotes } from '../../context/VoteContext'
import { useNow } from '../../context/NowContext'
import { useAuth } from '../../context/AuthContext'
import { useEvents } from '../../context/EventsContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const categoryShort: Record<string, string> = {
  deportes: 'DEP', politica: 'POL', economia: 'ECO', geopolitica: 'GEO',
  cultura: 'CUL', tecnologia: 'TEC', finanzas: 'FIN', otro: 'OTR',
}

export function RightPanel() {
  const { profile } = useAuth()
  const user = profile
    ? { ...mockUser, name: profile.name, tier: profile.tier, balance: profile.balance }
    : mockUser
  const { balance, predictions } = useVotes()
  const { events } = useEvents()
  const now = useNow()
  const [depositOpen, setDepositOpen] = useState(false)
  const [retiroOpen, setRetiroOpen] = useState(false)
  const [kycOpen, setKycOpen] = useState(false)

  // Compute stats from positions (predictions = individual positions from VoteContext)
  const totalVotes = predictions.length
  const won = predictions.filter((p) => p.status === 'won')
  const resolved = predictions.filter((p) => p.status !== 'active')
  const correctVotes = won.length
  const accuracy = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0
  const historicalPL = resolved.reduce((s, p) =>
    p.status === 'won' ? s + (p.potentialCobro - p.amount) : s - p.amount, 0)
  const activeBets = predictions.filter((p) => p.status === 'active')
  const totalAtRisk = activeBets.reduce((s, p) => s + p.amount, 0)

  const endingSoon = events
    .filter((e) => e.endsAt && new Date(e.endsAt).getTime() - now <= 48 * 3600 * 1000 && new Date(e.endsAt).getTime() > now)
    .sort((a, b) => new Date(a.endsAt!).getTime() - new Date(b.endsAt!).getTime())
    .slice(0, 3)

  return (
    <div style={{ width: 280, height: '100dvh', overflowY: 'auto', padding: '16px 16px 32px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid rgba(255,255,255,0.04)', scrollbarWidth: 'none' }}>

      {/* Balance */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '18px' }}>
        <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Saldo</p>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '30px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px', marginBottom: '14px', lineHeight: 1 }}>
          Q{balance.toLocaleString()}
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setDepositOpen(true)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}>
            Depositar
          </button>
          <button onClick={() => setRetiroOpen(true)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 500, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>
            Retirar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '16px 18px' }}>
        <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
          Estadísticas
        </p>
        {[
          { label: 'Precisión', value: `${accuracy}%` },
          { label: 'Votos totales', value: String(totalVotes) },
          { label: 'En juego', value: totalAtRisk > 0 ? `Q${totalAtRisk.toFixed(2)}` : '—' },
          { label: 'P/L histórico', value: resolved.length > 0 ? `${historicalPL >= 0 ? '+' : ''}Q${Math.abs(historicalPL).toFixed(2)}` : '—' },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{label}</span>
            <span style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Ending soon */}
      {endingSoon.length > 0 && (
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '16px 18px' }}>
          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Terminan pronto
          </p>
          {endingSoon.map((e, i) => {
            const diff = new Date(e.endsAt!).getTime() - now
            const isCritical = diff <= 2 * 3600 * 1000
            const timeLabel = isCritical
              ? `${Math.floor((diff % 3600000) / 60000)}m`
              : `${Math.floor(diff / 3600000)}h`
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '4px', padding: '2px 5px', textTransform: 'uppercase', flexShrink: 0 }}>
                  {categoryShort[e.category] || 'EVT'}
                </span>
                <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.question}
                </p>
                <span style={{ fontFamily: F, fontSize: '11px', fontWeight: isCritical ? 700 : 500, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>
                  {timeLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* KYC */}
      {user.tier < 3 && (
        <div style={{ background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '16px 18px' }}>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', marginBottom: '4px' }}>
            Subí a Nivel {user.tier + 1}
          </p>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
            {user.tier === 1 ? 'Participá hasta Q2,000 por evento.' : 'Participá hasta Q10,000 por evento.'}
          </p>
          <button
            onClick={() => setKycOpen(true)}
            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}
          >
            Verificar →
          </button>
        </div>
      )}

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      <RetiroSheet open={retiroOpen} onClose={() => setRetiroOpen(false)} />
      <KYCSheet open={kycOpen} onClose={() => setKycOpen(false)} targetTier={(user.tier + 1) as 2 | 3} />
    </div>
  )
}
