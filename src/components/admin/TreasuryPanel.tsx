import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { callRpc } from '../../lib/rpc'
import { useTreasuryId } from '../../hooks/useTreasuryId'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface TreasuryEntry {
  type: string
  amount: number
  balance_after: number
  label: string
  created_at: string
}

export function TreasuryPanel() {
  const { treasuryId } = useTreasuryId()
  const [treasuryBalance, setTreasuryBalance] = useState(0)
  const [treasuryLedger, setTreasuryLedger] = useState<TreasuryEntry[]>([])
  const [treasuryLoading, setTreasuryLoading] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [sweepResult, setSweepResult] = useState<{ swept_total: number; tx_count: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load treasury data on mount (or once treasuryId is known)
  useEffect(() => {
    if (!treasuryId) return
    loadTreasuryData(treasuryId).catch((err: unknown) => {
      logger.error('TreasuryPanel: initial load failed', { error: err })
      setErrorMsg('Error cargando datos de tesorería')
    })
  }, [treasuryId])

  const loadTreasuryData = async (id: string) => {
    setTreasuryLoading(true)
    setErrorMsg(null)
    try {
      const [balRes, ledRes] = await Promise.all([
        supabase.from('profiles').select('balance').eq('id', id).single(),
        supabase
          .from('balance_ledger')
          .select('type, amount, balance_after, label, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (balRes.error) {
        logger.error('TreasuryPanel: balance load failed', { error: balRes.error.message })
        setErrorMsg('No se pudo cargar saldo: ' + balRes.error.message)
      } else if (balRes.data) {
        setTreasuryBalance(Number(balRes.data.balance) || 0)
      }

      if (ledRes.error) {
        logger.error('TreasuryPanel: ledger load failed', { error: ledRes.error.message })
        setErrorMsg('No se pudo cargar historial: ' + ledRes.error.message)
      } else if (ledRes.data) {
        setTreasuryLedger(ledRes.data as TreasuryEntry[])
      }
    } finally {
      setTreasuryLoading(false)
    }
  }

  const handleSweep = async () => {
    if (!treasuryId) return
    if (!confirm('¿Sincronizar fees no acreditados a la tesorería?')) return
    setSweeping(true)
    setSweepResult(null)
    setErrorMsg(null)
    try {
      const { data, error } = await callRpc('sweep_to_treasury')
      if (error) {
        setErrorMsg('Error: ' + error.message)
        return
      }
      if (data?.error) {
        setErrorMsg(data.error)
        return
      }
      setSweepResult({ swept_total: data?.swept_total ?? 0, tx_count: data?.tx_count ?? 0 })
      // Reload treasury data to reflect new entries
      await loadTreasuryData(treasuryId).catch((err: unknown) => {
        logger.error('TreasuryPanel: reload after sweep failed', { error: err })
      })
    } finally {
      setSweeping(false)
    }
  }

  const totalIn = treasuryLedger.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const totalOut = treasuryLedger.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
  const fmtQ2 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleWithdraw = async () => {
    if (!treasuryId) return
    const input = document.getElementById('treasury-withdraw-amt') as HTMLInputElement
    const amt = parseFloat(input?.value || '0')
    if (amt <= 0) return
    if (amt > treasuryBalance) {
      setErrorMsg('Saldo insuficiente')
      return
    }
    setErrorMsg(null)

    const { error } = await callRpc('admin_adjust_balance', {
      p_user_id: treasuryId,
      p_amount: -amt,
      p_reason: 'Retiro tesorería',
    })

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setTreasuryBalance(prev => prev - amt)
    setTreasuryLedger(prev => [
      {
        type: 'withdraw',
        amount: -amt,
        balance_after: treasuryBalance - amt,
        label: 'Retiro tesorería',
        created_at: new Date().toISOString(),
      },
      ...prev,
    ])
    if (input) input.value = ''
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {/* Inline error banner — replaces alert() popups */}
      {errorMsg && (
        <p
          style={{
            gridColumn: '1 / -1',
            fontFamily: F,
            fontSize: '12px',
            color: 'var(--b1n0-no)',
            background: 'rgba(248,113,113,0.08)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-lg)',
            margin: 0,
          }}
        >
          {errorMsg}
        </p>
      )}
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Balance card */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Saldo</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '12px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>$</span>
            <span style={{ fontFamily: D, fontSize: '36px', fontWeight: 700, color: treasuryBalance >= 0 ? 'var(--b1n0-text-1)' : 'var(--b1n0-no)', letterSpacing: '-1.5px' , fontVariantNumeric: 'tabular-nums'}}>
              {treasuryLoading ? '...' : fmtQ2(treasuryBalance)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: 'var(--radius-lg)', padding: '8px' }}>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Ingresos</p>
              <p style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-si)' }}>+${fmtQ2(totalIn)}</p>
            </div>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: 'var(--radius-lg)', padding: '8px' }}>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Egresos</p>
              <p style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-no)' }}>−${fmtQ2(totalOut)}</p>
            </div>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: 'var(--radius-lg)', padding: '8px' }}>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Txs</p>
              <p style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>{treasuryLedger.length}</p>
            </div>
          </div>
        </div>

        {/* Withdrawal form */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Retiro</p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700 }}>$</span>
            <input
              id="treasury-withdraw-amt"
              type="number"
              placeholder="Monto a retirar"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--b1n0-border)',
                fontFamily: D,
                fontSize: '16px',
                fontWeight: 700,
                outline: 'none',
              }}
            />
            <button
              onClick={handleWithdraw}
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                background: 'var(--b1n0-no)',
                color: '#fff',
                fontFamily: F,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Retirar
            </button>
          </div>
        </div>

        {/* Sweep / Sync button */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Sync</p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
            Acredita fees y spread no sincronizados de todas las transacciones a la tesorería.
          </p>
          <button
            onClick={handleSweep}
            disabled={sweeping}
            style={{
              width: '100%',
              padding: '10px 20px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(20,184,166,0.3)',
              background: sweeping ? 'var(--b1n0-surface)' : 'rgba(20,184,166,0.1)',
              color: 'var(--b1n0-si)',
              fontFamily: F,
              fontWeight: 600,
              fontSize: '13px',
              cursor: sweeping ? 'not-allowed' : 'pointer',
              opacity: sweeping ? 0.6 : 1,
            }}
          >
            {sweeping ? 'Sincronizando...' : 'Sincronizar fees'}
          </button>
          {sweepResult && (
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: 'var(--radius-lg)', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-si)' }}>
                {sweepResult.tx_count === 0
                  ? 'Todo sincronizado — no hay transacciones pendientes.'
                  : `Sincronizado: +Q${sweepResult.swept_total.toFixed(2)} de ${sweepResult.tx_count} transacciones.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right column - Transaction history */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Historial ({treasuryLedger.length})</p>
          <button
            onClick={() => {
              if (!treasuryId) return
              loadTreasuryData(treasuryId).catch((err: unknown) => {
                logger.error('TreasuryPanel: manual refresh failed', { error: err })
                setErrorMsg('Error al actualizar')
              })
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--b1n0-border)',
              background: 'var(--b1n0-surface)',
              color: 'var(--b1n0-text-1)',
              fontFamily: F,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Actualizar
          </button>
        </div>

        {treasuryLoading ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '20px' }}>Cargando...</p>
        ) : treasuryLedger.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>Sin movimientos aún. Los fees se acumulan con cada transacción.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b1n0-border)' }}>
                  <th style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textAlign: 'left', padding: '8px 6px', textTransform: 'uppercase' }}>Tipo</th>
                  <th style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textAlign: 'left', padding: '8px 6px', textTransform: 'uppercase' }}>Monto</th>
                  <th style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textAlign: 'left', padding: '8px 6px', textTransform: 'uppercase' }}>Saldo</th>
                  <th style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textAlign: 'left', padding: '8px 6px', textTransform: 'uppercase' }}>Concepto</th>
                  <th style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textAlign: 'left', padding: '8px 6px', textTransform: 'uppercase' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {treasuryLedger.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--b1n0-border)' }}>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, padding: '8px 6px', color: entry.amount > 0 ? 'var(--b1n0-si)' : 'var(--b1n0-no)' }}>{entry.amount > 0 ? 'Ingreso' : 'Egreso'}</td>
                    <td style={{ fontFamily: D, fontSize: '12px', fontWeight: 700, padding: '8px 6px', color: entry.amount > 0 ? 'var(--b1n0-si)' : 'var(--b1n0-no)' }}>{entry.amount > 0 ? '+' : ''}${fmtQ2(entry.amount)}</td>
                    <td style={{ fontFamily: D, fontSize: '11px', padding: '8px 6px', color: 'var(--b1n0-text-1)' }}>${fmtQ2(entry.balance_after)}</td>
                    <td style={{ fontFamily: F, fontSize: '11px', padding: '8px 6px', color: 'var(--b1n0-muted)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</td>
                    <td style={{ fontFamily: F, fontSize: '10px', padding: '8px 6px', color: 'var(--b1n0-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })} {new Date(entry.created_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
