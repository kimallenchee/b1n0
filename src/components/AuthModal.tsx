import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useAuthModal } from '../context/AuthModalContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

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

export function AuthModal() {
  const { isOpen, closeAuth, initialTab } = useAuthModal()
  const { signIn, signUp, session } = useAuth()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [form, setForm] = useState<SignupForm>({ ...SIGNUP_DEFAULT })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (isOpen) setTab(initialTab) }, [isOpen, initialTab])
  useEffect(() => { if (session) closeAuth() }, [session, closeAuth])

  const errors = useMemo(() => validate(form), [form])

  function setField(key: keyof SignupForm, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'country') { const c = COUNTRIES.find(c => c.code === value); if (c) next.phoneCode = c.dial }
      return next
    })
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

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
    setLoading(false)
  }

  if (!isOpen) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={closeAuth} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{ position: 'relative', maxWidth: 420, width: '90%', maxHeight: '90dvh', overflowY: 'auto', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '20px', padding: '28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>

        {/* Close button */}
        <button onClick={closeAuth} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', fontSize: '20px', color: 'var(--b1n0-muted)', cursor: 'pointer', padding: '4px 8px' }}>×</button>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="/b1n0-logo.png" alt="B1N0" style={{ height: '36px', objectFit: 'contain', marginBottom: '4px' }} />
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Predicciones que importan</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '12px', padding: '3px', marginBottom: '20px' }}>
          {(['login', 'signup'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(null) }} style={{
              flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              fontFamily: F, fontWeight: 600, fontSize: '13px',
              background: tab === t ? '#4ade80' : 'transparent',
              color: tab === t ? '#0d0d0d' : 'var(--b1n0-muted)', transition: 'all 0.15s',
            }}>
              {t === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        {/* Login */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="email" placeholder="Correo electrónico" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required style={inputStyle} />
            <input type="password" placeholder="Contraseña" value={loginPw} onChange={e => setLoginPw(e.target.value)} required minLength={6} style={inputStyle} />
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', textAlign: 'center' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: loading ? 'rgba(255,255,255,0.12)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Cargando...' : 'Entrar'}
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
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', textAlign: 'center' }}>{error}</p>}
            {touched.firstName && Object.keys(errors).length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: '#f87171', lineHeight: 1.4 }}>
                {Object.values(errors).slice(0, 3).join(' · ')}
              </p>
            )}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: loading ? 'rgba(255,255,255,0.12)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
