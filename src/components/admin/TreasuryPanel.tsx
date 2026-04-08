import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const TREASURY_ID = '00000000-0000-0000-0000-000000000001'

interface TreasuryEntry {
  type: string
  amount: number
  balance_after: number
  label: string
  created_at: string
}

export function TreasuryPanel() {
  const [treasuryBalance, setTreasuryBalance] = useState(0)
  const [treasuryLedger, setTreasuryLedger] = useState<TreasuryEntry[]>([])
  const [treasuryLoading, setTreasuryLoading] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [sweepResult, setSweepResult] = useState<{ swept_total: number; tx_count: number } | null>(null)

  // Load treasury data on mount
  useEffect(() => {
    if (treasuryLedger.length === 0 && treasuryBalance === 0) {
      loadTreasuryData()
    }
  }, [])

  const loadTreasuryData = async () => {
    setTreasuryLoading(true)
    try {
      const [balRes, ledRes] = await Promise.all([
        supabase.from('profiles').select('balance').eq('id', TREASURY_ID).single(),
        supabase.from('balance_ledger').select('type, amount, balance_after, label, created_at').eq('user_id', TREASURY_ID).order('created_at', { ascending: false }).limit(50),
      ])

      if (balRes.data) setTreasuryBalance(Number(balRes.data.balance) || 0)
      if (ledRes.data) setTreasuryLedger(ledRes.data as TreasuryEntry[])
    } finally {
      setTreasuryLoading(false)
    }
  }

  const handleSweep = async () => {
    if (!confirm('¿Sincronizar fees no acreditados a la tesorería?')) return
    setSweeping(true)
    setSweepResult(null)
    try {
      const { data, error } = await supabase.rpc('sweep_to_treasury')
      if (error) {
        alert('Error: ' + error.message)
        return
      }
      if (data?.error) {
        alert(data.error)
        return
      }
      setSweepResult({ swept_total: data.swept_total, tx_count: data.tx_count })
      // Reload treasury data to reflect new entries
      loadTreasuryData()
    } finally {
      setSweeping(false)
    }
  }

  const totalIn = treasuryLedger.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const totalOut = treasuryLedger.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
  const fmtQ2 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleWithdraw = async () => {
    const input = document.getElementById('treasury-withdraw-amt') as HTMLInputElement
    const amt = parseFloat(input?.value || '0')
    if (amt <= 0) return
    if (amt > treasuryBalance) {
      alert('Saldo insuficiente')
      return
    }

    const { error } = await supabase.rpc('admin_adjust_balance', {
      p_user_id: TREASURY_ID,
      p_amount: -amt,
      p_reason: 'Retiro tesorería',
    })

    if (error) {
      alert(error.message)
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Balance card */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '8px' }}>Saldo de tesorería</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '16px' }}>
            <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)' }}>Q</span>
            <span style={{ fontFamily: D, fontSize: '48px', fontWeight: 700, color: treasuryBalance >= 0 ? 'var(--b1n0-text-1)' : '#f87171', letterSpacing: '-2px' }}>
              {treasuryLoading ? '...' : fmtQ2(treasuryBalance)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '12px' }}>
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Ingresos</p>
              <p style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>+Q{fmtQ2(totalIn)}</p>
            </div>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '12px' }}>
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Egresos</p>
              <p style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: '#f87171' }}>−Q{fmtQ2(totalOut)}</p>
            </div>
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '12px' }}>
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Transacciones</p>
              <p style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>{treasuryLedger.length}</p>
            </div>
          </div>
        </div>

        {/* Withdrawal form */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>Retiro de fondos</p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700 }}>Q</span>
            <input
              id="treasury-withdraw-amt"
              type="number"
              placeholder="Monto a retirar"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
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
                borderRadius: '10px',
                border: 'none',
                background: '#f87171',
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
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>Sincronización</p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
            Acredita fees y spread no sincronizados de todas las transacciones a la tesorería.
          </p>
          <button
            onClick={handleSweep}
            disabled={sweeping}
            style={{
              width: '100%',
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(20,184,166,0.3)',
              background: sweeping ? 'var(--b1n0-surface)' : 'rgba(20,184,166,0.1)',
              color: '#4ade80',
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
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}>
              <p style={{ fontFamily: F, fontSize: '11px', color: '#4ade80' }}>
                {sweepResult.tx_count === 0
                  ? 'Todo sincronizado — no hay transacciones pendientes.'
                  : `Sincronizado: +Q${sweepResult.swept_total.toFixed(2)} de ${sweepResult.tx_count} transacciones.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right column - Transaction history */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>Historial ({treasuryLedger.length})</p>
          <button
            onClick={loadTreasuryData}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
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
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, padding: '8px 6px', color: entry.amount > 0 ? '#4ade80' : '#f87171' }}>{entry.amount > 0 ? 'Ingreso' : 'Egreso'}</td>
                    <td style={{ fontFamily: D, fontSize: '12px', fontWeight: 700, padding: '8px 6px', color: entry.amount > 0 ? '#4ade80' : '#f87171' }}>{entry.amount > 0 ? '+' : ''}Q{fmtQ2(entry.amount)}</td>
                    <td style={{ fontFamily: D, fontSize: '11px', padding: '8px 6px', color: 'var(--b1n0-text-1)' }}>Q{fmtQ2(entry.balance_after)}</td>
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
