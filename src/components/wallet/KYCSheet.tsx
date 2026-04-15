import { useState } from 'react'
import { BottomSheet } from '../BottomSheet'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface KYCSheetProps {
  open: boolean
  onClose: () => void
  targetTier: 2 | 3
}

export function KYCSheet({ open, onClose, targetTier }: KYCSheetProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dpi, setDpi] = useState('')
  const [photoReady, setPhotoReady] = useState(false)

  const handleClose = () => {
    setStep(1)
    setDpi('')
    setPhotoReady(false)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={`Subir a Nivel ${targetTier}`}>
      <div style={{ padding: '0 16px 40px' }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: step >= s ? 'var(--b1n0-surface)' : 'var(--b1n0-border)', transition: 'background 0.2s' }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
              Documento de identidad
            </p>
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              Ingresá tu número de DPI para verificar tu identidad.
            </p>
            <input
              type="text"
              value={dpi}
              onChange={(e) => setDpi(e.target.value.replace(/\D/g, '').slice(0, 13))}
              placeholder="0000 00000 0101"
              style={{ width: '100%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '13px 16px', fontFamily: F, fontSize: '16px', color: 'var(--b1n0-text-1)', outline: 'none', marginBottom: '20px', boxSizing: 'border-box', letterSpacing: '1px' }}
            />
            <button
              onClick={() => dpi.length >= 8 && setStep(2)}
              disabled={dpi.length < 8}
              style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: dpi.length >= 8 ? 'var(--b1n0-surface)' : 'var(--b1n0-disabled-bg)', cursor: dpi.length >= 8 ? 'pointer' : 'default', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', transition: 'background 0.15s' }}
            >
              Continuar →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
              Foto del documento
            </p>
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              Subí una foto clara del frente de tu DPI sin reflejos.
            </p>
            <div
              onClick={() => setPhotoReady(!photoReady)}
              style={{ border: `2px dashed ${photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-border)'}`, borderRadius: '14px', padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px', background: photoReady ? 'var(--b1n0-card)' : 'transparent', transition: 'all 0.2s' }}
            >
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)', marginBottom: '6px' }}>
                {photoReady ? '✓' : '+'}
              </p>
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
              style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: photoReady ? 'var(--b1n0-surface)' : 'var(--b1n0-disabled-bg)', cursor: photoReady ? 'pointer' : 'default', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', transition: 'background 0.15s' }}
            >
              Enviar verificación →
            </button>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontFamily: D, fontWeight: 800, fontSize: '48px', color: 'var(--b1n0-text-1)', marginBottom: '12px' }}>✓</div>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '8px' }}>
              Verificación enviada
            </p>
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '28px', lineHeight: 1.5 }}>
              Revisamos tu solicitud en 24–48 horas. Te notificamos cuando tu cuenta suba a Nivel {targetTier}.
            </p>
            <button
              onClick={handleClose}
              style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-bg)' }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
