import { useState, useEffect, useRef } from 'react'
import { useEvents } from '../../context/EventsContext'
import { useAuth } from '../../context/AuthContext'
import { useVotes } from '../../context/VoteContext'
import { supabase } from '../../lib/supabase'
import ExcelJS from 'exceljs'
import { ImageCropper } from '../ImageCropper'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const CATEGORIES = ['deportes', 'politica', 'economia', 'geopolitica', 'cultura', 'tecnologia', 'finanzas', 'otro'] as const

const COUNTRIES = [
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'PA', flag: '🇵🇦', name: 'Panamá' },
  { code: 'BZ', flag: '🇧🇿', name: 'Belice' },
  { code: 'GLOBAL', flag: '🌎', name: 'Global' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'CA', flag: '🇨🇦', name: 'Canadá' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba' },
  { code: 'DE', flag: '🇩🇪', name: 'Alemania' },
  { code: 'DO', flag: '🇩🇴', name: 'Rep. Dominicana' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'ES', flag: '🇪🇸', name: 'España' },
  { code: 'FR', flag: '🇫🇷', name: 'Francia' },
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { code: 'HT', flag: '🇭🇹', name: 'Haití' },
  { code: 'IT', flag: '🇮🇹', name: 'Italia' },
  { code: 'JM', flag: '🇯🇲', name: 'Jamaica' },
  { code: 'JP', flag: '🇯🇵', name: 'Japón' },
  { code: 'KR', flag: '🇰🇷', name: 'Corea del Sur' },
  { code: 'MX', flag: '🇲🇽', name: 'México' },
  { code: 'PE', flag: '🇵🇪', name: 'Perú' },
  { code: 'PR', flag: '🇵🇷', name: 'Puerto Rico' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'RU', flag: '🇷🇺', name: 'Rusia' },
  { code: 'TT', flag: '🇹🇹', name: 'Trinidad y Tobago' },
  { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela' },
] as const

const categoryColors: Record<string, string> = {
  deportes: '#93C5FD', politica: '#C4B5FD', economia: '#FFD474',
  geopolitica: '#f87171', cultura: '#F9A8D4', tecnologia: '#7DD3FC',
  finanzas: '#6EE7B7', otro: 'var(--b1n0-muted)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
  color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)',
  textTransform: 'uppercase', letterSpacing: '0.4px',
  marginBottom: '5px', display: 'block',
}

interface OptionRow { label: string; pct: number; pool: number }

function serializeOptions(opts: OptionRow[]): string[] {
  return opts.map((o) => `${o.label}:${o.pct}:${o.pool}`)
}

function parseOptions(raw: string[] | null): OptionRow[] {
  if (!raw || raw.length === 0) return [{ label: '', pct: 50, pool: 0 }, { label: '', pct: 50, pool: 0 }]
  return raw.map((s) => {
    const parts = s.split(':')
    if (parts.length >= 3) {
      const pool = parseFloat(parts[parts.length - 1]) || 0
      const pct = parseFloat(parts[parts.length - 2]) || 0
      const label = parts.slice(0, parts.length - 2).join(':')
      return { label, pct, pool }
    }
    if (parts.length === 2) return { label: parts[0], pct: parseFloat(parts[1]) || 0, pool: 0 }
    return { label: s, pct: 0, pool: 0 }
  })
}

function optionTotal(opts: OptionRow[]): number {
  return Math.round(opts.reduce((sum, o) => sum + (o.pct || 0), 0))
}

interface CreateForm {
  event_type: 'binary' | 'open'
  question: string
  category: string
  sponsor_name: string
  image_url: string
  yes_percent: number
  no_percent: number
  options: OptionRow[]
  considerations: string
  sponsor_amount: number
  min_entry: number
  max_entry: number
  tier_required: 1 | 2 | 3
  is_live: boolean
  close_mode: 'manual' | 'date'
  ends_at: string
  country: string
  launch_mode: 'public' | 'private'
  lp_return_pct: number
  lp_commitments: { user_id: string; amount: number; return_pct: number }[]
}

interface EditForm {
  question: string
  category: string
  sponsor_name: string
  image_url: string
  considerations: string
  options: OptionRow[]
  sponsor_amount: number
  min_entry: number
  max_entry: number
  tier_required: 1 | 2 | 3
  is_live: boolean
  close_mode: 'manual' | 'date'
  ends_at: string
  status: 'open' | 'closed' | 'resolved' | 'private'
  country: string
  lp_return_pct: number
}

interface AdminEvent {
  id: string
  question: string
  category: string
  event_type: string
  status: string
  is_live: boolean
  pool_size: number
  created_at: string
  sponsor_name: string | null
  sponsor_amount: number | null
  image_url: string | null
  considerations: string | null
  options: string[] | null
  min_entry: number
  max_entry: number
  tier_required: number
  ends_at: string | null
  country: string | null
}

const CREATE_DEFAULT: CreateForm = {
  event_type: 'binary', question: '', category: 'deportes',
  sponsor_name: '', image_url: '', yes_percent: 50, no_percent: 50,
  options: [{ label: '', pct: 50, pool: 0 }, { label: '', pct: 50, pool: 0 }],
  considerations: '', sponsor_amount: 0,
  min_entry: 10, max_entry: 10000, tier_required: 1,
  is_live: false, close_mode: 'manual', ends_at: '',
  country: 'GT', launch_mode: 'public', lp_return_pct: 8,
  lp_commitments: [],
}

function Toggle({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '3px' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            fontFamily: F, fontWeight: 600, fontSize: '12px',
            background: value === o.value ? 'var(--b1n0-surface)' : 'transparent',
            color: value === o.value ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function OptionRows({ options, onChange, maxPool = 0 }: {
  options: OptionRow[]
  onChange: (opts: OptionRow[]) => void
  maxPool?: number
}) {
  const total = optionTotal(options)
  const totalOk = total >= 99 && total <= 101
  const totalPool = options.reduce((s, o) => s + (o.pool || 0), 0)
  const poolOver = maxPool > 0 && totalPool > maxPool
  const poolRemaining = maxPool - totalPool

  function update(i: number, field: keyof OptionRow, val: string | number) {
    onChange(options.map((o, idx) => idx === i ? { ...o, [field]: field === 'label' ? val : (parseFloat(val as string) || 0) } : o))
  }

  function add() {
    onChange([...options, { label: '', pct: 0, pool: 0 }])
  }

  function remove(i: number) {
    if (options.length <= 2) return
    onChange(options.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {options.map((opt, i) => (
        <div key={i} style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={opt.label}
              onChange={(e) => update(i, 'label', e.target.value)}
              placeholder={`Opción ${i + 1}`}
              style={{ ...inputStyle, flex: 1 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input
                type="number" min={0} max={100} step={1}
                value={opt.pct}
                onChange={(e) => update(i, 'pct', e.target.value)}
                style={{ ...inputStyle, width: '56px', textAlign: 'right', padding: '10px 8px' }}
              />
              <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>%</span>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={options.length <= 2}
              style={{ background: 'none', border: 'none', cursor: options.length <= 2 ? 'default' : 'pointer', color: options.length <= 2 ? 'rgba(255,255,255,0.08)' : 'var(--b1n0-text-2)', fontSize: '18px', flexShrink: 0, padding: '4px 2px', lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', paddingLeft: '2px' }}>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>Pool:</span>
            <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>Q</span>
            <input
              type="number" min={0} step={100}
              value={opt.pool}
              onChange={(e) => update(i, 'pool', e.target.value)}
              style={{ ...inputStyle, width: '110px', padding: '6px 8px', fontSize: '12px' }}
            />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <button
          type="button"
          onClick={add}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: 0, textDecoration: 'underline' }}
        >
          + Añadir opción
        </button>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {maxPool > 0 && (
            <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: poolOver ? '#f87171' : '#4ade80' }}>
              {poolOver
                ? `Q${(totalPool - maxPool).toLocaleString()} excedido`
                : `Q${poolRemaining.toLocaleString()} restante`}
            </span>
          )}
          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Q{totalPool.toLocaleString()} / Q{maxPool.toLocaleString()}</span>
          <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: totalOk ? '#4ade80' : '#FFD474' }}>
            {total}%
          </span>
        </div>
      </div>
      {poolOver && (
        <p style={{ fontFamily: F, fontSize: '11px', color: '#f87171', marginTop: '6px', padding: '6px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: '6px' }}>
          El pool de opciones excede el Pool inicial (Q{maxPool.toLocaleString()}). Reducí los montos o aumentá el pool total.
        </p>
      )}
      {!poolOver && (
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
          Los precios se ajustan automáticamente con la participación de usuarios.
        </p>
      )}
    </div>
  )
}

interface EventManagerProps {
  platformRates: Record<string, number>
}

export function EventManager({ platformRates }: EventManagerProps) {
  const { refetch } = useEvents()
  const { refreshPredictions } = useVotes()
  const { profile, refreshProfile } = useAuth()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [cropFile, setCropFile] = useState<{ file: File; target: 'create' | 'edit' } | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<CreateForm>(CREATE_DEFAULT)
  const [pdfText, setPdfText] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const [allEvents, setAllEvents] = useState<AdminEvent[]>([])
  const [manageFilter, setManageFilter] = useState<'open' | 'resolved'>('open')
  const [manageLoading, setManageLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null)

  const [lpDeposits, setLpDeposits] = useState<{ id: string; user_id: string; amount: number; return_pct: number; status: string; payout: number | null; created_at: string }[]>([])
  const [lpUsers, setLpUsers] = useState<{ id: string; name: string; balance: number }[]>([])
  const [lpForm, setLpForm] = useState({ user_id: '', amount: '', return_pct: '8' })
  const [lpLoading, setLpLoading] = useState(false)
  const [lpError, setLpError] = useState<string | null>(null)
  const [lpSuccess, setLpSuccess] = useState<string | null>(null)
  const [eventMarket, setEventMarket] = useState<{ pool_total: number; pool_committed: number; lp_capital: number; bet_pool: number; fees_collected: number; lp_return_pct: number } | null>(null)

  useEffect(() => {
    loadAllEvents()
  }, [])

  async function loadAllEvents() {
    setManageLoading(true)
    const { data } = await supabase
      .from('events')
      .select('id, question, category, event_type, status, is_live, pool_size, created_at, sponsor_name, sponsor_amount, image_url, considerations, options, min_entry, max_entry, tier_required, ends_at, country')
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
    setAllEvents((data as AdminEvent[]) ?? [])
    setManageLoading(false)
  }

  function setC<K extends keyof CreateForm>(key: K, val: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function handleYes(v: number) {
    const c = Math.max(0, Math.min(100, v))
    setForm((f) => ({ ...f, yes_percent: c, no_percent: 100 - c }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null); setCreateSuccess(null); setCreateLoading(true)

    const sponsorAmt = form.sponsor_amount || 0
    if (sponsorAmt > 0 && sponsorAmt % 1 !== 0) {
      setCreateError('El monto del patrocinador debe ser número entero (sin centavos)')
      setCreateLoading(false)
      return
    }

    const isOpen = form.event_type === 'open'
    const filteredOpts = isOpen ? form.options.filter((o) => o.label.trim()) : []
    const marginRate = platformRates.sponsor_margin_pct / 100
    const pool_total = sponsorAmt > 0 ? sponsorAmt : 0
    const optionPoolTotal = filteredOpts.reduce((s, o) => s + (o.pool || 0), 0)

    if (isOpen && sponsorAmt > 0 && optionPoolTotal > pool_total) {
      setCreateError(`El pool de opciones (Q${optionPoolTotal.toLocaleString()}) excede el pool de premios (Q${pool_total.toLocaleString()}).`)
      setCreateLoading(false)
      return
    }

    for (const lp of form.lp_commitments) {
      if (!lp.user_id || !lp.amount || lp.amount <= 0) continue
      const lpUser = lpUsers.find(u => u.id === lp.user_id)
      if (!lpUser) {
        setCreateError(`LP no encontrado: ${lp.user_id.slice(0, 8)}`)
        setCreateLoading(false)
        return
      }
      if (lpUser.balance < lp.amount) {
        setCreateError(`LP "${lpUser.name || lp.user_id.slice(0, 8)}" tiene saldo Q${lpUser.balance.toLocaleString()} — insuficiente para Q${lp.amount.toLocaleString()}`)
        setCreateLoading(false)
        return
      }
    }

    const options = isOpen ? serializeOptions(filteredOpts) : null
    const pool_size = isOpen ? optionPoolTotal : pool_total
    const id = crypto.randomUUID()

    const { error: err } = await supabase.from('events').insert({
      id,
      event_type: form.event_type,
      question: form.question.trim(),
      category: form.category,
      sponsor_name: form.sponsor_name.trim() || null,
      image_url: form.image_url.trim() || null,
      yes_percent: isOpen ? 0 : form.yes_percent,
      no_percent: isOpen ? 0 : form.no_percent,
      options,
      considerations: form.considerations.trim() || null,
      pool_size,
      currency: 'Q',
      time_remaining: '',
      is_live: form.is_live,
      min_entry: form.min_entry,
      max_entry: form.max_entry,
      tier_required: form.tier_required,
      status: form.launch_mode === 'private' ? 'private' : 'open',
      ends_at: form.close_mode === 'date' ? (form.ends_at || null) : null,
      country: form.country || 'GT',
    })

    if (err) {
      setCreateError(err.message)
    } else {
      if (form.event_type === 'binary') {
        const { error: mktErr } = await supabase.rpc('initialize_market', {
          p_event_id: id,
          p_pool_total: pool_size,
          p_initial_yes_pct: form.yes_percent,
          p_spread_enabled: true,
          p_synthetic_shares: 1000,
          p_sponsor_amount: sponsorAmt > 0 ? sponsorAmt : null,
          p_lp_return_pct: (form.lp_return_pct || 8) / 100,
          p_launch_mode: form.launch_mode,
        })
        if (mktErr) {
          setCreateError(`Evento creado pero falló el mercado: ${mktErr.message}`)
          setCreateLoading(false)
          return
        }
      } else {
        const { error: mktErr } = await supabase.rpc('initialize_market', {
          p_event_id: id,
          p_pool_total: pool_size,
          p_initial_yes_pct: 50,
          p_spread_enabled: true,
          p_synthetic_shares: 1000,
          p_sponsor_amount: sponsorAmt > 0 ? sponsorAmt : null,
          p_lp_return_pct: (form.lp_return_pct || 8) / 100,
          p_launch_mode: form.launch_mode,
        })
        if (mktErr) {
          setCreateError(`Evento creado pero falló el mercado: ${mktErr.message}`)
          setCreateLoading(false)
          return
        }
        const { error: optErr } = await supabase.rpc('initialize_option_markets', {
          p_event_id: id,
        })
        if (optErr) {
          setCreateError(`Evento creado pero falló opciones: ${optErr.message}`)
          setCreateLoading(false)
          return
        }
      }
      await new Promise(r => setTimeout(r, 300))
      const lpErrors: string[] = []
      let totalLpCapital = 0
      for (const lp of form.lp_commitments) {
        if (!lp.user_id || !lp.amount || lp.amount <= 0) continue
        const { data: lpRes, error: lpErr } = await supabase.rpc('deposit_lp_capital', {
          p_event_id: id,
          p_user_id: lp.user_id,
          p_amount: lp.amount,
          p_return_pct: (lp.return_pct || 8) / 100,
        })
        if (lpErr) lpErrors.push(`LP ${lp.user_id.slice(0, 8)}: ${lpErr.message}`)
        else if (lpRes?.error) lpErrors.push(`LP ${lp.user_id.slice(0, 8)}: ${lpRes.error}`)
        else totalLpCapital += lp.amount
      }
      if (totalLpCapital > 0 && lpErrors.length === 0) {
        const { data: mktCheck } = await supabase.from('event_markets').select('pool_total, lp_capital').eq('event_id', id).maybeSingle()
        if (mktCheck && Number(mktCheck.pool_total) < Number(mktCheck.lp_capital)) {
          await supabase.from('event_markets').update({ pool_total: Number(mktCheck.lp_capital) + (Number(mktCheck.pool_total) || 0) }).eq('event_id', id)
        }
      }
      const lpOk = form.lp_commitments.length - lpErrors.length
      const lpNote = lpOk > 0 ? ` · ${lpOk} LP(s) depositados.` : ''
      if (lpErrors.length > 0) {
        await supabase.from('events').update({ status: 'archived' }).eq('id', id)
        setCreateError(`Evento cancelado — LP falló: ${lpErrors.join('; ')}`)
        setCreateLoading(false)
        refetch()
        return
      }
      setCreateSuccess((form.launch_mode === 'private'
        ? `Evento creado en Ronda Privada (ID: ${id}). Comparte el enlace con LPs.`
        : `Evento creado (ID: ${id})`) + lpNote)
      setForm(CREATE_DEFAULT); setPdfText(''); refetch()
    }
    setCreateLoading(false)
  }

  async function handleBulkUpload(file: File) {
    setBulkUploading(true)
    setBulkResult(null)
    const errors: string[] = []
    let ok = 0
    let fail = 0

    try {
      const buf = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      if (!ws) {
        setBulkResult({ ok: 0, fail: 0, errors: ['No se encontró una hoja en el archivo.'] })
        setBulkUploading(false)
        return
      }
      const headers: string[] = []
      ws.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value ?? '').trim().toLowerCase() })
      const rows: Record<string, unknown>[] = []
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const obj: Record<string, unknown> = {}
        let hasData = false
        row.eachCell((cell, col) => {
          const key = headers[col]
          if (key) { obj[key] = cell.value; hasData = true }
        })
        if (hasData) rows.push(obj)
      }

      if (rows.length === 0) {
        setBulkResult({ ok: 0, fail: 0, errors: ['El archivo está vacío.'] })
        setBulkUploading(false)
        return
      }

      const marginRate = platformRates.sponsor_margin_pct / 100

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const rowNum = i + 2

        const question = String(r.question ?? r.pregunta ?? '').trim()
        if (!question) { errors.push(`Fila ${rowNum}: falta "question"`); fail++; continue }

        const eventType = String(r.event_type ?? r.tipo ?? 'binary').toLowerCase().trim()
        const isOpen = eventType === 'open' || eventType === 'abierto'

        const category = String(r.category ?? r.categoria ?? 'otro').toLowerCase().trim()
        const sponsorName = String(r.sponsor_name ?? r.sponsor ?? r.patrocinador ?? '').trim() || null
        const imageUrl = String(r.image_url ?? r.imagen ?? '').trim() || null
        const considerations = String(r.considerations ?? r.contexto ?? '').trim() || null
        const country = String(r.country ?? r.pais ?? 'GT').toUpperCase().trim()

        const sponsorAmt = Number(r.sponsor_amount ?? r.monto ?? r.monto_sponsor ?? 0)
        const lpReturnPct = Number(r.lp_return_pct ?? 0.08)

        const yesPct = isOpen ? 0 : Math.max(1, Math.min(99, Number(r.yes_percent ?? r.si_pct ?? 50)))
        const noPct = isOpen ? 0 : 100 - yesPct

        const minEntry = Number(r.min_entry ?? r.min ?? 25)
        const maxEntry = Number(r.max_entry ?? r.max ?? 500)
        const isLive = String(r.is_live ?? r.en_vivo ?? 'false').toLowerCase() === 'true'
        const endsAt = r.ends_at ?? r.cierre ?? null

        let options: string[] | null = null
        let poolSize: number
        const poolTotal = sponsorAmt > 0 ? sponsorAmt : 0

        if (isOpen) {
          const optStr = String(r.options ?? r.opciones ?? '').trim()
          if (!optStr) { errors.push(`Fila ${rowNum}: evento abierto requiere "options" (ej: Opción1:40:500;Opción2:60:500)`); fail++; continue }
          options = optStr.split(';').map((s: string) => s.trim()).filter(Boolean)
          let optPoolTotal = 0
          for (const opt of options) {
            const parts = opt.split(':')
            if (parts.length < 3) { errors.push(`Fila ${rowNum}: opción "${opt}" mal formateada (usar label:pct:pool)`); fail++; continue }
            optPoolTotal += parseFloat(parts[parts.length - 1]) || 0
          }
          if (sponsorAmt > 0 && optPoolTotal > poolTotal) { errors.push(`Fila ${rowNum}: pool opciones (Q${optPoolTotal}) > pool premios (Q${poolTotal})`); fail++; continue }
          poolSize = optPoolTotal
        } else {
          poolSize = poolTotal
        }

        const id = crypto.randomUUID()

        const { error: insertErr } = await supabase.from('events').insert({
          id,
          event_type: isOpen ? 'open' : 'binary',
          question,
          category,
          sponsor_name: sponsorName,
          image_url: imageUrl,
          yes_percent: yesPct,
          no_percent: noPct,
          options,
          considerations,
          pool_size: poolSize,
          currency: 'Q',
          time_remaining: '',
          is_live: isLive,
          min_entry: minEntry,
          max_entry: maxEntry,
          tier_required: 1,
          status: 'open',
          ends_at: endsAt ? String(endsAt) : null,
          country,
        })

        if (insertErr) {
          errors.push(`Fila ${rowNum}: ${insertErr.message}`)
          fail++
          continue
        }

        if (!isOpen) {
          const { error: mktErr } = await supabase.rpc('initialize_market', {
            p_event_id: id,
            p_pool_total: poolSize,
            p_initial_yes_pct: yesPct,
            p_spread_enabled: true,
            p_synthetic_shares: 1000,
            p_sponsor_amount: sponsorAmt > 0 ? sponsorAmt : null,
            p_lp_return_pct: lpReturnPct,
            p_launch_mode: 'public',
          })
          if (mktErr) errors.push(`Fila ${rowNum}: evento creado pero mercado falló: ${mktErr.message}`)
        } else {
          const { error: optErr } = await supabase.rpc('initialize_option_markets', { p_event_id: id })
          if (optErr) errors.push(`Fila ${rowNum}: evento creado pero opciones fallaron: ${optErr.message}`)
        }

        ok++
      }
    } catch (err) {
      errors.push(`Error leyendo archivo: ${err instanceof Error ? err.message : String(err)}`)
    }

    setBulkResult({ ok, fail, errors })
    setBulkUploading(false)
    if (ok > 0) { refetch(); loadAllEvents() }
  }

  async function startEdit(ev: AdminEvent) {
    setEditingId(ev.id)
    setEditError(null); setEditSuccess(null); setDeleteConfirm(false)
    setEventMarket(null)
    setEditForm({
      question: ev.question,
      category: ev.category,
      sponsor_name: ev.sponsor_name ?? '',
      image_url: ev.image_url ?? '',
      considerations: ev.considerations ?? '',
      options: parseOptions(ev.options),
      sponsor_amount: ev.sponsor_amount ?? 0,
      min_entry: ev.min_entry,
      max_entry: ev.max_entry,
      tier_required: ev.tier_required as 1 | 2 | 3,
      is_live: ev.is_live,
      close_mode: ev.ends_at ? 'date' : 'manual',
      ends_at: ev.ends_at ? ev.ends_at.slice(0, 16) : '',
      status: ev.status as 'open' | 'closed' | 'resolved' | 'private',
      country: ev.country ?? 'GT',
      lp_return_pct: 8,
    })
    const { data: mkt } = await supabase
      .from('event_markets')
      .select('pool_total, pool_committed, lp_capital, bet_pool, fees_collected, lp_return_pct')
      .eq('event_id', ev.id)
      .maybeSingle()
    if (mkt) {
      setEventMarket({
        pool_total:      Number(mkt.pool_total),
        pool_committed:  Number(mkt.pool_committed),
        lp_capital:      Number(mkt.lp_capital ?? 0),
        bet_pool:        Number(mkt.bet_pool ?? 0),
        fees_collected:  Number(mkt.fees_collected ?? 0),
        lp_return_pct:   Number(mkt.lp_return_pct ?? 0.08),
      })
      setEditForm((f) => f ? { ...f, lp_return_pct: Number(mkt.lp_return_pct ?? 0.08) * 100 } : f)
    }
    loadLpDeposits(ev.id)
    loadLpUsers()
    setLpError(null); setLpSuccess(null)
    setLpForm({ user_id: '', amount: '', return_pct: '8' })
  }

  function setE<K extends keyof EditForm>(key: K, val: EditForm[K]) {
    setEditForm((f) => f ? { ...f, [key]: val } : f)
  }

  async function handleEditSave() {
    if (!editForm || !editingId) return
    setEditLoading(true); setEditError(null); setEditSuccess(null)

    const sponsorAmt = editForm.sponsor_amount || 0
    if (sponsorAmt > 0 && sponsorAmt % 1 !== 0) {
      setEditError('El monto del patrocinador debe ser número entero (sin centavos)')
      setEditLoading(false)
      return
    }

    const origEvent = allEvents.find((e) => e.id === editingId)
    const origSponsorAmt = origEvent?.sponsor_amount ?? 0
    const sponsorChanged = sponsorAmt !== origSponsorAmt

    if (sponsorChanged && hasActivePositions) {
      setEditError('No se puede modificar el sponsor — hay posiciones abiertas en el mercado')
      setEditLoading(false)
      return
    }

    const isOpen = origEvent?.event_type === 'open'
    const marginRate = platformRates.sponsor_margin_pct / 100
    const pool_total = sponsorAmt > 0 ? sponsorAmt : 0
    const platform_margin = sponsorAmt > 0 ? Math.round(sponsorAmt * marginRate * 100) / 100 : 0
    const filteredEditOpts = isOpen ? editForm.options.filter((o) => o.label.trim()) : []
    const editOptionPoolTotal = filteredEditOpts.reduce((s, o) => s + (o.pool || 0), 0)

    if (isOpen && sponsorAmt > 0 && editOptionPoolTotal > pool_total) {
      setEditError(`El pool de opciones (Q${editOptionPoolTotal.toLocaleString()}) excede el pool de premios (Q${pool_total.toLocaleString()}).`)
      setEditLoading(false)
      return
    }

    const options = isOpen ? serializeOptions(filteredEditOpts) : undefined

    const { error: err } = await supabase.from('events').update({
      question: editForm.question.trim(),
      category: editForm.category,
      sponsor_name: editForm.sponsor_name.trim() || null,
      image_url: editForm.image_url.trim() || null,
      considerations: editForm.considerations.trim() || null,
      ...(isOpen ? { options } : {}),
      min_entry: editForm.min_entry,
      max_entry: editForm.max_entry,
      tier_required: editForm.tier_required,
      is_live: editForm.is_live,
      status: editForm.status,
      ends_at: editForm.close_mode === 'date' ? (editForm.ends_at || null) : null,
      country: editForm.country || 'GT',
    }).eq('id', editingId)

    if (err) {
      setEditError(err.message)
    } else {
      const { data: curMkt } = await supabase.from('event_markets').select('pool_total, lp_capital, bet_pool, sponsor_amount').eq('event_id', editingId).maybeSingle()
      if (curMkt) {
        const oldSponsor = Number(curMkt.sponsor_amount) || 0
        const newSponsor = sponsorAmt || 0
        if (oldSponsor !== newSponsor) {
          const diff = newSponsor - oldSponsor
          const newPoolTotal = Math.max(Number(curMkt.pool_total) + diff, 0)
          await supabase.from('event_markets').update({ pool_total: newPoolTotal, sponsor_amount: newSponsor }).eq('event_id', editingId)
          await supabase.from('events').update({ pool_size: Math.round(newPoolTotal), sponsor_amount: newSponsor }).eq('id', editingId)
          setEventMarket((m) => m ? { ...m, pool_total: newPoolTotal } : m)
        }
      }
      setEditSuccess('Guardado')
      refetch()
      await loadAllEvents()
    }
    setEditLoading(false)
  }

  async function handleDelete() {
    if (!editingId) return
    setDeleteLoading(true)
    setEditError(null)

    const { error } = await supabase
      .from('events')
      .update({ status: 'archived' })
      .eq('id', editingId)

    if (error) {
      setEditError(`Error al archivar: ${error.message}`)
      setDeleteConfirm(false)
      setDeleteLoading(false)
      return
    }

    setEditingId(null)
    setEditForm(null)
    setDeleteConfirm(false)
    setDeleteLoading(false)
    refetch()
    await loadAllEvents()
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleteLoading(true)
    const { error } = await supabase
      .from('events')
      .update({ status: 'archived' })
      .in('id', Array.from(selectedIds))
    if (error) {
      setEditError(`Error al archivar: ${error.message}`)
    } else {
      setSelectedIds(new Set())
      setEditingId(null)
      setEditForm(null)
      refetch()
      await loadAllEvents()
    }
    setBulkDeleteConfirm(false)
    setBulkDeleteLoading(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const visible = allEvents.filter((e) => manageFilter === 'open' ? (e.status === 'open' || e.status === 'private') : (e.status !== 'open' && e.status !== 'private'))
    const allSelected = visible.length > 0 && visible.every(e => selectedIds.has(e.id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visible.map(e => e.id)))
    }
  }

  async function handleResolve(result: string) {
    if (!editingId) return
    setResolveLoading(true); setResolveError(null); setResolveSuccess(null)

    const editingEventType = allEvents.find((e) => e.id === editingId)?.event_type

    const { data: settled, error: settleErr } = await supabase.rpc('settle_predictions', {
      p_event_id: editingId,
      p_result: result,
    })
    if (settleErr) { setResolveError(settleErr.message); setResolveLoading(false); return }

    const count = typeof settled === 'number' ? settled : (settled?.predictions_processed ?? 0)
    const poolToWinners = settled?.pool_to_winners != null ? ` · Q${Number(settled.pool_to_winners).toLocaleString()} a ganadores` : ''
    const lpPaid = settled?.lp_actual_paid ? ` · Q${Number(settled.lp_actual_paid).toLocaleString()} LP retorno` : ''
    const totalPool = settled?.total_pool ? ` · Pool: Q${Number(settled.total_pool).toLocaleString()}` : ''
    const label = editingEventType !== 'open' ? (result === 'yes' ? 'SÍ' : 'NO') : result
    setResolveSuccess(`Resuelto: "${label}" ganó. ${count} voto(s) procesado(s).${totalPool}${lpPaid}${poolToWinners}`)
    setE('status', 'resolved')
    refetch()
    await loadAllEvents()
    await refreshProfile()
    await refreshPredictions()
    setResolveLoading(false)
  }

  async function loadLpDeposits(eventId: string) {
    const { data } = await supabase
      .from('lp_deposits')
      .select('id, user_id, amount, return_pct, status, payout, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setLpDeposits((data as any[]) ?? [])
  }

  async function loadLpUsers() {
    const { data } = await supabase.from('profiles').select('id, name, balance')
    setLpUsers((data as any[]) ?? [])
  }

  async function handleLpDeposit() {
    if (!editingId || !lpForm.user_id || !lpForm.amount) return
    setLpLoading(true); setLpError(null); setLpSuccess(null)
    const amt = parseFloat(lpForm.amount)
    const retPct = (parseFloat(lpForm.return_pct) || 8) / 100
    if (!amt || amt <= 0) { setLpError('Monto inválido'); setLpLoading(false); return }

    const { data, error } = await supabase.rpc('deposit_lp_capital', {
      p_event_id: editingId,
      p_user_id: lpForm.user_id,
      p_amount: amt,
      p_return_pct: retPct,
    })
    if (error) { setLpError(error.message); setLpLoading(false); return }
    if (data?.error) { setLpError(data.error); setLpLoading(false); return }

    setLpSuccess(`LP deposit Q${amt.toLocaleString()} registrado (retorno ${(retPct * 100).toFixed(0)}%)`)
    setLpForm({ user_id: '', amount: '', return_pct: lpForm.return_pct })
    await loadLpDeposits(editingId)
    const { data: mkt } = await supabase
      .from('event_markets')
      .select('pool_total, pool_committed, lp_capital, bet_pool, fees_collected, lp_return_pct')
      .eq('event_id', editingId)
      .maybeSingle()
    if (mkt) {
      const poolTotal = Number(mkt.pool_total) || 0
      const lpCapital = Number(mkt.lp_capital) || 0
      const betPool = Number(mkt.bet_pool) || 0
      if (poolTotal < lpCapital) {
        const corrected = lpCapital + betPool
        await supabase.from('event_markets').update({ pool_total: corrected }).eq('event_id', editingId)
        await supabase.from('events').update({ pool_size: Math.round(corrected) }).eq('id', editingId)
        setEventMarket({
          pool_total: corrected, pool_committed: Number(mkt.pool_committed),
          lp_capital: lpCapital, bet_pool: betPool,
          fees_collected: Number(mkt.fees_collected ?? 0), lp_return_pct: Number(mkt.lp_return_pct ?? 0.08),
        })
      } else {
        setEventMarket({
          pool_total: poolTotal, pool_committed: Number(mkt.pool_committed),
          lp_capital: lpCapital, bet_pool: betPool,
          fees_collected: Number(mkt.fees_collected ?? 0), lp_return_pct: Number(mkt.lp_return_pct ?? 0.08),
        })
      }
    }
    setLpLoading(false)
  }

  const isOpen = form.event_type === 'open'
  const hasActivePositions = eventMarket != null && eventMarket.pool_committed > 0

  return (
    <div>
      {editingId && editForm && (
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <button onClick={() => { setEditingId(null); setEditForm(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '20px', color: 'var(--b1n0-muted)', padding: 0, lineHeight: 1 }}>←</button>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)' }}>Editando evento</p>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginLeft: 'auto' }}>ID: {editingId}</span>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Pregunta</label>
                <textarea value={editForm.question} onChange={(e) => setE('question', e.target.value)}
                  style={{ ...inputStyle, height: '72px', resize: 'none', lineHeight: 1.5 }} />
              </div>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select value={editForm.category} onChange={(e) => setE('category', e.target.value)} style={inputStyle}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>País</label>
                <select value={editForm.country} onChange={(e) => setE('country', e.target.value)} style={inputStyle}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Imagen personalizada (URL o subir)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="url" value={editForm.image_url} onChange={(e) => setE('image_url', e.target.value)}
                    placeholder="https://... (opcional)" style={{ ...inputStyle, flex: 1 }} />
                  <label style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)', fontFamily: F, fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: 'var(--b1n0-text-1)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Subir
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setCropFile({ file, target: 'edit' })
                      e.target.value = ''
                    }} />
                  </label>
                </div>
                {editForm.image_url && (
                  <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', height: '80px' }}>
                    <img src={editForm.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Sponsor</label>
                <input type="text" value={editForm.sponsor_name} onChange={(e) => setE('sponsor_name', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contexto</label>
                <textarea value={editForm.considerations} onChange={(e) => setE('considerations', e.target.value)}
                  style={{ ...inputStyle, height: '60px', resize: 'vertical', lineHeight: 1.5 }} />
              </div>
              {allEvents.find((e) => e.id === editingId)?.event_type === 'open' && (
                <div>
                  <label style={labelStyle}>Opciones</label>
                  <OptionRows
                    options={editForm.options}
                    onChange={(opts) => setE('options', opts)}
                    maxPool={editForm.sponsor_amount > 0 ? editForm.sponsor_amount : 0}
                  />
                </div>
              )}
            </div>

            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Pool parimutuel</label>
                <div style={{ padding: '10px 12px', background: 'var(--b1n0-surface)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.07)' }}>
                  {hasActivePositions && (
                    <p style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', marginBottom: '8px', fontWeight: 600 }}>
                      Mercado activo — pool crece con cada voto
                    </p>
                  )}
                  {[
                    { label: 'Pool total', value: eventMarket?.pool_total ?? 0, color: '#4ade80' },
                    { label: 'Semilla sponsor', value: editForm.sponsor_amount > 0 ? editForm.sponsor_amount : 0, color: 'var(--b1n0-text-1)' },
                    { label: 'Apuestas en pool', value: eventMarket?.bet_pool ?? 0, color: '#93C5FD' },
                    { label: 'Capital LP', value: eventMarket?.lp_capital ?? 0, color: '#C4B5FD' },
                    { label: 'Fees colectados', value: eventMarket?.fees_collected ?? 0, color: 'var(--b1n0-muted)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                      <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{label}</span>
                      <span style={{ fontFamily: D, fontWeight: 700, fontSize: '13px', color }}>
                        {typeof value === 'string' ? value : `Q${Number(value).toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                </div>
                {!hasActivePositions && (
                  <div style={{ marginTop: '8px' }}>
                    <label style={labelStyle}>Semilla sponsor (Q) — opcional</label>
                    <input
                      type="number" min={0} step="any"
                      value={editForm.sponsor_amount || ''}
                      onChange={(e) => setE('sponsor_amount', parseInt(e.target.value) || 0)}
                      placeholder="0 = parimutuel puro"
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Mín entrada (Q)</label>
                <input type="number" min={1} value={editForm.min_entry}
                  onChange={(e) => setE('min_entry', parseInt(e.target.value) || 25)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Máx entrada (Q)</label>
                <input type="number" min={1} value={editForm.max_entry}
                  onChange={(e) => setE('max_entry', parseInt(e.target.value) || 10000)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={editForm.status} onChange={(e) => setE('status', e.target.value as EditForm['status'])} style={inputStyle}>
                  <option value="private">Ronda Privada</option>
                  <option value="open">Abierto</option>
                  <option value="closed">Cerrado</option>
                  <option value="resolved">Resuelto</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cierre del evento</label>
                <Toggle
                  options={[{ value: 'manual', label: 'Manual' }, { value: 'date', label: 'Fecha' }]}
                  value={editForm.close_mode}
                  onChange={(v) => setE('close_mode', v as 'manual' | 'date')}
                />
                {editForm.close_mode === 'date' && (
                  <input type="datetime-local" value={editForm.ends_at}
                    onChange={(e) => setE('ends_at', e.target.value)} style={{ ...inputStyle, marginTop: '8px' }} />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="is_live_e" checked={editForm.is_live}
                  onChange={(e) => setE('is_live', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--b1n0-text-1)', cursor: 'pointer' }} />
                <label htmlFor="is_live_e" style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', cursor: 'pointer' }}>
                  EN VIVO
                </label>
              </div>

              {editError && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', padding: '8px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: '8px' }}>{editError}</p>}
              {editSuccess && <p style={{ fontFamily: F, fontSize: '12px', color: '#4ade80', padding: '8px 10px', background: 'rgba(74,222,128,0.08)', borderRadius: '8px' }}>✓ {editSuccess}</p>}

              <button onClick={handleEditSave} disabled={editLoading}
                style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: editLoading ? 'rgba(255,255,255,0.12)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '13px', cursor: editLoading ? 'default' : 'pointer' }}>
                {editLoading ? 'Guardando...' : 'Guardar cambios →'}
              </button>

              {editForm.status === 'private' && (
                <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px' }}>
                  <label style={labelStyle}>Ronda Privada activa</label>
                  <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px' }}>
                    Solo usuarios Nivel 3 pueden votar. Comparte el enlace directamente con LPs.
                  </p>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/evento/${editingId}`
                      navigator.clipboard.writeText(url)
                      setEditSuccess('Enlace copiado: ' + url)
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #7c3aed', background: 'rgba(196,181,253,0.12)', color: '#C4B5FD', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}
                  >
                    Copiar enlace para LPs
                  </button>
                  <button
                    onClick={async () => {
                      const { error } = await supabase.from('events').update({ status: 'open' }).eq('id', editingId)
                      if (!error) {
                        await supabase.from('event_markets').update({ status: 'open' }).eq('event_id', editingId)
                        setE('status', 'open')
                        refetch()
                        await loadAllEvents()
                      }
                    }}
                    style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 700, fontSize: '13px', cursor: 'pointer', letterSpacing: '0.5px' }}
                  >
                    Publicar al público →
                  </button>
                </div>
              )}

              {(editForm.status === 'open' || editForm.status === 'private') && (
                <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px' }}>
                  <label style={labelStyle}>Capital LP</label>
                  <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px' }}>
                    LPs depositan capital al pool y reciben retorno fijo al resolver.
                  </p>

                  {lpDeposits.length > 0 && (
                    <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {lpDeposits.map((lp) => {
                        const userName = lpUsers.find(u => u.id === lp.user_id)?.name || lp.user_id.slice(0, 8)
                        return (
                          <div key={lp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(196,181,253,0.08)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.1)' }}>
                            <div>
                              <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: '#C4B5FD' }}>{userName}</span>
                              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginLeft: '8px' }}>
                                Q{lp.amount.toLocaleString()} · {(lp.return_pct * 100).toFixed(0)}%
                              </span>
                            </div>
                            <span style={{ fontFamily: F, fontSize: '10px', color: lp.status === 'active' ? '#C4B5FD' : lp.status === 'returned' ? '#4ade80' : '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>
                              {lp.status === 'active' ? 'Activo' : lp.status === 'returned' ? `Pagado Q${(lp.payout ?? 0).toLocaleString()}` : 'Pérdida parcial'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                    <select
                      value={lpForm.user_id}
                      onChange={(e) => setLpForm(f => ({ ...f, user_id: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">Seleccionar LP...</option>
                      {lpUsers.filter(u => u.balance > 0).map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.id.slice(0, 8)} — Q{u.balance.toLocaleString()}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="number" min={0.01} step="any"
                        value={lpForm.amount}
                        onChange={(e) => setLpForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="Monto (Q)"
                        style={{ ...inputStyle, flex: 2 }}
                      />
                      <input
                        type="number" min={0} max={50} step={1}
                        value={lpForm.return_pct}
                        onChange={(e) => setLpForm(f => ({ ...f, return_pct: e.target.value }))}
                        placeholder="Retorno %"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                    {lpForm.user_id && lpForm.amount && (
                      <p style={{ fontFamily: F, fontSize: '10px', color: '#C4B5FD' }}>
                        LP recibe capital Q{parseFloat(lpForm.amount).toLocaleString()} + {lpForm.return_pct}% de fees netos al resolver
                      </p>
                    )}
                    <button
                      onClick={handleLpDeposit}
                      disabled={lpLoading || !lpForm.user_id || !lpForm.amount}
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: lpLoading ? 'var(--b1n0-border)' : '#C4B5FD', color: '#fff', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: lpLoading ? 'default' : 'pointer' }}
                    >
                      {lpLoading ? 'Procesando...' : 'Agregar Capital LP →'}
                    </button>
                    {lpError && <p style={{ fontFamily: F, fontSize: '11px', color: '#f87171', padding: '6px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: '6px' }}>{lpError}</p>}
                    {lpSuccess && <p style={{ fontFamily: F, fontSize: '11px', color: '#4ade80', padding: '6px 8px', background: 'rgba(74,222,128,0.08)', borderRadius: '6px' }}>✓ {lpSuccess}</p>}
                  </div>
                </div>
              )}

              {(editForm.status === 'open' || editForm.status === 'private') && (
                <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px' }}>
                  <label style={labelStyle}>Resolver evento</label>
                  {allEvents.find((e) => e.id === editingId)?.event_type !== 'open' ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleResolve('yes')}
                        disabled={resolveLoading}
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: resolveLoading ? 'var(--b1n0-border)' : '#4ade80', cursor: resolveLoading ? 'default' : 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}
                      >
                        SÍ ganó
                      </button>
                      <button
                        onClick={() => handleResolve('no')}
                        disabled={resolveLoading}
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: resolveLoading ? 'var(--b1n0-border)' : '#f87171', cursor: resolveLoading ? 'default' : 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}
                      >
                        NO ganó
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {editForm.options.filter((o) => o.label.trim()).map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => handleResolve(opt.label)}
                          disabled={resolveLoading}
                          style={{ width: '100%', padding: '9px', borderRadius: '10px', border: 'none', background: resolveLoading ? 'rgba(255,255,255,0.08)' : '#4ade80', cursor: resolveLoading ? 'default' : 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#0d0d0d', textAlign: 'left' }}
                        >
                          {opt.label} ganó →
                        </button>
                      ))}
                    </div>
                  )}
                  {resolveError && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', marginTop: '8px', padding: '8px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: '8px' }}>{resolveError}</p>}
                  {resolveSuccess && <p style={{ fontFamily: F, fontSize: '12px', color: '#4ade80', marginTop: '8px', padding: '8px 10px', background: 'rgba(74,222,128,0.08)', borderRadius: '8px' }}>✓ {resolveSuccess}</p>}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px' }}>
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(185,28,28,0.25)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#f87171' }}
                  >
                    Eliminar evento
                  </button>
                ) : (
                  <div style={{ background: 'rgba(248,113,113,0.08)', borderRadius: '10px', padding: '12px' }}>
                    <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', marginBottom: '10px', fontWeight: 600 }}>
                      ¿Archivar este evento? Desaparecerá del feed. Los votos y transacciones existentes se conservan.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleDelete}
                        disabled={deleteLoading}
                        style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: '#f87171', cursor: deleteLoading ? 'default' : 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff' }}
                      >
                        {deleteLoading ? 'Archivando...' : 'Sí, archivar'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(['open', 'resolved'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setManageFilter(f); setSelectedIds(new Set()); setBulkDeleteConfirm(false) }}
                style={{
                  padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontWeight: 600, fontSize: '11px',
                  background: manageFilter === f ? 'var(--b1n0-card)' : 'transparent',
                  color: manageFilter === f ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                }}
              >
                {f === 'open' ? 'Activos' : 'Resueltos'}
              </button>
            ))}
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginLeft: '4px' }}>
              {allEvents.filter((e) => manageFilter === 'open' ? (e.status === 'open' || e.status === 'private') : (e.status !== 'open' && e.status !== 'private')).length}
            </span>
            {(() => {
              const visible = allEvents.filter((e) => manageFilter === 'open' ? (e.status === 'open' || e.status === 'private') : (e.status !== 'open' && e.status !== 'private'))
              const allChecked = visible.length > 0 && visible.every(e => selectedIds.has(e.id))
              const someChecked = visible.some(e => selectedIds.has(e.id)) && !allChecked
              return visible.length > 0 ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleSelectAll}
                    style={{ width: '14px', height: '14px', accentColor: 'var(--b1n0-text-1)', cursor: 'pointer' }}
                  />
                  <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Todos</span>
                </label>
              ) : null
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={loadAllEvents} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}>
              Actualizar
            </button>
            <input
              ref={bulkFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleBulkUpload(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={async () => {
                const template = [
                  { question: '¿Guatemala clasifica al Mundial 2026?', event_type: 'binary', category: 'deportes', sponsor_name: 'Gatorade GT', sponsor_amount: 5000, yes_percent: 35, min_entry: 25, max_entry: 500, is_live: 'false', ends_at: '2026-06-15T23:59', options: '', country: 'GT', considerations: 'Eliminatorias CONCACAF. Guatemala en el grupo B. Fuente: FIFA.', image_url: '' },
                ]
                const wb = new ExcelJS.Workbook()
                const ws = wb.addWorksheet('Eventos')
                ws.columns = [
                  { header: 'question', key: 'question', width: 50 },
                  { header: 'event_type', key: 'event_type', width: 12 },
                  { header: 'category', key: 'category', width: 14 },
                  { header: 'sponsor_name', key: 'sponsor_name', width: 18 },
                  { header: 'sponsor_amount', key: 'sponsor_amount', width: 16 },
                  { header: 'yes_percent', key: 'yes_percent', width: 12 },
                  { header: 'min_entry', key: 'min_entry', width: 10 },
                  { header: 'max_entry', key: 'max_entry', width: 10 },
                  { header: 'is_live', key: 'is_live', width: 8 },
                  { header: 'ends_at', key: 'ends_at', width: 20 },
                  { header: 'options', key: 'options', width: 70 },
                  { header: 'country', key: 'country', width: 10 },
                  { header: 'considerations', key: 'considerations', width: 55 },
                  { header: 'image_url', key: 'image_url', width: 50 },
                ]
                ws.addRow(template[0])

                const wsInst = wb.addWorksheet('Instrucciones')
                wsInst.columns = [
                  { header: 'Campo', key: 'Campo', width: 18 },
                  { header: 'Descripción', key: 'Descripcion', width: 70 },
                  { header: 'Ejemplo', key: 'Ejemplo', width: 50 },
                  { header: 'Dropdown', key: 'Dropdown', width: 55 },
                ]
                wsInst.addRows([
                  { Campo: 'question', Descripcion: 'Pregunta del evento (obligatorio)', Ejemplo: '¿Guatemala clasifica al Mundial 2026?', Dropdown: '' },
                  { Campo: 'event_type', Descripcion: '"binary" = SÍ/NO simple | "open" = múltiples opciones', Ejemplo: 'binary', Dropdown: '✓ binary, open' },
                  { Campo: 'category', Descripcion: 'Categoría del evento', Ejemplo: 'deportes', Dropdown: '✓ deportes, politica, economia, geopolitica, cultura, tecnologia, finanzas, otro' },
                  { Campo: 'sponsor_name', Descripcion: 'Nombre del patrocinador (opcional, dejar vacío si no hay)', Ejemplo: 'Gatorade GT', Dropdown: '' },
                  { Campo: 'sponsor_amount', Descripcion: 'Semilla del patrocinador en Q — 100% va al pool. 0 = sin sponsor, pool crece solo con votos.', Ejemplo: '5000', Dropdown: '' },
                  { Campo: 'yes_percent', Descripcion: 'Probabilidad inicial SÍ (1-99). SOLO para binary. Dejar vacío para open.', Ejemplo: '35', Dropdown: '' },
                  { Campo: 'min_entry', Descripcion: 'Entrada mínima en Q (default: 25)', Ejemplo: '25', Dropdown: '' },
                  { Campo: 'max_entry', Descripcion: 'Entrada máxima en Q (default: 500)', Ejemplo: '500', Dropdown: '' },
                  { Campo: 'is_live', Descripcion: '¿Evento en vivo? true = se muestra en sección En Vivo', Ejemplo: 'false', Dropdown: '✓ true, false' },
                  { Campo: 'ends_at', Descripcion: 'Fecha de cierre ISO (vacío = cierre manual desde admin)', Ejemplo: '2026-06-15T23:59', Dropdown: '' },
                  { Campo: 'options', Descripcion: 'SOLO para open. Formato: Nombre:porcentaje:0 separados por ; — porcentajes deben sumar 100. El tercer valor (pool) se pone 0.', Ejemplo: 'Comunicaciones:35:0;Municipal:30:0;Xelajú:20:0;Otro:15:0', Dropdown: '' },
                  { Campo: 'country', Descripcion: 'Código de país (GT, SV, HN, CR, PA, NI, BZ, MX, US, GLOBAL, etc.)', Ejemplo: 'GT', Dropdown: '✓ GT, SV, HN, NI, CR, PA, BZ, GLOBAL, + 20 más' },
                  { Campo: 'considerations', Descripcion: 'Contexto, fuente, criterio de resolución (opcional)', Ejemplo: 'Eliminatorias CONCACAF. Fuente: FIFA.', Dropdown: '' },
                  { Campo: 'image_url', Descripcion: 'URL de imagen (opcional, vacío = foto de categoría)', Ejemplo: 'https://images.unsplash.com/...', Dropdown: '' },
                ])
                const buffer = await wb.xlsx.writeBuffer()
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'b1n0_eventos_plantilla.xlsx'
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--b1n0-border)', cursor: 'pointer',
                background: 'var(--b1n0-card)', color: 'var(--b1n0-muted)',
                fontFamily: F, fontWeight: 600, fontSize: '11px',
              }}
              title="Descargar plantilla Excel"
            >
              Plantilla
            </button>
            <button
              onClick={() => bulkFileRef.current?.click()}
              disabled={bulkUploading}
              style={{
                padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: bulkUploading ? 'default' : 'pointer',
                background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)',
                fontFamily: F, fontWeight: 600, fontSize: '11px',
              }}
            >
              {bulkUploading ? 'Subiendo...' : 'Subir Excel'}
            </button>
            <button
              onClick={() => { setShowCreateForm(!showCreateForm); setEditingId(null); if (!showCreateForm) loadLpUsers() }}
              style={{
                width: '28px', height: '28px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: showCreateForm ? '#4ade80' : 'var(--b1n0-surface)',
                color: showCreateForm ? '#0d0d0d' : 'var(--b1n0-text-1)',
                fontFamily: F, fontWeight: 700, fontSize: '16px', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>
        </div>

        {bulkResult && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1n0-border)', background: bulkResult.fail > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: bulkResult.errors.length > 0 ? '8px' : 0 }}>
              <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>
                <strong>{bulkResult.ok}</strong> creado{bulkResult.ok !== 1 ? 's' : ''}
                {bulkResult.fail > 0 && <span style={{ color: '#f87171' }}> · <strong>{bulkResult.fail}</strong> fallido{bulkResult.fail !== 1 ? 's' : ''}</span>}
              </p>
              <button onClick={() => setBulkResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>✕</button>
            </div>
            {bulkResult.errors.length > 0 && (
              <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '11px', fontFamily: F, color: '#f87171', lineHeight: 1.5 }}>
                {bulkResult.errors.map((err, i) => <p key={i}>{err}</p>)}
              </div>
            )}
          </div>
        )}

        {manageLoading && (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Cargando...</div>
        )}

        {!manageLoading && allEvents.filter((e) => manageFilter === 'open' ? (e.status === 'open' || e.status === 'private') : (e.status !== 'open' && e.status !== 'private')).length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
            {manageFilter === 'open' ? 'No hay eventos activos.' : 'No hay eventos resueltos.'}
          </div>
        )}

        {!manageLoading && allEvents.filter((e) => manageFilter === 'open' ? (e.status === 'open' || e.status === 'private') : (e.status !== 'open' && e.status !== 'private')).map((ev, i) => {
          const color = categoryColors[ev.category] || 'var(--b1n0-muted)'
          const isEditing = editingId === ev.id
          const isSelected = selectedIds.has(ev.id)
          const statusColor = ev.status === 'open' ? '#4ade80' : ev.status === 'private' ? '#C4B5FD' : ev.status === 'closed' ? '#f87171' : 'var(--b1n0-muted)'
          return (
            <div
              key={ev.id}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: isSelected ? 'var(--b1n0-surface)' : isEditing ? 'var(--b1n0-surface)' : 'transparent' }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(ev.id)}
                style={{ width: '14px', height: '14px', accentColor: 'var(--b1n0-text-1)', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
                  {ev.question}
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{ev.category}</span>
                  <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{ev.event_type === 'open' ? 'múltiples' : 'sí/no'}</span>
                  <span style={{ fontFamily: F, fontSize: '10px', color: statusColor, fontWeight: 600 }}>{ev.status === 'private' ? '🔒 privado' : ev.status}</span>
                  {ev.is_live && <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-text-1)', fontWeight: 700 }}>● VIVO</span>}
                  <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{ev.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <button
                onClick={() => isEditing ? (setEditingId(null), setEditForm(null)) : startEdit(ev)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '8px', border: `1px solid ${isEditing ? 'var(--b1n0-border)' : 'var(--b1n0-border)'}`, background: isEditing ? 'var(--b1n0-surface)' : 'transparent', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 600, color: isEditing ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)' }}
              >
                {isEditing ? 'Cerrar' : 'Editar'}
              </button>
            </div>
          )
        })}
      </div>

      {selectedIds.size > 0 && (
        <div style={{
          position: 'sticky', bottom: '16px', marginTop: '12px',
          background: '#4ade80', borderRadius: '12px', padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: '#fff', fontWeight: 600 }}>
              {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}
            >
              Deseleccionar
            </button>
          </div>
          {!bulkDeleteConfirm ? (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(185,28,28,0.4)',
                background: 'rgba(185,28,28,0.15)', cursor: 'pointer',
                fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'rgba(248,113,113,0.3)',
              }}
            >
              Archivar ({selectedIds.size})
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'rgba(248,113,113,0.3)' }}>¿Seguro?</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading}
                style={{
                  padding: '7px 14px', borderRadius: '8px', border: 'none',
                  background: '#f87171', cursor: bulkDeleteLoading ? 'default' : 'pointer',
                  fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff',
                }}
              >
                {bulkDeleteLoading ? 'Archivando...' : 'Sí, archivar'}
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)',
                }}
              >
                No
              </button>
            </div>
          )}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', marginTop: '20px', marginBottom: '20px' }}>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', marginBottom: '16px' }}>Crear evento</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Tipo de evento</label>
                <Toggle
                  options={[{ value: 'binary', label: 'SÍ / NO' }, { value: 'open', label: 'Abierto (múltiples)' }]}
                  value={form.event_type}
                  onChange={(v) => setC('event_type', v as 'binary' | 'open')}
                />
                <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '5px' }}>
                  {isOpen ? 'Para preguntas con múltiples opciones. Cada opción tiene su propio precio inicial.' : 'Para preguntas con respuesta SÍ o NO.'}
                </p>
              </div>

              <div>
                <label style={labelStyle}>Pregunta del evento</label>
                <textarea required value={form.question} onChange={(e) => setC('question', e.target.value)}
                  placeholder={isOpen ? '¿Quién ganará las próximas elecciones en Guatemala?' : '¿Ejemplo de pregunta binaria?'}
                  style={{ ...inputStyle, height: '72px', resize: 'none', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={labelStyle}>Categoría</label>
                <select value={form.category} onChange={(e) => setC('category', e.target.value)} style={inputStyle}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>País</label>
                <select value={form.country} onChange={(e) => setC('country', e.target.value)} style={inputStyle}>
                  <optgroup label="Centroamérica">
                    {COUNTRIES.slice(0, 7).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </optgroup>
                  <option value="GLOBAL">🌎 Global</option>
                  <optgroup label="Todos los países">
                    {COUNTRIES.slice(8).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Imagen personalizada (URL o subir)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="url" value={form.image_url} onChange={(e) => setC('image_url', e.target.value)}
                    placeholder="https://... (opcional)"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <label style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)', fontFamily: F, fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: 'var(--b1n0-text-1)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Subir
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setCropFile({ file, target: 'create' })
                      e.target.value = ''
                    }} />
                  </label>
                </div>
                {form.image_url && (
                  <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', height: '80px', position: 'relative' }}>
                    <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
                <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>
                  Ideal: 1200×630px. Deja vacío para usar la foto de categoría.
                </p>
              </div>

              {!isOpen && (
                <div>
                  <label style={labelStyle}>SÍ % inicial</label>
                  <input type="number" min={0} max={100} value={form.yes_percent}
                    onChange={(e) => handleYes(parseInt(e.target.value) || 0)} style={inputStyle} />
                  <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>
                    SÍ {form.yes_percent}% · NO {form.no_percent}%
                  </p>
                </div>
              )}

              {isOpen && (
                <div>
                  <label style={labelStyle}>Opciones</label>
                  <OptionRows
                    options={form.options}
                    onChange={(opts) => setC('options', opts)}
                    maxPool={0}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Contexto (opcional)</label>
                <textarea value={form.considerations} onChange={(e) => setC('considerations', e.target.value)}
                  placeholder={isOpen ? 'Fuente: encuesta IRI, 15/02/26. Margen de error ±3%.' : 'Fuente, metodología, notas...'}
                  style={{ ...inputStyle, height: '60px', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Sponsor / Patrocinador</label>
                <input type="text" value={form.sponsor_name} onChange={(e) => setC('sponsor_name', e.target.value)}
                  placeholder="Ej: Tigo, Banrural, Gatorade..." style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Semilla sponsor (Q) — opcional</label>
                <input
                  type="number" min={0} step="any"
                  value={form.sponsor_amount || ''}
                  onChange={(e) => setC('sponsor_amount', parseInt(e.target.value) || 0)}
                  placeholder="0 = parimutuel puro (pool crece con votos)"
                  style={inputStyle}
                />
                {form.sponsor_amount > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(74,222,128,0.08)', borderRadius: '8px', border: '1px solid rgba(5,150,105,0.15)' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>100% al pool</span>
                    <span style={{ fontFamily: D, fontWeight: 700, fontSize: '13px', color: '#4ade80' }}>
                      Q{form.sponsor_amount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px' }}>
                <label style={labelStyle}>Capital LP (opcional)</label>
                <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '8px' }}>
                  LPs depositan capital al pool. Al resolver reciben capital + su % de fees.
                </p>

                {form.lp_commitments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                    {form.lp_commitments.map((lp, i) => {
                      const u = lpUsers.find(u => u.id === lp.user_id)
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(196,181,253,0.08)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.1)' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: '#C4B5FD', fontWeight: 600 }}>
                            {u?.name || lp.user_id.slice(0, 8)} — Q{lp.amount.toLocaleString()} · {lp.return_pct}% de fees
                          </span>
                          <button onClick={() => setC('lp_commitments', form.lp_commitments.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: '14px', padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px' }}>
                      <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Total LP capital</span>
                      <span style={{ fontFamily: D, fontWeight: 700, fontSize: '12px', color: '#C4B5FD' }}>
                        Q{form.lp_commitments.reduce((s, lp) => s + lp.amount, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <select
                    id="create_lp_user"
                    defaultValue=""
                    style={inputStyle}
                  >
                    <option value="">Seleccionar LP...</option>
                    {lpUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.id.slice(0, 8)} — Q{u.balance.toLocaleString()}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input id="create_lp_amt" type="number" min={0.01} step="any" placeholder="Monto (Q)" style={{ ...inputStyle, flex: 2 }} />
                    <input id="create_lp_ret" type="number" min={0} max={100} step={1} placeholder="% de fees" defaultValue="8" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById('create_lp_user') as HTMLSelectElement
                      const amt = document.getElementById('create_lp_amt') as HTMLInputElement
                      const ret = document.getElementById('create_lp_ret') as HTMLInputElement
                      if (!sel.value || !amt.value) return
                      setC('lp_commitments', [...form.lp_commitments, {
                        user_id: sel.value,
                        amount: parseFloat(amt.value),
                        return_pct: parseFloat(ret.value) || 8,
                      }])
                      sel.value = ''; amt.value = ''
                    }}
                    style={{ padding: '8px', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.2)', background: 'rgba(196,181,253,0.08)', color: '#C4B5FD', fontFamily: F, fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}
                  >
                    + Agregar LP
                  </button>
                </div>
              </div>

              <div>
              </div>

              {!isOpen && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Mín entrada (Q)</label>
                    <input type="number" min={1} value={form.min_entry}
                      onChange={(e) => setC('min_entry', parseInt(e.target.value) || 25)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Máx entrada (Q)</label>
                    <input type="number" min={1} value={form.max_entry}
                      onChange={(e) => setC('max_entry', parseInt(e.target.value) || 10000)} style={inputStyle} />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Cierre del evento</label>
                <Toggle
                  options={[{ value: 'manual', label: 'Cierre manual' }, { value: 'date', label: 'Fecha específica' }]}
                  value={form.close_mode}
                  onChange={(v) => setC('close_mode', v as 'manual' | 'date')}
                />
                <div style={{ marginTop: '8px' }}>
                  {form.close_mode === 'manual'
                    ? <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Se cierra manualmente desde Gestionar.</p>
                    : <input type="datetime-local" value={form.ends_at} onChange={(e) => setC('ends_at', e.target.value)} style={inputStyle} />
                  }
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="is_live_c" checked={form.is_live}
                  onChange={(e) => setC('is_live', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--b1n0-text-1)', cursor: 'pointer' }} />
                <label htmlFor="is_live_c" style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', cursor: 'pointer' }}>
                  Marcar como EN VIVO
                </label>
              </div>
            </div>
          </div>

          {createError && <p style={{ fontFamily: F, fontSize: '12px', color: '#f87171', padding: '8px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: '8px', marginTop: '12px' }}>{createError}</p>}
          {createSuccess && (
            <div style={{ padding: '10px', background: 'rgba(74,222,128,0.08)', borderRadius: '8px', marginTop: '12px' }}>
              <p style={{ fontFamily: F, fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>✓ {createSuccess}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="submit" disabled={createLoading}
              style={{ flex: 1, padding: '13px', borderRadius: '12px', border: 'none', background: createLoading ? 'rgba(255,255,255,0.12)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '13px', cursor: createLoading ? 'default' : 'pointer' }}>
              {createLoading ? 'Creando...' : 'Crear evento →'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)}
              style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid var(--b1n0-border)', background: 'transparent', color: 'var(--b1n0-text-1)', fontFamily: F, fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cropFile && (
        <ImageCropper
          file={cropFile.file}
          onCropped={async (blob) => {
            const path = `events/${Date.now()}.jpg`
            const { error } = await supabase.storage.from('event-images').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
            if (error) { alert('Error subiendo imagen: ' + error.message); setCropFile(null); return }
            const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path)
            if (urlData?.publicUrl) {
              if (cropFile.target === 'create') setC('image_url', urlData.publicUrl)
              else setE('image_url', urlData.publicUrl)
            }
            setCropFile(null)
          }}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  )
}
