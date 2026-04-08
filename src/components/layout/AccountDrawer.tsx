import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockUser } from '../../data/mockEvents'
import { DepositSheet } from '../wallet/DepositSheet'
import { RetiroSheet } from '../wallet/RetiroSheet'
import { useVotes } from '../../context/VoteContext'
import { useAuth } from '../../context/AuthContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface AccountDrawerProps {
  onClose: () => void
}

export function AccountDrawer({ onClose }: AccountDrawerProps) {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const user = profile
    ? { ...mockUser, name: profile.name, tier: profile.tier }
    : mockUser
  const { balance } = useVotes()
  const [balanceExpanded, setBalanceExpanded] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [retiroOpen, setRetiroOpen] = useState(false)

  const handleNav = (path: string) => {
    onClose()
    navigate(path)
  }

  const navLinks = [
    { label: 'Mi perfil', path: '/perfil' },
    { label: 'Historial', path: '/historial' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(255,255,255,0.12)' }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          width: '100%',
          maxWidth: '360px',
          background: 'var(--b1n0-bg)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--b1n0-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--b1n0-text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D, fontWeight: 800, fontSize: '18px', color: '#fff' }}>
                {user.name.charAt(0)}
              </div>
            )}
            <div>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)' }}>{user.name}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Nivel {user.tier}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '20px', color: 'var(--b1n0-muted)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Balance card */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', overflow: 'hidden' }}>
            <button
              onClick={() => setBalanceExpanded(!balanceExpanded)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '4px' }}>Saldo disponible</p>
                <p style={{ fontFamily: D, fontWeight: 800, fontSize: '26px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px' }}>
                  {user.currency} {balance.toLocaleString()}
                </p>
              </div>
              <span style={{ fontFamily: F, fontSize: '18px', color: 'var(--b1n0-muted)', display: 'inline-block', transform: balanceExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>›</span>
            </button>

            {balanceExpanded && (
              <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--b1n0-border)' }}>
                <div style={{ height: '12px' }} />
                <button
                  onClick={() => setDepositOpen(true)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: '#fff' }}
                >
                  Depositar
                </button>
                <button
                  onClick={() => setRetiroOpen(true)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-text-1)' }}
                >
                  Retirar
                </button>
              </div>
            )}
          </div>

          {/* Nav links */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', overflow: 'hidden' }}>
            {navLinks.map((item, i) => (
              <button
                key={item.label}
                onClick={() => handleNav(item.path)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '15px 18px',
                  background: 'none',
                  border: 'none',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>{item.label}</span>
                <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)' }}>›</span>
              </button>
            ))}
          </div>

          {/* Sign out */}
          <button
            onClick={() => { onClose(); signOut() }}
            style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-muted)' }}
          >
            Cerrar sesión
          </button>

        </div>
      </div>

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      <RetiroSheet open={retiroOpen} onClose={() => setRetiroOpen(false)} />
    </>
  )
}
