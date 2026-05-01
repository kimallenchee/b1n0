import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DeviceMobile, X, ShareNetwork, Plus } from '@phosphor-icons/react'

/**
 * Install-to-home-screen prompt.
 *
 * Two paths:
 *   1) Android / Chrome / Edge — listens for the `beforeinstallprompt`
 *      event, defers it, then shows our own custom UI when conditions
 *      are met. Tapping "Instalar" calls prompt() on the deferred event.
 *
 *   2) iOS Safari — does NOT fire beforeinstallprompt. We detect iOS +
 *      not-already-standalone and show a sheet that explains the manual
 *      Share → Add to Home Screen flow with the actual iOS icons.
 *
 * Display rules:
 *   - Never on the very first visit (gives the user time to evaluate
 *     the product before begging for installation real estate)
 *   - Honors user-dismissed: stored in localStorage; won't re-prompt
 *     within 7 days of dismissal
 *   - Hides itself when the app is already running standalone
 *
 * Drop in once at the App level — it self-mounts to document.body.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const STORAGE_KEY = 'b1n0-install-prompt-state'
const VISIT_COUNT_KEY = 'b1n0-visit-count'
const MIN_VISITS_BEFORE_PROMPT = 2
const DISMISS_COOLDOWN_DAYS = 7

interface DismissState {
  dismissedAt?: number
  installed?: boolean
}

function readState(): DismissState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeState(s: DismissState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* localStorage may be blocked in private mode — silently no-op */
  }
}

function bumpVisitCount(): number {
  try {
    const n = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1
    localStorage.setItem(VISIT_COUNT_KEY, String(n))
    return n
  } catch {
    return 0
  }
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  // Modern browsers
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari
  // @ts-expect-error — Safari-specific property
  if (window.navigator?.standalone === true) return true
  return false
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosFlow, setIosFlow] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return  // already installed; nothing to do

    const visits = bumpVisitCount()
    const state = readState()

    if (state.installed) return
    if (state.dismissedAt && Date.now() - state.dismissedAt < DISMISS_COOLDOWN_DAYS * 86_400_000) {
      return
    }
    if (visits < MIN_VISITS_BEFORE_PROMPT) return

    // Android / Chrome path
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
      setShow(true)
    }

    // Once installed, suppress forever
    const onInstalled = () => {
      writeState({ ...readState(), installed: true })
      setShow(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari path — no beforeinstallprompt event, so check after a beat
    if (isIOS() && !isInStandaloneMode()) {
      const t = setTimeout(() => setShow(true), 1500)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBeforeInstall)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    writeState({ ...readState(), dismissedAt: Date.now() })
    setShow(false)
    setIosFlow(false)
  }

  const install = async () => {
    if (deferredEvent) {
      await deferredEvent.prompt()
      const choice = await deferredEvent.userChoice
      if (choice.outcome === 'accepted') {
        writeState({ ...readState(), installed: true })
      } else {
        writeState({ ...readState(), dismissedAt: Date.now() })
      }
      setShow(false)
      setDeferredEvent(null)
    } else if (isIOS()) {
      setIosFlow(true)
    }
  }

  if (!show || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-label="Instalar b1n0"
      style={{
        position: 'fixed',
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10002,
        width: 'min(92vw, 380px)',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        padding: 'var(--space-5) var(--space-6)',
      }}
    >
      <button
        onClick={dismiss}
        aria-label="Cerrar"
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          right: 'var(--space-3)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 'var(--space-1)',
          color: 'var(--b1n0-muted)',
          display: 'flex',
        }}
      >
        <X size={14} weight="bold" />
      </button>

      {!iosFlow ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--b1n0-si-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DeviceMobile size={22} weight="fill" color="var(--b1n0-si)" />
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 'var(--text-md)',
                  color: 'var(--b1n0-text-1)',
                  letterSpacing: 'var(--tracking-tight)',
                  lineHeight: 1.2,
                }}
              >
                Instalá b1n0
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--b1n0-muted)',
                  lineHeight: 1.4,
                }}
              >
                Vas más rápido y se ve mejor sin barras del navegador.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button
              onClick={dismiss}
              className="btn-secondary"
              style={{ flex: '0 0 auto', padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-sm)' }}
            >
              Después
            </button>
            <button
              onClick={install}
              className="btn-primary"
              style={{ flex: 1, padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-sm)' }}
            >
              Instalar
            </button>
          </div>
        </>
      ) : (
        /* iOS Safari has no install API — walk the user through the manual flow. */
        <>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-md)',
              color: 'var(--b1n0-text-1)',
              letterSpacing: 'var(--tracking-tight)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Agregar b1n0 al inicio
          </p>
          <ol
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--b1n0-text-2)',
              lineHeight: 1.6,
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--b1n0-surface)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>1</span>
              <span style={{ flex: 1 }}>
                Tocá <ShareNetwork size={14} weight="regular" style={{ verticalAlign: 'middle' }} /> en la barra de Safari
              </span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--b1n0-surface)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>2</span>
              <span style={{ flex: 1 }}>
                Buscá "Agregar a inicio" <Plus size={14} weight="regular" style={{ verticalAlign: 'middle' }} />
              </span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--b1n0-surface)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>3</span>
              <span style={{ flex: 1 }}>Tocá "Agregar" — listo, b1n0 vive en tu pantalla.</span>
            </li>
          </ol>
          <button
            onClick={dismiss}
            className="btn-primary"
            style={{ width: '100%', padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-5)' }}
          >
            Entendido
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
