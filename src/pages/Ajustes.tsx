import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
      <div style={{ flex: 1, paddingRight: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)', marginBottom: description ? '2px' : '0' }}>{label}</p>
        {description && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{description}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{ width: 44, height: 26, borderRadius: '13px', background: value ? 'var(--b1n0-surface)' : 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
      >
        <div style={{ position: 'absolute', top: '3px', left: value ? '21px' : '3px', width: 20, height: 20, borderRadius: '50%', background: 'var(--b1n0-card)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(255,255,255,0.1)' }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
      <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>{label}</span>
      <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>{value}</span>
    </div>
  )
}

function LinkRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <button
      onClick={onPress}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--b1n0-border)', cursor: 'pointer', textAlign: 'left' }}
    >
      <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>{label}</span>
      <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)' }}>›</span>
    </button>
  )
}

export function Ajustes() {
  const navigate = useNavigate()
  const [notifVotos, setNotifVotos] = useState(true)
  const [notifResultados, setNotifResultados] = useState(true)

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0 20px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', fontFamily: F, fontSize: '18px', color: 'var(--b1n0-muted)', lineHeight: 1 }}
        >
          ‹
        </button>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
          Ajustes
        </p>
      </div>

      {/* Notificaciones */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '4px 18px', marginBottom: '14px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '14px 0 4px' }}>
          Notificaciones
        </p>
        <ToggleRow label="Mis votos" description="Cuando terminen los eventos en los que participás" value={notifVotos} onChange={setNotifVotos} />
        <ToggleRow label="Resultados" description="Confirmación inmediata de cobros" value={notifResultados} onChange={setNotifResultados} />
      </div>

      {/* Cuenta */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '4px 18px', marginBottom: '14px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '14px 0 4px' }}>
          Cuenta
        </p>
        <InfoRow label="Usuario" value="@usuario1" />
        <InfoRow label="Nivel" value="Nivel 1" />
        <InfoRow label="Región" value="Guatemala" />
      </div>

      {/* Soporte */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '4px 18px', marginBottom: '14px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '14px 0 4px' }}>
          Soporte
        </p>
        <LinkRow label="Centro de ayuda" />
        <LinkRow label="Reportar un problema" />
        <LinkRow label="Términos y condiciones" />
      </div>

      {/* About */}
      <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '24px' }}>
        b1n0 v0.1.0 · Hecho en Guatemala
      </p>
    </div>
  )
}
