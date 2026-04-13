import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface AdminUser {
  id: string
  name: string | null
  username: string | null
  balance: number
  role: string | null
  is_admin: boolean
  created_at: string
  total_predictions: number
  correct_predictions: number
  total_cobrado: number
}

interface UserPosition {
  id: string
  event_id: string
  side: string
  contracts: number
  price_at_purchase: number
  payout_if_win: number
  fee_paid: number
  gross_amount: number
  status: string
  created_at: string
}

const ROLES = [
  { value: 'user', label: 'Usuario', color: 'var(--b1n0-muted)', desc: 'Usuario estándar — paga fees normales' },
  { value: 'market_maker', label: 'Market Maker', color: '#C4B5FD', desc: 'Sin comisiones de compra/venta — provee liquidez' },
  { value: 'lp', label: 'LP', color: '#4ade80', desc: 'Proveedor de liquidez — puede depositar capital' },
  { value: 'sponsor', label: 'Sponsor', color: '#FFD474', desc: 'Patrocinador — sin fees, puede fondear eventos' },
  { value: 'admin', label: 'Admin', color: '#f87171', desc: 'Acceso total al panel de administración' },
]

export function UsersPanel() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersSearch, setUsersSearch] = useState('')
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [userSort, setUserSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' })
  const [customBalanceAmt, setCustomBalanceAmt] = useState<Record<string, string>>({})
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [userPortfolio, setUserPortfolio] = useState<string | null>(null)
  const [userPositions, setUserPositions] = useState<UserPosition[]>([])
  const [userPosLoading, setUserPosLoading] = useState(false)
  const [userSaving, setUserSaving] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [userSuccess, setUserSuccess] = useState<string | null>(null)
  const [allEvents, setAllEvents] = useState<{ id: string; question: string }[]>([])

  // Load users on mount
  useEffect(() => {
    loadUsers()
    loadAllEvents()
  }, [])

  async function loadUsers() {
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, username, balance, role, is_admin, created_at, total_predictions, correct_predictions, total_cobrado')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('loadUsers error:', error)
      setUserError('Error cargando usuarios: ' + error.message)
    }
    setAdminUsers((data || []) as AdminUser[])
    setUsersLoading(false)
  }

  async function loadAllEvents() {
    const { data } = await supabase
      .from('events')
      .select('id, question')
      .order('created_at', { ascending: false })
    setAllEvents((data || []) as typeof allEvents)
  }

  async function adjustBalance(user: AdminUser, amount: number, reason?: string) {
    setUserSaving(true)
    setUserError(null)
    setUserSuccess(null)
    const { data, error } = await supabase.rpc('admin_adjust_balance', {
      p_user_id: user.id,
      p_amount: amount,
      p_reason: reason || (amount >= 0 ? `Admin +Q${Math.abs(amount)}` : `Admin -Q${Math.abs(amount)}`),
    })
    if (error) {
      setUserError(error.message)
    } else {
      const result = data as { ok?: boolean; error?: string; new_balance?: number } | null
      if (result?.error) {
        setUserError(result.error)
      } else {
        const newBal = result?.new_balance ?? (user.balance + amount)
        setUserSuccess(`Saldo actualizado: Q${newBal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`)
        setAdminUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, balance: newBal } : u)))
        setTimeout(() => setUserSuccess(null), 2000)
      }
    }
    setUserSaving(false)
  }

  async function saveUser(user: AdminUser, updates: { role?: string; balance?: number; is_admin?: boolean }) {
    // For balance changes, use the audited RPC
    if (updates.balance !== undefined && Object.keys(updates).length === 1) {
      const diff = updates.balance - user.balance
      return adjustBalance(user, diff)
    }
    setUserSaving(true)
    setUserError(null)
    setUserSuccess(null)
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) {
      setUserError(error.message)
    } else {
      setUserSuccess('Guardado')
      setAdminUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updates } : u)))
      setTimeout(() => setUserSuccess(null), 2000)
    }
    setUserSaving(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={usersSearch}
          onChange={(e) => setUsersSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--b1n0-border)', fontFamily: F, fontSize: '12px', background: 'var(--b1n0-card)', outline: 'none' }}
        />
      </div>

      {userError && (
        <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', background: 'rgba(248,113,113,0.08)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
          {userError}
        </p>
      )}
      {userSuccess && (
        <p style={{ fontFamily: F, fontSize: '12px', color: '#4ade80', background: 'rgba(74,222,128,0.08)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
          {userSuccess}
        </p>
      )}

      {usersLoading ? (
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '40px' }}>Cargando usuarios...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Filter buttons */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total', val: adminUsers.length, color: 'var(--b1n0-text-1)', filter: null as string | null },
              { label: 'MM', val: adminUsers.filter((u) => u.role === 'market_maker').length, color: '#C4B5FD', filter: 'market_maker' },
              { label: 'LPs', val: adminUsers.filter((u) => u.role === 'lp').length, color: '#4ade80', filter: 'lp' },
              { label: 'Sponsors', val: adminUsers.filter((u) => u.role === 'sponsor').length, color: '#FFD474', filter: 'sponsor' },
              { label: 'Admins', val: adminUsers.filter((u) => u.is_admin).length, color: '#f87171', filter: 'admin' },
            ].map((s) => {
              const isActive = roleFilter === s.filter
              return (
                <button
                  key={s.label}
                  onClick={() => setRoleFilter(isActive ? null : s.filter)}
                  style={{
                    background: isActive ? s.color + '15' : 'var(--b1n0-card)',
                    border: isActive ? `1.5px solid ${s.color}` : '1px solid var(--b1n0-border)',
                    borderRadius: '7px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontFamily: F, fontSize: '9px', color: isActive ? s.color : 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {s.label}
                  </span>
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 800, color: s.color }}>
                    {s.val}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Sortable header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 60px 60px 50px 80px', gap: '4px', padding: '5px 12px', background: 'var(--b1n0-surface)', borderRadius: '7px', marginBottom: '4px' }}>
            {[
              { key: 'name', label: 'Usuario' },
              { key: 'balance', label: 'Saldo' },
              { key: 'total_cobrado', label: 'Cobrado' },
              { key: 'total_predictions', label: 'Votos' },
              { key: 'correct_predictions', label: 'Correctos' },
              { key: 'winrate', label: 'Win %' },
              { key: 'created_at', label: 'Creado' },
            ].map((col) => (
              <button
                key={col.key}
                onClick={() =>
                  setUserSort((prev) => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'desc' ? 'asc' : 'desc' }))
                }
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: F,
                  fontSize: '10px',
                  fontWeight: 700,
                  color: userSort.key === col.key ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  textAlign: 'left',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                {col.label}
                {userSort.key === col.key && <span style={{ fontSize: '8px' }}>{userSort.dir === 'desc' ? '▼' : '▲'}</span>}
              </button>
            ))}
          </div>

          {/* User rows */}
          {adminUsers
            .filter((u) => {
              // Role filter
              if (roleFilter === 'admin' && !u.is_admin) return false
              if (roleFilter && roleFilter !== 'admin' && u.role !== roleFilter) return false
              // Search filter
              if (!usersSearch) return true
              const q = usersSearch.toLowerCase()
              return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
            })
            .sort((a, b) => {
              const dir = userSort.dir === 'asc' ? 1 : -1
              if (userSort.key === 'name') return dir * (a.name || '').localeCompare(b.name || '')
              if (userSort.key === 'balance') return dir * (a.balance - b.balance)
              if (userSort.key === 'total_cobrado') return dir * (a.total_cobrado - b.total_cobrado)
              if (userSort.key === 'total_predictions') return dir * (a.total_predictions - b.total_predictions)
              if (userSort.key === 'correct_predictions') return dir * (a.correct_predictions - b.correct_predictions)
              if (userSort.key === 'winrate') {
                const wr = (u: AdminUser) => (u.total_predictions > 0 ? u.correct_predictions / u.total_predictions : 0)
                return dir * (wr(a) - wr(b))
              }
              if (userSort.key === 'created_at') return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              return 0
            })
            .map((user) => {
              const isEditing = editingUser?.id === user.id
              const role = ROLES.find((r) => r.value === (user.role || 'user')) || ROLES[0]
              const winRate = user.total_predictions > 0 ? ((user.correct_predictions / user.total_predictions) * 100).toFixed(0) : '0'
              const joinedDate = new Date(user.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: '2-digit' })
              return (
                <div
                  key={user.id}
                  style={{
                    background: 'var(--b1n0-card)',
                    border: '1px solid var(--b1n0-border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.15s',
                    boxShadow: isEditing ? '0 0 0 1.5px #6366f1' : 'none',
                  }}
                >
                  {/* Main row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 60px 60px 50px 80px',
                      gap: '4px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      alignItems: 'center',
                    }}
                    onClick={() => setEditingUser(isEditing ? null : user)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: role.color + '20',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontFamily: D, fontSize: '11px', fontWeight: 700, color: role.color }}>
                          {(user.name || user.username || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.name || 'Sin nombre'}
                          </p>
                          <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '8px', fontFamily: F, fontWeight: 700, background: role.color + '15', color: role.color, whiteSpace: 'nowrap' }}>
                            {role.label}
                          </span>
                        </div>
                        <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)' }}>@{user.username || user.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span style={{ fontFamily: D, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                      Q{user.balance.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span style={{ fontFamily: D, fontSize: '13px', fontWeight: 600, color: user.total_cobrado > 0 ? '#4ade80' : 'var(--b1n0-muted)' }}>
                      Q{user.total_cobrado.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span style={{ fontFamily: D, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-text-2)' }}>
                      {user.total_predictions}
                    </span>
                    <span style={{ fontFamily: D, fontSize: '13px', fontWeight: 600, color: user.correct_predictions > 0 ? '#4ade80' : 'var(--b1n0-muted)' }}>
                      {user.correct_predictions}
                    </span>
                    <span style={{ fontFamily: D, fontSize: '13px', fontWeight: 600, color: Number(winRate) >= 50 ? '#4ade80' : Number(winRate) > 0 ? '#FFD474' : 'var(--b1n0-muted)' }}>
                      {winRate}%
                    </span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                      {joinedDate}
                    </span>
                  </div>

                  {/* Expanded edit panel */}
                  {isEditing && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--b1n0-border)' }}>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '14px' }}>
                        {/* Role pills */}
                        <div style={{ minWidth: '200px' }}>
                          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                            Rol
                          </p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {ROLES.map((r) => {
                              const isActive = (user.role || 'user') === r.value
                              return (
                                <button
                                  key={r.value}
                                  onClick={() => {
                                    const updates: Record<string, unknown> = { role: r.value }
                                    if (r.value === 'admin') updates.is_admin = true
                                    else if (user.is_admin) updates.is_admin = false
                                    saveUser(user, updates as { role: string; is_admin?: boolean })
                                  }}
                                  disabled={userSaving}
                                  title={r.desc}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    border: '1.5px solid',
                                    borderColor: isActive ? r.color : 'var(--b1n0-border)',
                                    background: isActive ? r.color + '15' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    fontFamily: F,
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: isActive ? r.color : 'var(--b1n0-muted)',
                                  }}
                                >
                                  {r.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Balance controls */}
                        <div style={{ minWidth: '240px', flex: 1 }}>
                          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                            Saldo
                          </p>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700 }}>Q</span>
                            <input
                              type="number"
                              step="0.01"
                              defaultValue={user.balance}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value)
                                if (!isNaN(val) && val !== user.balance) saveUser(user, { balance: val })
                              }}
                              style={{ width: '120px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--b1n0-border)', fontFamily: D, fontSize: '14px', fontWeight: 700, outline: 'none' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            {[100, 500, 1000, 5000, 10000, 50000].map((amt) => (
                              <button
                                key={amt}
                                onClick={() => saveUser(user, { balance: user.balance + amt })}
                                disabled={userSaving}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--b1n0-border)',
                                  background: 'var(--b1n0-surface)',
                                  fontFamily: F,
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  color: '#4ade80',
                                }}
                              >
                                +Q{amt.toLocaleString()}
                              </button>
                            ))}
                          </div>
                          {/* Custom amount */}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              placeholder="Monto personalizado"
                              value={customBalanceAmt[user.id] || ''}
                              onChange={(e) => setCustomBalanceAmt((prev) => ({ ...prev, [user.id]: e.target.value }))}
                              style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--b1n0-border)', fontFamily: F, fontSize: '12px', outline: 'none' }}
                            />
                            <button
                              onClick={() => {
                                const amt = parseFloat(customBalanceAmt[user.id] || '0')
                                if (amt > 0) {
                                  saveUser(user, { balance: user.balance + amt })
                                  setCustomBalanceAmt((prev) => ({ ...prev, [user.id]: '' }))
                                }
                              }}
                              disabled={userSaving || !customBalanceAmt[user.id]}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#4ade80',
                                color: '#fff',
                                fontFamily: F,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + Agregar
                            </button>
                          </div>
                        </div>

                        {/* Info + Quick Actions */}
                        <div style={{ minWidth: '180px' }}>
                          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                            Info
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
                            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                              ID:{' '}
                              <span style={{ color: 'var(--b1n0-text-2)', fontFamily: 'monospace', fontSize: '10px' }}>
                                {user.id.slice(0, 12)}...
                              </span>
                            </p>
                            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                              Creado: {new Date(user.created_at).toLocaleDateString('es-GT')}
                            </p>
                            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                              Cobrado total: Q{user.total_cobrado.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                            Acciones
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <button
                              onClick={async () => {
                                if (userPortfolio === user.id) {
                                  setUserPortfolio(null)
                                  return
                                }
                                setUserPosLoading(true)
                                setUserPortfolio(user.id)
                                const { data } = await supabase
                                  .from('positions')
                                  .select('id, event_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount, status, created_at')
                                  .eq('user_id', user.id)
                                  .order('created_at', { ascending: false })
                                  .limit(20)
                                setUserPositions((data || []) as UserPosition[])
                                setUserPosLoading(false)
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--b1n0-border)',
                                background: userPortfolio === user.id ? 'var(--b1n0-card)' : 'var(--b1n0-surface)',
                                fontFamily: F,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: userPortfolio === user.id ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                                textAlign: 'left',
                              }}
                            >
                              {userPortfolio === user.id ? 'Ocultar portafolio ▲' : 'Ver portafolio →'}
                            </button>
                            <button
                              onClick={async () => {
                                const newPw = prompt('Nueva contraseña para ' + (user.name || user.username || user.id.slice(0, 8)) + ':')
                                if (!newPw) return
                                if (newPw.length < 6) {
                                  setUserError('Contraseña debe tener al menos 6 caracteres')
                                  return
                                }
                                const { data, error } = await supabase.rpc('admin_reset_password', { p_user_id: user.id, p_new_password: newPw })
                                if (error) {
                                  setUserError('Error: ' + error.message)
                                  return
                                }
                                const result = data as { ok?: boolean; error?: string } | null
                                if (result?.error) setUserError(result.error)
                                else setUserSuccess('Contraseña actualizada para ' + (user.name || user.username))
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--b1n0-border)',
                                background: 'var(--b1n0-surface)',
                                fontFamily: F,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#FFD474',
                                textAlign: 'left',
                              }}
                            >
                              Resetear contraseña
                            </button>
                            <button
                              onClick={() => {
                                if (!confirm(`¿Poner saldo de ${user.name || 'usuario'} a Q0?`)) return
                                saveUser(user, { balance: 0 })
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #fecaca',
                                background: 'rgba(248,113,113,0.08)',
                                fontFamily: F,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#f87171',
                                textAlign: 'left',
                              }}
                            >
                              Congelar saldo (Q0)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline portfolio view */}
                  {userPortfolio === user.id && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '16px', borderTop: '1px solid var(--b1n0-border)' }}>
                      <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                        Posiciones de {user.name || user.username} ({userPositions.length})
                      </p>
                      {userPosLoading ? (
                        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Cargando...</p>
                      ) : userPositions.length === 0 ? (
                        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Sin posiciones.</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr>
                                {['Evento', 'Lado', 'Entrada', 'Precio', 'Contratos', 'Cobro Est.', 'Fee', 'Estado', 'Fecha'].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      fontFamily: F,
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      color: 'var(--b1n0-muted)',
                                      textTransform: 'uppercase',
                                      textAlign: 'left',
                                      padding: '4px 6px',
                                      borderBottom: '1px solid var(--b1n0-border)',
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {userPositions.map((pos) => {
                                const evName = allEvents.find((e) => e.id === pos.event_id)?.question || pos.event_id.slice(0, 12)
                                const statusColor = pos.status === 'won' ? '#4ade80' : pos.status === 'lost' ? '#f87171' : pos.status === 'sold' ? '#C4B5FD' : '#FFD474'
                                return (
                                  <tr key={pos.id} style={{ borderBottom: '1px solid var(--b1n0-border)' }}>
                                    <td
                                      style={{
                                        fontFamily: F,
                                        fontSize: '11px',
                                        color: 'var(--b1n0-text-1)',
                                        padding: '6px',
                                        maxWidth: '180px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {evName}
                                    </td>
                                    <td
                                      style={{
                                        fontFamily: F,
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: pos.side.includes('yes') || pos.side === 'yes' ? '#4ade80' : '#f87171',
                                        padding: '6px',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {pos.side.toUpperCase()}
                                    </td>
                                    <td style={{ fontFamily: D, fontSize: '11px', fontWeight: 600, padding: '6px' }}>
                                      Q{pos.gross_amount.toLocaleString()}
                                    </td>
                                    <td style={{ fontFamily: D, fontSize: '11px', padding: '6px' }}>
                                      {pos.price_at_purchase?.toFixed(3)}
                                    </td>
                                    <td style={{ fontFamily: D, fontSize: '11px', padding: '6px' }}>
                                      {pos.contracts?.toFixed(2)}
                                    </td>
                                    <td style={{ fontFamily: D, fontSize: '11px', fontWeight: 600, color: '#4ade80', padding: '6px' }}>
                                      Q{pos.payout_if_win?.toLocaleString()}
                                    </td>
                                    <td style={{ fontFamily: F, fontSize: '11px', color: '#f87171', padding: '6px' }}>
                                      Q{pos.fee_paid?.toFixed(2)}
                                    </td>
                                    <td style={{ padding: '6px' }}>
                                      <span
                                        style={{
                                          fontFamily: F,
                                          fontSize: '9px',
                                          fontWeight: 600,
                                          color: statusColor,
                                          background: statusColor + '15',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                        }}
                                      >
                                        {pos.status || 'active'}
                                      </span>
                                    </td>
                                    <td style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', padding: '6px', whiteSpace: 'nowrap' }}>
                                      {new Date(pos.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Deduct balance row — only visible when editing */}
                  {isEditing && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--b1n0-border)' }}>
                    <span style={{ fontFamily: F, fontSize: '10px', color: '#f87171', fontWeight: 600 }}>Deducir:</span>
                    {[50, 100, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => {
                          if (user.balance < amt) {
                            setUserError('Saldo insuficiente para deducir')
                            return
                          }
                          saveUser(user, { balance: Math.max(user.balance - amt, 0) })
                        }}
                        disabled={userSaving}
                        style={{
                          padding: '3px 6px',
                          borderRadius: '4px',
                          border: '1px solid #fecaca',
                          background: 'rgba(248,113,113,0.08)',
                          fontFamily: F,
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#f87171',
                        }}
                      >
                        -Q{amt.toLocaleString()}
                      </button>
                    ))}
                    <input
                      type="number"
                      placeholder="Monto"
                      value={customBalanceAmt[user.id + '_deduct'] || ''}
                      onChange={(e) => setCustomBalanceAmt((prev) => ({ ...prev, [user.id + '_deduct']: e.target.value }))}
                      style={{ width: '80px', padding: '3px 6px', borderRadius: '4px', border: '1px solid #fecaca', fontFamily: F, fontSize: '10px', outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        const amt = parseFloat(customBalanceAmt[user.id + '_deduct'] || '0')
                        if (amt <= 0) return
                        if (user.balance < amt) {
                          setUserError('Saldo insuficiente')
                          return
                        }
                        saveUser(user, { balance: Math.max(user.balance - amt, 0) })
                        setCustomBalanceAmt((prev) => ({ ...prev, [user.id + '_deduct']: '' }))
                      }}
                      disabled={userSaving || !customBalanceAmt[user.id + '_deduct']}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#f87171',
                        color: '#fff',
                        fontFamily: F,
                        fontSize: '9px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      - Deducir
                    </button>
                  </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
