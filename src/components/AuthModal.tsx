import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Envelope, X, Lock, Eye, EyeSlash, GoogleLogo, AppleLogo } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { useAuthModal } from '../context/AuthModalContext'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const COUNTRIES = [
  { code: 'GT', name: 'Guatemala', dial: '+502' },
  { code: 'SV', name: 'El Salvador', dial: '+503' },
  { code: 'HN', name: 'Honduras', dial: '+504' },
  { code: 'NI', name: 'Nicaragua', dial: '+505' },
  { code: 'CR', name: 'Costa Rica', dial: '+506' },
  { code: 'PA', name: 'Panamá', dial: '+507' },
  { code: 'MX', name: 'México', dial: '+52' },
  { code: 'US', name: 'Estados Unidos', dial: '+1' },
]

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
const pwUpper = /[A-Z]/, pwLower = /[a-z]/, pwDigit = /[0-9]/, pwSpecial = /[^A-Za-z0-9]/

function getAge(dob: string) { const b = new Date(dob), t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a }

interface SignupForm { firstName: string; lastName: string; username: string; dob: string; addr1: string; addr2: string; city: string; state: string; country: string; phoneCode: string; phone: string; email: string; emailConfirm: string; password: string; passwordConfirm: string }

const SIGNUP_DEFAULT: SignupForm = { firstName: '', lastName: '', username: '', dob: '', addr1: '', addr2: '', city: '', state: '', country: 'GT', phoneCode: '+502', phone: '', email: '', emailConfirm: '', password: '', passwordConfirm: '' }

function validate(f: SignupForm) {
  const e: Record<string, string> = {}
  if (!f.firstName.trim()) e.firstName = 'Nombre es obligatorio'
  if (!f.lastName.trim()) e.lastName = 'Apellidos es obligatorio'
  if (!f.username.trim()) e.username = 'Nombre de usuario es obligatorio'
  else if (!usernameRegex.test(f.username)) e.username = '3–20 caracteres, solo letras, números y _'
  if (!f.dob) e.dob = 'Fecha de nacimiento es obligatoria'
  else if (getAge(f.dob) < 18) e.dob = 'Debes tener al menos 18 años'
  if (!f.addr1.trim()) e.addr1 = 'Dirección es obligatoria'
  if (!f.city.trim()) e.city = 'Ciudad es obligatoria'
  if (!f.state.trim()) e.state = 'Departamento es obligatorio'
  if (!f.phone.trim()) e.phone = 'Teléfono es obligatorio'
  if (!f.email.trim()) e.email = 'Correo es obligatorio'
  else if (!emailRegex.test(f.email)) e.email = 'Formato inválido'
  if (f.email !== f.emailConfirm) e.emailConfirm = 'No coinciden'
  if (!f.password) e.password = 'Contraseña es obligatoria'
  else {
    const m: string[] = []
    if (f.password.length < 8) m.push('8+ caracteres')
    if (!pwUpper.test(f.password)) m.push('mayúscula')
    if (!pwLower.test(f.password)) m.push('minúscula')
    if (!pwDigit.test(f.password)) m.push('número')
    if (!pwSpecial.test(f.password)) m.push('especial')
    if (m.length) e.password = 'Requiere: ' + m.join(', ')
  }
  if (f.password !== f.passwordConfirm) e.passwordConfirm = 'No coinciden'
  return e
}

/**
 * IconInput — styled text/email/password input with a leading Phosphor
 * icon, an optional trailing slot (used for the eye-toggle on password
 * fields), and a hairline border that brightens on focus. The whole
 * row is a flex container so the icon and trailing element vertically
 * center next to the input itself.
 */
function IconInput({
  icon,
  type,
  placeholder,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  trailing,
}: {
  icon: React.ReactNode
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  minLength?: number
  autoComplete?: string
  trailing?: React.ReactNode
}) {
  const [focus, setFocus] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--b1n0-surface)',
        border: `1px solid ${focus ? 'var(--b1n0-text-2)' : 'var(--b1n0-border)'}`,
        borderRadius: 'var(--radius-md)',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          fontFamily: F,
          fontSize: 'var(--text-sm)',
          color: 'var(--b1n0-text-1)',
          minWidth: 0,
        }}
      />
      {trailing}
    </div>
  )
}

/**
 * OAuthButton — full-width button used for the "Continuar con Google /
 * Apple" rows. Rendered as a quiet outline button so the primary
 * action (email submit) stays the loudest element on the form.
 */
function OAuthButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--b1n0-surface)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontFamily: F,
        fontWeight: 600,
        fontSize: 'var(--text-sm)',
        color: 'var(--b1n0-text-1)',
        transition: 'border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--b1n0-text-2)'
        e.currentTarget.style.background = 'var(--b1n0-card)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--b1n0-border)'
        e.currentTarget.style.background = 'var(--b1n0-surface)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

export function AuthModal() {
  const { isOpen, closeAuth, initialTab } = useAuthModal()
  const { signIn, signUp, session } = useAuth()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [loginShowPw, setLoginShowPw] = useState(false)
  const [form, setForm] = useState<SignupForm>({ ...SIGNUP_DEFAULT })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  useEffect(() => { if (isOpen) { setTab(initialTab); setSignupDone(false) } }, [isOpen, initialTab])
  useEffect(() => { if (session) closeAuth() }, [session, closeAuth])

  const errors = useMemo(() => validate(form), [form])

  function setField(key: keyof SignupForm, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'country') { const c = COUNTRIES.find(c => c.code === value); if (c) next.phoneCode = c.dial }
      return next
    })
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    const err = await signIn(loginEmail, loginPw)
    if (err) setError(err)
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    const allTouched: Record<string, boolean> = {}
    Object.keys(form).forEach(k => { allTouched[k] = true })
    setTouched(allTouched)
    if (Object.keys(errors).length > 0) return
    setError(null); setLoading(true)
    const err = await signUp(form.email, form.password, {
      firstName: form.firstName, lastName: form.lastName, username: form.username,
      dob: form.dob, phone: form.phoneCode + form.phone, phoneCountryCode: form.phoneCode,
      address: { line1: form.addr1, line2: form.addr2, city: form.city, state: form.state, country: form.country },
    })
    if (err) setError(err)
    else setSignupDone(true)
    setLoading(false)
  }

  if (!isOpen) return null

  if (signupDone) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={() => { setSignupDone(false); closeAuth() }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'relative', maxWidth: 420, width: '90%', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '36px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--b1n0-si-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-5)' }}>
            <Envelope size={28} weight="regular" color="var(--b1n0-si)" />
          </div>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '8px' }}>Revisá tu correo</p>
          <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.6, marginBottom: '6px' }}>
            Enviamos un link a <strong style={{ color: 'var(--b1n0-text-1)' }}>{form.email}</strong>
          </p>
          <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.6 }}>
            Confirmá y ya podés entrar.
          </p>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', lineHeight: 1.5, marginTop: '12px', opacity: 0.7 }}>
            ¿No lo ves? Revisá tu carpeta de spam o correo no deseado.
          </p>
          <button
            onClick={() => { setSignupDone(false); closeAuth() }}
            style={{ marginTop: '20px', padding: '12px 28px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
          >
            Entendido
          </button>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={closeAuth} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{ position: 'relative', maxWidth: 420, width: '90%', maxHeight: '90dvh', overflowY: 'auto', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>

        {/* Close button */}
        <button
          onClick={closeAuth}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--space-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            color: 'var(--b1n0-muted)',
            transition: 'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--b1n0-text-1)'
            e.currentTarget.style.background = 'var(--b1n0-surface)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--b1n0-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <X size={18} weight="bold" />
        </button>

        {/* Header — logo + country pills, perfectly centered.
            Tagline removed — the logo carries the moment on its own. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 'var(--space-6)',
          }}
        >
          <img
            src="/b1n0-logov2.png"
            alt="b1n0"
            style={{
              height: '38px',
              width: 'auto',
              objectFit: 'contain',
              marginBottom: 'var(--space-4)',
              display: 'block',
            }}
          />
          {/* Country pills — geographic specificity is a trust signal in CA */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-1)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {['GT', 'SV', 'HN', 'NI', 'CR'].map((c) => (
              <span
                key={c}
                style={{
                  fontFamily: 'var(--font-num)',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'var(--b1n0-muted)',
                  background: 'var(--b1n0-surface)',
                  padding: '3px 7px',
                  borderRadius: 'var(--radius-pill)',
                  letterSpacing: 'var(--tracking-caps)',
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* OAuth providers — placeholders until Supabase OAuth is wired.
            Visually significant because they tell the user "you have
            options" without committing to email-only flow. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          <OAuthButton
            label="Continuar con Google"
            icon={<GoogleLogo size={18} weight="bold" />}
            onClick={() => setError('Pronto: inicio de sesión con Google.')}
          />
          <OAuthButton
            label="Continuar con Apple"
            icon={<AppleLogo size={18} weight="fill" />}
            onClick={() => setError('Pronto: inicio de sesión con Apple.')}
          />
        </div>

        {/* "or" divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--b1n0-border)' }} />
          <span
            style={{
              fontFamily: F,
              fontSize: 'var(--text-2xs)',
              fontWeight: 600,
              color: 'var(--b1n0-muted)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)',
            }}
          >
            o con email
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--b1n0-border)' }} />
        </div>

        {/* Tab switcher — slim segmented control with a sliding teal bar
            indicator under the active tab instead of a heavy filled pill.
            That way the only "loud" teal element is the submit button. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            marginBottom: 'var(--space-5)',
            borderBottom: '1px solid var(--b1n0-border)',
          }}
        >
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setError(null)
              }}
              style={{
                flex: 1,
                padding: 'var(--space-3) var(--space-2)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: F,
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                color: tab === t ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                letterSpacing: 'var(--tracking-tight)',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
            >
              {t === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
          {/* Sliding indicator — animates left/right when tabs change */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -1,
              left: tab === 'login' ? 0 : '50%',
              width: '50%',
              height: 2,
              background: 'var(--b1n0-si)',
              borderRadius: '2px 2px 0 0',
              transition: 'left var(--duration-base) var(--ease-out)',
            }}
          />
        </div>

        {/* Login */}
        {tab === 'login' && (
          <form
            onSubmit={handleLogin}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              animation: 'authSlideIn 0.28s var(--ease-out)',
            }}
          >
            <IconInput
              icon={<Envelope size={16} weight="regular" />}
              type="email"
              placeholder="Correo electrónico"
              value={loginEmail}
              onChange={(v) => setLoginEmail(v)}
              required
              autoComplete="email"
            />
            <IconInput
              icon={<Lock size={16} weight="regular" />}
              type={loginShowPw ? 'text' : 'password'}
              placeholder="Contraseña"
              value={loginPw}
              onChange={(v) => setLoginPw(v)}
              required
              minLength={6}
              autoComplete="current-password"
              trailing={
                <button
                  type="button"
                  onClick={() => setLoginShowPw((v) => !v)}
                  aria-label={loginShowPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 'var(--space-1)',
                    color: 'var(--b1n0-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {loginShowPw ? <EyeSlash size={16} weight="regular" /> : <Eye size={16} weight="regular" />}
                </button>
              }
            />

            {/* Forgot password link — centered for symmetry with the
                rest of the centered chrome. */}
            <a
              href="/auth?recover=1"
              onClick={(e) => {
                e.preventDefault()
                closeAuth()
                window.location.href = '/auth?recover=1'
              }}
              style={{
                fontFamily: F,
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                color: 'var(--b1n0-muted)',
                textDecoration: 'none',
                alignSelf: 'center',
                padding: '2px 0',
                marginTop: 'calc(var(--space-1) * -1)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-muted)')}
            >
              ¿Olvidaste tu contraseña?
            </a>

            {error && (
              <p
                style={{
                  fontFamily: F,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--b1n0-no)',
                  textAlign: 'center',
                  background: 'var(--b1n0-no-bg)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--b1n0-no-border)',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: loading ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-si)',
                color: 'var(--b1n0-on-accent)',
                fontFamily: F,
                fontWeight: 700,
                fontSize: 'var(--text-base)',
                letterSpacing: 'var(--tracking-tight)',
                cursor: loading ? 'default' : 'pointer',
                marginTop: 'var(--space-2)',
                transition: 'background var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--b1n0-si-hover)'
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--b1n0-si)'
              }}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}

        {/* Signup */}
        {tab === 'signup' && (
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder="Nombre *" value={form.firstName} onChange={e => setField('firstName', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="Apellidos *" value={form.lastName} onChange={e => setField('lastName', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <input placeholder="Nombre de usuario *" value={form.username} onChange={e => setField('username', e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={form.country} onChange={e => setField('country', e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <input type="date" placeholder="Fecha nacimiento *" value={form.dob} onChange={e => setField('dob', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <input placeholder="Dirección *" value={form.addr1} onChange={e => setField('addr1', e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder="Ciudad *" value={form.city} onChange={e => setField('city', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="Depto/Estado *" value={form.state} onChange={e => setField('state', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ ...inputStyle, width: '70px', textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--b1n0-muted)', fontSize: '13px' }}>{form.phoneCode}</span>
              <input placeholder="Teléfono *" value={form.phone} onChange={e => setField('phone', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <input type="email" placeholder="Correo electrónico *" value={form.email} onChange={e => setField('email', e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Confirmar correo *" value={form.emailConfirm} onChange={e => setField('emailConfirm', e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Contraseña *" value={form.password} onChange={e => setField('password', e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Confirmar contraseña *" value={form.passwordConfirm} onChange={e => setField('passwordConfirm', e.target.value)} style={inputStyle} />
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', textAlign: 'center' }}>{error}</p>}
            {touched.firstName && Object.keys(errors).length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-error)', lineHeight: 1.4 }}>
                {Object.values(errors).slice(0, 3).join(' · ')}
              </p>
            )}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none', background: loading ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        )}

        {/* Footer — small print + tab-switch animation keyframe */}
        <p
          style={{
            marginTop: 'var(--space-5)',
            fontFamily: F,
            fontSize: 'var(--text-2xs)',
            color: 'var(--b1n0-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Al continuar, aceptás los{' '}
          <a
            href="/terminos"
            onClick={(e) => {
              e.preventDefault()
              closeAuth()
              window.location.href = '/terminos'
            }}
            style={{ color: 'var(--b1n0-text-2)', textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-2)')}
          >
            Términos
          </a>
          {' y '}
          <a
            href="/privacidad"
            onClick={(e) => {
              e.preventDefault()
              closeAuth()
              window.location.href = '/privacidad'
            }}
            style={{ color: 'var(--b1n0-text-2)', textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-2)')}
          >
            Privacidad
          </a>
          .
        </p>

        {/* Tab-swap micro-motion. Form contents shift a few px on tab
            change so the screen feels like a real product, not a swap. */}
        <style>{`
          @keyframes authSlideIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  )
}
