import { useEffect, useState } from 'react'
import { CheckCircle, ArrowSquareOut, Spinner, WarningCircle } from '@phosphor-icons/react'
import { BottomSheet } from '../BottomSheet'
import { useAuth } from '../../context/AuthContext'
import { activeKycProvider, startDiditSession, subscribeToKycSession, getLatestKycSession } from '../../lib/didit'
import { logger } from '../../lib/logger'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface KYCSheetProps {
  open: boolean
  onClose: () => void
  targetTier: 2 | 3
}

export function KYCSheet({ open, onClose, targetTier }: KYCSheetProps) {
  const provider = activeKycProvider()
  return (
    <BottomSheet open={open} onClose={onClose} title={`Subir a Nivel ${targetTier}`}>
      <div style={{ padding: '0 16px 40px' }}>
        {provider === 'didit'
          ? <DiditFlow targetTier={targetTier} onClose={onClose} />
          : <ManualFlow targetTier={targetTier} onClose={onClose} />
        }
      </div>
    </BottomSheet>
  )
}

// ────────────────────────────────────────────────────────────────────
// DIDIT — verification via hosted session redirect
// ────────────────────────────────────────────────────────────────────
type DiditUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'in_progress'; url: string }
  | { kind: 'in_review' }
  | { kind: 'approved' }
  | { kind: 'declined' }

function DiditFlow({ targetTier, onClose }: { targetTier: 2 | 3; onClose: () => void }) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [state, setState] = useState<DiditUiState>({ kind: 'idle' })

  // On mount: check if there's already an in-flight session
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getLatestKycSession(userId).then((row) => {
      if (cancelled || !row) return
      const s = row.status
      if (s === 'Approved') setState({ kind: 'approved' })
      else if (s === 'Declined') setState({ kind: 'declined' })
      else if (s === 'In Review') setState({ kind: 'in_review' })
      else if ((s === 'In Progress' || s === 'Not Started') && row.verification_url) {
        setState({ kind: 'in_progress', url: row.verification_url })
      }
    })
    return () => { cancelled = true }
  }, [userId])

  // Subscribe to status changes via realtime
  useEffect(() => {
    if (!userId) return
    return subscribeToKycSession(userId, () => setState({ kind: 'approved' }))
  }, [userId])

  const handleStart = async () => {
    setState({ kind: 'loading' })
    try {
      const { verificationUrl } = await startDiditSession(targetTier)
      // Redirect to Didit's hosted flow; user comes back to /perfil?kyc=complete
      window.location.href = verificationUrl
    } catch (err) {
      logger.error('KYC: Didit session failed', { error: err })
      setState({ kind: 'error', message: 'No pudimos iniciar la verificación. Intentá de nuevo.' })
    }
  }

  // ── Render states ───────────────────────────────────────────────
  if (state.kind === 'approved') {
    return (
      <SuccessPanel
        title="¡Verificado!"
        body={`Tu cuenta es Nivel ${targetTier}. Ya podés hacer llamados hasta el nuevo límite.`}
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'declined') {
    return (
      <ErrorPanel
        title="No pudimos verificar"
        body="La verificación no fue aprobada. Podés intentarlo de nuevo o escribirnos a soporte@b1n0.com."
        cta="Intentar de nuevo"
        onCta={handleStart}
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'in_review') {
    return (
      <InfoPanel
        title="En revisión"
        body="Tu verificación está siendo revisada por nuestro equipo. Te notificamos en máximo 24 horas hábiles."
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'in_progress') {
    return (
      <div>
        <Heading title="Verificación pendiente" body="Empezaste tu verificación pero no la completaste. Continuá donde quedaste." />
        <CTAButton onClick={() => { window.location.href = state.url }} icon={<ArrowSquareOut size={18} weight="bold" />}>
          Continuar verificación
        </CTAButton>
      </div>
    )
  }

  if (state.kind === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <Spinner size={36} color="var(--b1n0-si)" className="spin" />
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginTop: '14px' }}>
          Preparando verificación...
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return <ErrorPanel title="Algo salió mal" body={state.message} cta="Reintentar" onCta={handleStart} onClose={onClose} />
  }

  // idle — initial CTA
  return (
    <div>
      <Heading
        title={`Verificá tu identidad`}
        body={
          targetTier === 2
            ? 'Para subir a Nivel 2 verificamos tu DPI con foto y un selfie. Toma 2 minutos.'
            : 'Para subir a Nivel 3 hacemos verificación completa con AML/PEP screening. Toma 3 minutos.'
        }
      />
      <CheckList items={
        targetTier === 2
          ? ['Foto de tu DPI o documento de identidad', 'Un selfie para confirmar que sos vos', 'Verificación en vivo de menos de 2 minutos']
          : ['Foto de tu DPI o pasaporte', 'Selfie con verificación de vida', 'Validación contra listas de sanciones (AML/PEP)']
      } />
      <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', margin: '16px 0', lineHeight: 1.5 }}>
        Usamos Didit como proveedor de verificación. Tus documentos se procesan de forma segura y no se comparten con terceros.
      </p>
      <CTAButton onClick={handleStart}>Comenzar verificación →</CTAButton>
    </div>
  )
}

// ── Small shared UI bits ──────────────────────────────────────────
function Heading({ title, body }: { title: string; body: string }) {
  return (
    <>
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>{title}</p>
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px', lineHeight: 1.5 }}>{body}</p>
    </>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <CheckCircle size={18} weight="fill" color="var(--b1n0-si)" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-2)', lineHeight: 1.5 }}>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function CTAButton({ onClick, children, icon }: { onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-si)', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-si-fg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
    >
      {icon}
      {children}
    </button>
  )
}

function SuccessPanel({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
        <CheckCircle size={56} weight="fill" color="var(--b1n0-si)" />
      </div>
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '8px' }}>{title}</p>
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '28px', lineHeight: 1.5 }}>{body}</p>
      <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-bg)' }}>
        Cerrar
      </button>
    </div>
  )
}

function InfoPanel({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <Spinner size={48} color="var(--b1n0-text-2)" className="spin" />
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', margin: '16px 0 8px' }}>{title}</p>
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '28px', lineHeight: 1.5 }}>{body}</p>
      <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--b1n0-border)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>
        Cerrar
      </button>
    </div>
  )
}

function ErrorPanel({ title, body, cta, onCta, onClose }: { title: string; body: string; cta: string; onCta: () => void; onClose: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <WarningCircle size={48} weight="fill" color="var(--b1n0-error)" />
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', margin: '12px 0 8px' }}>{title}</p>
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px', lineHeight: 1.5 }}>{body}</p>
      <button onClick={onCta} style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-si)', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-si-fg)', marginBottom: '8px' }}>
        {cta}
      </button>
      <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
        Cerrar
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// MANUAL — legacy 3-step flow (kept as fallback when provider != didit)
// ────────────────────────────────────────────────────────────────────
function ManualFlow({ targetTier, onClose }: { targetTier: 2 | 3; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dpi, setDpi] = useState('')
  const [photoReady, setPhotoReady] = useState(false)

  const handleClose = () => {
    setStep(1); setDpi(''); setPhotoReady(false); onClose()
  }

  return (
    <>
      {/* Progress bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: step >= s ? 'var(--b1n0-surface)' : 'var(--b1n0-border)', transition: 'background 0.2s' }} />
        ))}
      </div>

      {step === 1 && (
        <>
          <Heading title="Documento de identidad" body="Ingresá tu número de DPI para verificar tu identidad." />
          <input
            type="text"
            value={dpi}
            onChange={(e) => setDpi(e.target.value.replace(/\D/g, '').slice(0, 13))}
            placeholder="0000 00000 0101"
            style={{ width: '100%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '13px 16px', fontFamily: F, fontSize: '16px', color: 'var(--b1n0-text-1)', outline: 'none', marginBottom: '20px', boxSizing: 'border-box', letterSpacing: '1px' }}
          />
          <button
            onClick={() => dpi.length >= 8 && setStep(2)}
            disabled={dpi.length < 8}
            style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none', background: dpi.length >= 8 ? 'var(--b1n0-surface)' : 'var(--b1n0-disabled-bg)', cursor: dpi.length >= 8 ? 'pointer' : 'default', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', transition: 'background 0.15s' }}
          >
            Continuar →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <Heading title="Foto del documento" body="Subí una foto clara del frente de tu DPI sin reflejos." />
          <div
            onClick={() => setPhotoReady(!photoReady)}
            style={{ border: `2px dashed ${photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-border)'}`, borderRadius: 'var(--radius-lg)', padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px', background: photoReady ? 'var(--b1n0-card)' : 'transparent', transition: 'all 0.2s' }}
          >
            <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)', marginBottom: '6px' }}>{photoReady ? '✓' : '+'}</p>
            <p style={{ fontFamily: F, fontSize: '13px', color: photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-muted)' }}>
              {photoReady ? 'Foto lista' : 'Tocar para subir foto'}
            </p>
          </div>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginBottom: '20px' }}>
            También podés elegir desde tu galería
          </p>
          <button
            onClick={() => photoReady && setStep(3)}
            disabled={!photoReady}
            style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none', background: photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-disabled-bg)', cursor: photoReady ? 'pointer' : 'default', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', transition: 'background 0.15s' }}
          >
            Enviar verificación →
          </button>
        </>
      )}

      {step === 3 && (
        <SuccessPanel
          title="Verificación enviada"
          body={`Revisamos tu solicitud en 24–48 horas. Te notificamos cuando tu cuenta suba a Nivel ${targetTier}.`}
          onClose={handleClose}
        />
      )}
    </>
  )
}
