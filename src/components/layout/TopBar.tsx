import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { User } from '../../types'
import { NotificationDrawer } from './NotificationDrawer'
import { WalletSheet } from '../wallet/WalletSheet'
import { useVotes } from '../../context/VoteContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

interface TopBarProps {
  user: User
}

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

export function TopBar({ user }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [walletOpen, setWalletOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { balance } = useVotes()
  const { unreadCount } = useNotifications()
  const { session } = useAuth()
  const { openAuth } = useAuthModal()
  const isLoggedIn = !!session

  return (
    <>
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 10px',
          background: 'transparent',
          borderBottom: '1px solid var(--b1n0-border)',
        }}
      >
        {/* b1n0 wordmark */}
        <button
          onClick={() => {
            if (location.pathname === '/inicio') {
              document.querySelector('.feed-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
            } else {
              navigate('/inicio')
            }
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <img src="/b1n0-logo.png" alt="B1N0" style={{ height: '24px', objectFit: 'contain' }} />
        </button>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLoggedIn ? (
            <>
              {/* Notification bell */}
              <button
                onClick={() => setNotifOpen(true)}
                style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 0, right: 0,
                    minWidth: 16, height: 16, borderRadius: '8px',
                    background: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: F, fontWeight: 700, fontSize: '9px', color: '#fff',
                    padding: '0 4px',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Balance pill — opens wallet */}
              <button
                onClick={() => setWalletOpen(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '5px 10px' }}>
                  <span style={{ fontFamily: F, fontWeight: 700, fontSize: '12px', color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
                    Q{balance.toLocaleString()}
                  </span>
                </div>
              </button>

              {/* Avatar — navigates to perfil */}
              <button
                onClick={() => navigate('/perfil')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                  {user.avatar ? (
                    <img src={user.avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--b1n0-text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '13px', color: '#fff' }}>
                      {user.name.charAt(0)}
                    </div>
                  )}
                </div>
              </button>
            </>
          ) : (
            <button
              onClick={() => openAuth('login')}
              style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: 'var(--b1n0-text-1)', color: '#fff', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              Entrar
            </button>
          )}
        </div>
      </div>

      <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} />
      {notifOpen && <NotificationDrawer onClose={() => setNotifOpen(false)} />}
    </>
  )
}
