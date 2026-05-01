import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Question, Bell } from '@phosphor-icons/react'
import type { User } from '../../types'
import { NotificationDrawer } from './NotificationDrawer'
import { WalletSheet } from '../wallet/WalletSheet'
import { HowItWorks } from '../HowItWorks'
import { useVotes } from '../../context/VoteContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

interface TopBarProps {
  user: User
}

const F = 'var(--font-body)'
const NUM_FONT = 'var(--font-num)'

export function TopBar({ user }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [walletOpen, setWalletOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
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
          padding: 'var(--space-5) var(--space-7) var(--space-4)',
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
          <img src="/b1n0-logo.png" alt="b1n0" style={{ height: '24px', objectFit: 'contain' }} />
        </button>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {isLoggedIn ? (
            <>
              {/* How it works — Question icon */}
              <IconButton
                onClick={() => setHowOpen(true)}
                ariaLabel="¿Cómo funciona?"
                title="¿Cómo funciona?"
              >
                <Question size={20} weight="regular" color="var(--b1n0-muted)" />
              </IconButton>

              {/* Notification bell */}
              <button
                onClick={() => setNotifOpen(true)}
                aria-label={unreadCount > 0 ? `${unreadCount} notificaciones nuevas` : 'Notificaciones'}
                style={{
                  position: 'relative',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 'var(--space-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-md)',
                  transition: 'background var(--duration-fast) var(--ease-out)',
                }}
              >
                <Bell size={20} weight={unreadCount > 0 ? 'fill' : 'regular'} color="var(--b1n0-text-2)" />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      minWidth: 14,
                      height: 14,
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--b1n0-no)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: NUM_FONT,
                      fontWeight: 700,
                      fontSize: '9px',
                      color: 'var(--b1n0-bg)',
                      padding: '0 4px',
                      fontVariantNumeric: 'tabular-nums',
                      border: '1.5px solid var(--b1n0-bg)',
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/*
                Balance pill — the loudest financial moment in the chrome.
                Geist tabular numerals at 14px / weight 600. The pill itself
                is restrained (1px border, no fill) so the number leads.
              */}
              <button
                onClick={() => setWalletOpen(true)}
                aria-label={`Saldo: $${balance.toFixed(2)}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: 'var(--space-2) var(--space-4)',
                    transition: 'border-color var(--duration-fast) var(--ease-out)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: NUM_FONT,
                      fontWeight: 600,
                      fontSize: 'var(--text-base)',
                      color: 'var(--color-text)',
                      letterSpacing: 'var(--tracking-tight)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </button>

              {/* Avatar — subtle 1px ring at low alpha to feel finished, not ugly */}
              <button
                onClick={() => navigate('/perfil')}
                aria-label="Mi perfil"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: '50%',
                    boxShadow: '0 0 0 1px var(--b1n0-border)',
                    transition: 'box-shadow var(--duration-fast) var(--ease-out)',
                    overflow: 'hidden',
                  }}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt=""
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div
