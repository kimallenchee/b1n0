import { mockTransactions } from '../data/mockEvents'
import type { Transaction } from '../types'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const typeLabel: Record<Transaction['type'], string> = {
  deposit: 'Depósito',
  withdraw: 'Retiro',
  vote: 'Voto',
  win: 'Cobro',
  loss: 'Perdido',
  sell: 'Venta',
  refund: 'Reembolso',
}

const typeIcon: Record<Transaction['type'], string> = {
  deposit: '↓',
  withdraw: '↑',
  vote: '•',
  win: '✓',
  loss: '✕',
  sell: '💰',
  refund: '↩️',
}

function TxCard({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0
  const accentColor = positive ? 'var(--b1n0-surface)' : 'rgba(255,255,255,0.15)'

  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: positive ? 'rgba(255,255,255,0.04)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: F,
          fontSize: '15px',
          color: 'var(--b1n0-text-2)',
          flexShrink: 0,
        }}
      >
        {typeIcon[tx.type]}
      </div>

      {/* Label + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span
            style={{
              fontFamily: F,
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--b1n0-muted)',
              background: 'var(--b1n0-surface)',
              borderRadius: '5px',
              padding: '2px 6px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              flexShrink: 0,
            }}
          >
            {typeLabel[tx.type]}
          </span>
        </div>
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.label}
        </p>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{tx.date}</p>
      </div>

      {/* Amount */}
      <p
        style={{
          fontFamily: D,
          fontWeight: 700,
          fontSize: '15px',
          color: 'var(--b1n0-text-1)',
          flexShrink: 0,
          letterSpacing: '-0.5px',
        }}
      >
        {positive ? '+' : ''}Q{Math.abs(tx.amount)}
      </p>
    </div>
  )
}

export function Movimientos() {
  const deposits = mockTransactions.filter((t) => t.type === 'deposit')
  const withdraws = mockTransactions.filter((t) => t.type === 'withdraw')
  const votes = mockTransactions.filter((t) => t.type === 'vote' || t.type === 'win' || t.type === 'loss')

  const totalIn = deposits.reduce((s, t) => s + t.amount, 0)
  const totalOut = withdraws.reduce((s, t) => s + Math.abs(t.amount), 0)
  const netVotes = votes.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 24px' }}>
      {/* Header */}
      <div style={{ padding: '20px 0 16px' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', marginBottom: '4px' }}>
          Movimientos
        </p>
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
          Historial completo de tu cuenta
        </p>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'Ingresado', value: `+Q${totalIn.toLocaleString()}` },
          { label: 'Retirado', value: `-Q${totalOut.toLocaleString()}` },
          { label: 'Neto votos', value: `${netVotes >= 0 ? '+' : ''}Q${netVotes}` },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '12px 10px', textAlign: 'center' }}>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px' }}>{s.value}</p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '3px' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Deposits & withdrawals */}
      {(deposits.length > 0 || withdraws.length > 0) && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Efectivo
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...deposits, ...withdraws]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((tx) => <TxCard key={tx.id} tx={tx} />)}
          </div>
        </div>
      )}

      {/* Vote transactions */}
      {votes.length > 0 && (
        <div>
          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Actividad de votos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {votes
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((tx) => <TxCard key={tx.id} tx={tx} />)}
          </div>
        </div>
      )}
    </div>
  )
}
