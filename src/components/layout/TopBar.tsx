import { useNavigate, useLocation } from 'react-router-dom'
import { Lightbulb } from '@phosphor-icons/react'
import type { User } from '../../types'
import { useToast } from '../Toast'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

interface TopBarProps {
  user: User
}

const F = 'var(--font-body)'

export function TopBar({ user }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
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
          <img src="/brand/b1n0-logo-white.svg" alt="b1n0" style={{ height: '24px', width: 'auto', objectFit: 'contain', display: 'block' }} />
        </button>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {isLoggedIn ? (
            <>
              {/*
                Bell + Question removed — both live in the floating dock
                at the bottom now, so duplicating them here cluttered the
                top chrome. The TopBar is now: brand wordmark · saldo · avatar.
              */}

              {/*
                Cómo jugar — entry point for the future interactive
                tutorial / guided playthrough. For now it surfaces a
                placeholder toast; we'll wire the actual walkthrough
                in a later session. Saldo display moved out of the
                chrome — users see it on the Perfil page and the
                Inicio page stats row.
              */}
              {/*
                Cómo jugar — sibling to the avatar. Same 34×34 circle,
                same hairline ring via box-shadow (no border, so it sits
                visually flush like the avatar does). The two together
                read as the right side of the chrome: "tip + identity".
              */}
              <button
                onClick={() => toast.showInfo('Pronto: tutorial interactivo. Te vamos a guiar paso a paso.')}
                aria-label="Cómo jugar"
                title="Cómo jugar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'transparent',
                  border: 'none',
                  boxShadow: '0 0 0 1px var(--b1n0-border)',
                  cursor: 'pointer',
                  color: 'var(--b1n0-muted)',
                  flexShrink: 0,
                  transition:
                    'color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--b1n0-text-1)'
                  e.currentTarget.style.boxShadow = '0 0 0 1.5px var(--b1n0-muted)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--b1n0-muted)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--b1n0-border)'
                }}
              >
                <Lightbulb size={16} weight="regular" />
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
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--b1n0-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: F,
                        fontWeight: 600,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--b1n0-text-1)',
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </button>
            </>
          ) : (
            <>
              {/* Question icon also moved to the dock — TopBar logged-out
                  state is now just: brand · "Entrar" pill. */}
              <button
                onClick={() => openAuth('login')}
                style={{
                  padding: 'var(--space-3) var(--space-6)',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: 'var(--b1n0-si)',
                  color: 'var(--b1n0-on-accent)',
                  fontFamily: F,
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  letterSpacing: 'var(--tracking-tight)',
                  cursor: 'pointer',
                  transition: 'background var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--b1n0-si-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--b1n0-si)')}
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

