import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

/* ── Country list (full ISO) ─────────────────────────────────────────────── */
const COUNTRIES = [
  { code: 'GT', name: 'Guatemala', dial: '+502' },
  { code: 'SV', name: 'El Salvador', dial: '+503' },
  { code: 'HN', name: 'Honduras', dial: '+504' },
  { code: 'NI', name: 'Nicaragua', dial: '+505' },
  { code: 'CR', name: 'Costa Rica', dial: '+506' },
  { code: 'PA', name: 'Panamá', dial: '+507' },
  { code: 'MX', name: 'México', dial: '+52' },
  { code: 'US', name: 'Estados Unidos', dial: '+1' },
  { code: 'CO', name: 'Colombia', dial: '+57' },
  { code: 'PE', name: 'Perú', dial: '+51' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'BR', name: 'Brasil', dial: '+55' },
  { code: 'EC', name: 'Ecuador', dial: '+593' },
  { code: 'VE', name: 'Venezuela', dial: '+58' },
  { code: 'DO', name: 'República Dominicana', dial: '+1' },
  { code: 'BO', name: 'Bolivia', dial: '+591' },
  { code: 'PY', name: 'Paraguay', dial: '+595' },
  { code: 'UY', name: 'Uruguay', dial: '+598' },
  { code: 'ES', name: 'España', dial: '+34' },
  { code: 'BZ', name: 'Belice', dial: '+501' },
]

/* ── Validation helpers ──────────────────────────────────────────────────── */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
const pwUpper = /[A-Z]/
const pwLower = /[a-z]/
const pwDigit = /[0-9]/
const pwSpecial = /[^A-Za-z0-9]/

function getAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function pwStrength(pw: string): { label: string; color: string; pct: number } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (pwUpper.test(pw)) score++
  if (pwLower.test(pw)) score++
  if (pwDigit.test(pw)) score++
  if (pwSpecial.test(pw)) score++
  if (score <= 2) return { label: 'Débil', color: '#f87171', pct: 33 }
  if (score <= 4) return { label: 'Media', color: '#FFD474', pct: 66 }
  return { label: 'Fuerte', color: '#4ade80', pct: 100 }
}

/* ── Signup form state ───────────────────────────────────────────────────── */
interface SignupForm {
  firstName: string
  lastName: string
  username: string
  dob: string
  addr1: string
  addr2: string
  city: string
  state: string
  country: string
  phoneCode: string
  phone: string
  email: string
  emailConfirm: string
  password: string
  passwordConfirm: string
}

const SIGNUP_DEFAULT: SignupForm = {
  firstName: '', lastName: '', username: '', dob: '',
  addr1: '', addr2: '', city: '', state: '', country: 'GT',
  phoneCode: '+502', phone: '',
  email: '', emailConfirm: '', password: '', passwordConfirm: '',
}

function validateSignup(f: SignupForm): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.firstName.trim()) e.firstName = 'Nombre es obligatorio'
  if (!f.lastName.trim()) e.lastName = 'Apellidos es obligatorio'
  if (!f.username.trim()) e.username = 'Nombre de usuario es obligatorio'
  else if (!usernameRegex.test(f.username)) e.username = '3–20 caracteres, solo letras, números y guión bajo'
  if (!f.dob) e.dob = 'Fecha de nacimiento es obligatoria'
  else if (getAge(f.dob) < 18) e.dob = 'Debes tener al menos 18 años para registrarte'
  if (!f.addr1.trim()) e.addr1 = 'Dirección es obligatoria'
  if (!f.city.trim()) e.city = 'Ciudad es obligatoria'
  if (!f.state.trim()) e.state = 'Departamento / Estado es obligatorio'
  if (!f.country) e.country = 'País es obligatorio'
  if (!f.phone.trim()) e.phone = 'Teléfono es obligatorio'
  else if (!/^\d{7,15}$/.test(f.phone.replace(/\s/g, ''))) e.phone = 'Número inválido'
  if (!f.email.trim()) e.email = 'Correo electrónico es obligatorio'
  else if (!emailRegex.test(f.email)) e.email = 'Formato de correo inválido'
  if (!f.emailConfirm.trim()) e.emailConfirm = 'Confirmá tu correo'
  else if (f.email !== f.emailConfirm) e.emailConfirm = 'Los correos no coinciden'
  if (!f.password) e.password = 'Contraseña es obligatoria'
  else {
    const missing: string[] = []
    if (f.password.length < 8) missing.push('mínimo 8 caracteres')
    if (!pwUpper.test(f.password)) missing.push('una mayúscula')
    if (!pwLower.test(f.password)) missing.push('una minúscula')
    if (!pwDigit.test(f.password)) missing.push('un número')
    if (!pwSpecial.test(f.password)) missing.push('un carácter especial')
    if (missing.length) e.password = 'Requiere: ' + missing.join(', ')
  }
  if (!f.passwordConfirm) e.passwordConfirm = 'Confirmá tu contraseña'
  else if (f.password !== f.passwordConfirm) e.passwordConfirm = 'Las contraseñas no coinciden'
  return e
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [confirmed, setConfirmed] = useState(false)

  // Detect email confirmation redirect
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=signup') || hash.includes('type=email')) {
      setConfirmed(true)
      setTab('login')
      window.history.replaceState(null, '', '/auth')
    }
  }, [])

  // Login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')

  // Signup state
  const [form, setForm] = useState<SignupForm>({ ...SIGNUP_DEFAULT })
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Shared state
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const errors = useMemo(() => validateSignup(form), [form])
  const isValid = Object.keys(errors).length === 0
  const strength = useMemo(() => pwStrength(form.password), [form.password])

  function setField(key: keyof SignupForm, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Sync phone code when country changes
      if (key === 'country') {
        const c = COUNTRIES.find(c => c.code === value)
        if (c) next.phoneCode = c.dial
      }
      return next
    })
  }

  function blur(key: string) {
    setTouched(prev => ({ ...prev, [key]: true }))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: '10px',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  }

  const inputErrorStyle: React.CSSProperties = {
    ...inputStyle, border: '1px solid #f87171',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: F, fontSize: '12px', fontWeight: 600,
    color: 'var(--b1n0-muted)', marginBottom: '4px', display: 'block',
  }

  const errorTextStyle: React.CSSProperties = {
    fontFamily: F, fontSize: '11px', color: '#f87171',
    marginTop: '3px', lineHeight: 1.3,
  }

  function Field({ name, label, required, children }: { name: string; label: string; required?: boolean; children: React.ReactNode }) {
    const showErr = touched[name] && errors[name]
    return (
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>{label}{required && <span style={{ color: '#f87171' }}> *</span>}</label>
        {children}
        {showErr && <p style={errorTextStyle}>{errors[name]}</p>}
      </div>
    )
  }

  /* ── Login submit ─── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    const err = await signIn(loginEmail, loginPw)
    if (err) setError(err)
    setLoading(false)
  }

  /* ── Signup submit ─── */
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    // Touch all fields to show errors
    const allTouched: Record<string, boolean> = {}
    Object.keys(form).forEach(k => { allTouched[k] = true })
    setTouched(allTouched)
    if (!isValid) return

    setError(null); setLoading(true)
    const err = await signUp(form.email, form.password, {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      username: form.username.trim(),
      dob: form.dob,
      address: {
        line1: form.addr1.trim(),
        line2: form.addr2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country,
      },
      phone: form.phoneCode + form.phone.replace(/\s/g, ''),
      phoneCountryCode: form.phoneCode,
    })
    if (err) setError(err)
    else setSignupDone(true)
    setLoading(false)
  }

  /* ── Password reset ─── */
  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    const result = await resetPassword(loginEmail)
    if ('error' in result) setError(result.error)
    else setTempPassword(result.tempPassword || '')
    setLoading(false)
  }

  /* ── Temp password screen ─── */
  if (tempPassword !== null) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '26px', color: 'var(--b1n0-text-1)', marginBottom: '12px', letterSpacing: '-0.5px' }}>
            Contraseña temporal
          </p>
          {tempPassword ? (
            <>
              <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
                Tu nueva contraseña temporal para <strong style={{ color: 'var(--b1n0-text-1)' }}>{loginEmail}</strong>:
              </p>
              <div style={{ background: 'var(--b1n0-card)', border: '2px dashed rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 24px', marginBottom: '20px' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 700, color: 'var(--b1n0-text-1)', letterSpacing: '2px', userSelect: 'all' }}>
                  {tempPassword}
                </p>
              </div>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', lineHeight: 1.5, marginBottom: '24px' }}>
                Usá esta contraseña para iniciar sesión. Se te pedirá cambiarla inmediatamente.
              </p>
            </>
          ) : (
            <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.6, marginBottom: '24px' }}>
              Si <strong style={{ color: 'var(--b1n0-text-1)' }}>{loginEmail}</strong> tiene una cuenta, se generó una contraseña temporal.
            </p>
          )}
          <button
            onClick={() => { setTempPassword(null); setForgotMode(false); setTab('login'); setError(null); setLoginPw('') }}
            style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--b1n0-text-1)', color: '#fff', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  /* ── Forgot password screen ─── */
  if (forgotMode) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: 380, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <p style={{ fontFamily: D, fontWeight: 800, fontSize: '38px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px', marginBottom: '6px' }}>b1n0</p>
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Recuperá tu cuenta</p>
          </div>
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '20px', padding: '28px 24px' }}>
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              Ingresá tu correo y te generaremos una contraseña temporal.
            </p>
            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="email" placeholder="Correo electrónico" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required style={inputStyle} />
              {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', textAlign: 'center' }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: loading ? 'rgba(255,255,255,0.12)' : 'var(--b1n0-surface)', color: '#fff', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer', marginTop: '4px' }}>
                {loading ? 'Generando...' : 'Generar contraseña'}
              </button>
            </form>
            <button onClick={() => { setForgotMode(false); setError(null) }} style={{ marginTop: '16px', width: '100%', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Volver
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Signup confirmation screen ─── */
  if (signupDone) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '26px', color: 'var(--b1n0-text-1)', marginBottom: '12px', letterSpacing: '-0.5px' }}>
            Revisá tu correo
          </p>
          <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.6 }}>
            Enviamos un link a <strong style={{ color: 'var(--b1n0-text-1)' }}>{form.email}</strong>. Confirmá y volvé acá para entrar.
          </p>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', lineHeight: 1.5, marginTop: '8px', opacity: 0.7 }}>
            ¿No lo ves? Revisá tu carpeta de spam o correo no deseado.
          </p>
          <button
            onClick={() => { setSignupDone(false); setTab('login') }}
            style={{ marginTop: '24px', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-text-1)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Ya confirmé → Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  /* ── Main auth screen ──────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', overflowY: 'auto' }}>

      {/* ════════ LANDING HERO ════════ */}
      <section style={{ background: 'var(--b1n0-surface)', padding: '0 24px', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle pattern overlay */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(45deg, #4ade80 0, #4ade80 1px, transparent 1px, transparent 20px)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '60px 0 50px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
            <img src="/b1n0-logo.png" alt="B1N0" style={{ height: 'clamp(60px, 10vw, 90px)', objectFit: 'contain' }} />
            <p style={{ fontFamily: F, fontSize: 'clamp(14px, 2.5vw, 18px)', color: 'var(--b1n0-text-2)', maxWidth: '520px', lineHeight: 1.6, margin: 0 }}>
              La plataforma de predicciones de Latinoamérica. Todo es 0 o 1 — <span style={{ color: '#4ade80', fontWeight: 600 }}>¿acertás o no?</span>
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button onClick={() => { setTab('signup'); document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ padding: '14px 32px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #4ade80 0%, #5CBFA0 100%)', color: 'var(--b1n0-surface)', fontFamily: F, fontWeight: 700, fontSize: '15px', cursor: 'pointer', transition: 'transform 0.15s' }}>
                Empezar ahora
              </button>
              <button onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ padding: '14px 32px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--b1n0-surface)', fontFamily: F, fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>
                ¿Cómo funciona?
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ CÓMO FUNCIONA ════════ */}
      <section id="como-funciona" style={{ padding: '60px 24px', background: 'var(--b1n0-bg)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '32px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', marginBottom: '8px' }}>¿Cómo funciona?</p>
          <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', marginBottom: '40px' }}>Tres pasos simples para empezar a predecir</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {[
              { step: '1', title: 'Elegí un evento', desc: 'Política, deportes, economía, cultura — eventos reales que te importan.', color: '#FFD474' },
              { step: '2', title: 'Hacé tu llamado', desc: 'Todo es binario: sí o no, pasa o no pasa. Simple.', color: '#4ade80' },
              { step: '3', title: 'Cobrá si acertás', desc: 'Los precios se calculan en tiempo real según las posiciones.', color: '#FFD474' },
            ].map(s => (
              <div key={s.step} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '28px 24px', textAlign: 'left', position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                  <span style={{ fontFamily: D, fontWeight: 800, fontSize: '15px', color: 'var(--b1n0-surface)' }}>{s.step}</span>
                </div>
                <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>{s.title}</p>
                <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ TRUST SIGNALS ════════ */}
      <section style={{ padding: '40px 24px 20px', background: 'var(--b1n0-bg)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
            {[
              { val: '100%', label: 'Transparente' },
              { val: '<2min', label: 'Para empezar' },
              { val: '24/7', label: 'Mercados abiertos' },
              { val: 'SSL', label: 'Datos seguros' },
            ].map(t => (
              <div key={t.label} style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>{t.val}</p>
                <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ AUTH SECTION ════════ */}
      <section id="auth-section" style={{ padding: '40px 24px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ maxWidth: 420, width: '100%', paddingTop: tab === 'signup' ? '20px' : 0, paddingBottom: '40px' }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/b1n0-logo.png" alt="B1N0" style={{ height: '40px', objectFit: 'contain', marginBottom: '6px' }} />
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Predicciones que importan</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '20px', padding: '28px 24px' }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '12px', padding: '3px', marginBottom: '24px' }}>
            {(['login', 'signup'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(null) }} style={{
                flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                fontFamily: F, fontWeight: 600, fontSize: '13px',
                background: tab === t ? 'var(--b1n0-surface)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--b1n0-muted)', transition: 'all 0.15s',
              }}>
                {t === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          {/* ─── LOGIN FORM ─── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {confirmed && (
                <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '10px', padding: '12px 16px', textAlign: 'center', marginBottom: '4px' }}>
                  <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: '#4ade80', margin: 0 }}>
                    Cuenta confirmada — iniciá sesión
                  </p>
                </div>
              )}
              <input type="email" placeholder="Correo electrónico" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Contraseña" value={loginPw} onChange={e => setLoginPw(e.target.value)} required minLength={6} style={inputStyle} />
              {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', textAlign: 'center', padding: '0 4px' }}>{error}</p>}
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
                background: loading ? 'rgba(255,255,255,0.12)' : 'var(--b1n0-surface)', color: '#fff',
                fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer', marginTop: '4px',
              }}>
                {loading ? 'Cargando...' : 'Entrar'}
              </button>
              <button type="button" onClick={() => { setForgotMode(true); setError(null) }} style={{ marginTop: '8px', width: '100%', fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          {/* ─── SIGNUP FORM ─── */}
          {tab === 'signup' && (
            <form onSubmit={handleSignup}>

              {/* Name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Field name="firstName" label="Nombre" required>
                  <input value={form.firstName} onChange={e => setField('firstName', e.target.value)} onBlur={() => blur('firstName')} placeholder="Juan" style={touched.firstName && errors.firstName ? inputErrorStyle : inputStyle} />
                </Field>
                <Field name="lastName" label="Apellidos" required>
                  <input value={form.lastName} onChange={e => setField('lastName', e.target.value)} onBlur={() => blur('lastName')} placeholder="García López" style={touched.lastName && errors.lastName ? inputErrorStyle : inputStyle} />
                </Field>
              </div>

              {/* Username */}
              <Field name="username" label="Nombre de usuario" required>
                <input value={form.username} onChange={e => setField('username', e.target.value)} onBlur={() => blur('username')} placeholder="juangarcia_01" style={touched.username && errors.username ? inputErrorStyle : inputStyle} />
              </Field>

              {/* Date of birth */}
              <Field name="dob" label="Fecha de nacimiento" required>
                <input type="date" value={form.dob} onChange={e => setField('dob', e.target.value)} onBlur={() => blur('dob')} max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]} style={{ ...(touched.dob && errors.dob ? inputErrorStyle : inputStyle), colorScheme: 'light' }} />
              </Field>

              {/* ── Address section ── */}
              <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección</p>

              <Field name="addr1" label="Dirección línea 1" required>
                <input value={form.addr1} onChange={e => setField('addr1', e.target.value)} onBlur={() => blur('addr1')} placeholder="12 Calle 1-25, Zona 10" style={touched.addr1 && errors.addr1 ? inputErrorStyle : inputStyle} />
              </Field>

              <Field name="addr2" label="Dirección línea 2">
                <input value={form.addr2} onChange={e => setField('addr2', e.target.value)} placeholder="Apto 4B (opcional)" style={inputStyle} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Field name="city" label="Ciudad" required>
                  <input value={form.city} onChange={e => setField('city', e.target.value)} onBlur={() => blur('city')} placeholder="Guatemala" style={touched.city && errors.city ? inputErrorStyle : inputStyle} />
                </Field>
                <Field name="state" label="Departamento / Estado" required>
                  <input value={form.state} onChange={e => setField('state', e.target.value)} onBlur={() => blur('state')} placeholder="Guatemala" style={touched.state && errors.state ? inputErrorStyle : inputStyle} />
                </Field>
              </div>

              <Field name="country" label="País" required>
                <select value={form.country} onChange={e => setField('country', e.target.value)} onBlur={() => blur('country')} style={{ ...(touched.country && errors.country ? inputErrorStyle : inputStyle), appearance: 'auto' }}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </Field>

              {/* ── Phone ── */}
              <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teléfono</p>

              <Field name="phone" label="Número de teléfono" required>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                  <select value={form.phoneCode} onChange={e => setField('phoneCode', e.target.value)} style={{ ...inputStyle, appearance: 'auto', fontSize: '13px' }}>
                    {COUNTRIES.map(c => <option key={c.code + c.dial} value={c.dial}>{c.dial} {c.code}</option>)}
                  </select>
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} onBlur={() => blur('phone')} placeholder="5555 1234" style={touched.phone && errors.phone ? inputErrorStyle : inputStyle} />
                </div>
              </Field>

              {/* ── Email ── */}
              <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correo electrónico</p>

              <Field name="email" label="Correo electrónico" required>
                <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} onBlur={() => blur('email')} placeholder="juan@correo.com" style={touched.email && errors.email ? inputErrorStyle : inputStyle} />
              </Field>

              <Field name="emailConfirm" label="Confirmar correo electrónico" required>
                <input type="email" value={form.emailConfirm} onChange={e => setField('emailConfirm', e.target.value)} onBlur={() => blur('emailConfirm')} placeholder="juan@correo.com" style={touched.emailConfirm && errors.emailConfirm ? inputErrorStyle : inputStyle} />
              </Field>

              {/* ── Password ── */}
              <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contraseña</p>

              <Field name="password" label="Contraseña" required>
                <input type="password" value={form.password} onChange={e => setField('password', e.target.value)} onBlur={() => blur('password')} placeholder="Mínimo 8 caracteres" style={touched.password && errors.password ? inputErrorStyle : inputStyle} />
                {form.password.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ height: '4px', borderRadius: '2px', background: 'var(--b1n0-text-2)', overflow: 'hidden' }}>
                      <div style={{ width: `${strength.pct}%`, height: '100%', background: strength.color, borderRadius: '2px', transition: 'all 0.3s' }} />
                    </div>
                    <p style={{ fontFamily: F, fontSize: '11px', color: strength.color, marginTop: '3px', fontWeight: 600 }}>{strength.label}</p>
                  </div>
                )}
              </Field>

              <Field name="passwordConfirm" label="Confirmar contraseña" required>
                <input type="password" value={form.passwordConfirm} onChange={e => setField('passwordConfirm', e.target.value)} onBlur={() => blur('passwordConfirm')} placeholder="Repetí tu contraseña" style={touched.passwordConfirm && errors.passwordConfirm ? inputErrorStyle : inputStyle} />
              </Field>

              {/* Server error */}
              {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', textAlign: 'center', padding: '4px 0' }}>{error}</p>}

              {/* Submit */}
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: loading ? 'rgba(255,255,255,0.12)' : 'var(--b1n0-surface)', color: '#fff',
                fontFamily: F, fontWeight: 600, fontSize: '14px',
                cursor: loading ? 'default' : 'pointer', marginTop: '8px',
              }}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ════════ FOOTER ════════ */}
      <footer style={{ padding: '30px 24px', textAlign: 'center', borderTop: '1px solid var(--b1n0-border)' }}>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
          b1n0 v0.1.0 · Hecho en Guatemala
        </p>
      </footer>
      </section>
    </div>
  )
}
