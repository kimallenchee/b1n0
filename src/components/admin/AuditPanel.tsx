import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const F = 'var(--font-body)'
const D = 'var(--font-display)'
const N = 'var(--font-num)'

/**
 * AuditPanel — admin observability surface for the admin_actions
 * table. Renders the most recent N admin write actions with full
 * context: who did it, when, what kind, against which target, with
 * what reason, and the full jsonb payload behind a click-to-expand.
 *
 * Data source: public.admin_actions (RLS: admins only). Each row
 * comes from a SECURITY DEFINER RPC calling log_admin_action().
 * Today: void_event + settle_event are wired. As more admin RPCs
 * adopt the helper, they'll show up here automatically.
 */

interface AuditRow {
  id: string
  actor_id: string
  action_type: string
  target_type: string
  target_id: string | null
  reason: string | null
  payload: Record<string, unknown>
  created_at: string
  actor_name?: string
}

const ACTION_META: Record<string, { icon: string; tint: string; label: string }> = {
  void_event:     { icon: '↺', tint: 'var(--b1n0-orange-500)', label: 'Anulación' },
  settle_event:   { icon: '✓', tint: 'var(--b1n0-si)',         label: 'Resolución' },
  adjust_balance: { icon: '±', tint: '#C4B5FD',                label: 'Ajuste saldo' },
  update_config:  { icon: '⚙',  tint: 'var(--b1n0-muted)',     label: 'Configuración' },
  create_event:   { icon: '+', tint: 'var(--b1n0-si)',         label: 'Evento creado' },
  edit_event:     { icon: '✎', tint: 'var(--b1n0-muted)',      label: 'Evento editado' },
  lp_deposit:     { icon: '$', tint: '#C4B5FD',                label: 'Depósito LP' },
  bulk_archive:   { icon: '✕', tint: 'var(--b1n0-muted)',      label: 'Archivo masivo' },
}

const FALLBACK_META = { icon: '•', tint: 'var(--b1n0-muted)', label: 'Acción admin' }

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `hace ${hr}h`
  const days = Math.round(hr / 24)
  if (days < 30) return `hace ${days} días`
  const dt = new Date(iso)
  return dt.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function previewPayload(action: string, payload: Record<string, unknown>): string {
  if (!payload) return ''
  if (action === 'void_event') {
    const total = payload.grand_total ?? payload.lp_total ?? 0
    const positions = payload.positions_refunded ?? 0
    const lps = payload.lp_refunded ?? 0
    return `Reembolsado $${Number(total).toFixed(2)} a ${positions} usuario${positions === 1 ? '' : 's'} + ${lps} LP${lps === 1 ? '' : 's'}`
  }
  if (action === 'settle_event') {
    const winners = payload.winners_count ?? 0
    const losers = payload.losers_count ?? 0
    const skim = payload.total_skimmed ?? 0
    const lpPaid = payload.lp_total_paid ?? 0
    return `${winners} ganador${winners === 1 ? '' : 'es'}, ${losers} perdedor${losers === 1 ? '' : 'es'}, skim $${Number(skim).toFixed(2)}, LP $${Number(lpPaid).toFixed(2)}`
  }
  // Fallback: show first scalar field
  const scalars = Object.entries(payload).filter(([, v]) => typeof v !== 'object').slice(0, 3)
  return scalars.map(([k, v]) => `${k}=${v}`).join(' · ')
}

export function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from('admin_actions')
      .select('id, actor_id, action_type, target_type, target_id, reason, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    if (!data || data.length === 0) {
      setRows([])
      setLoading(false)
      return
    }
    // Pull actor names in a second pass so the table isn't joined server-side
    const actorIds = [...new Set(data.map((r: { actor_id: string }) => r.actor_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username')
      .in('id', actorIds)
    const nameMap: Record<string, string> = {}
    if (profiles) {
      for (const p of profiles as Array<{ id: string; name: string | null; username: string | null }>) {
        nameMap[p.id] = p.name || (p.username ? `@${p.username}` : p.id.slice(0, 8))
      }
    }
    setRows(data.map((r: AuditRow) => ({ ...r, actor_name: nameMap[r.actor_id] || r.actor_id.slice(0, 8) })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Action-type filter chips for the strip above the list.
  const actionTypes = [...new Set(rows.map(r => r.action_type))].sort()
  const filtered = actionFilter === 'all' ? rows : rows.filter(r => r.action_type === actionFilter)

  return (
    <div>
      {/* Header strip: title + reload + action-type filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '20px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
            Auditoría
          </p>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            Cada acción admin que mueve dinero o cambia estado deja un rastro acá.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--b1n0-border)',
            background: 'var(--b1n0-card)',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: F,
            fontWeight: 600,
            fontSize: '12px',
            color: 'var(--b1n0-text-1)',
          }}
        >
          {loading ? 'Cargando...' : 'Recargar'}
        </button>
      </div>

      {/* Filter chips (only when there's >1 action type to filter) */}
      {actionTypes.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: '12px' }}>
          {(['all', ...actionTypes] as string[]).map(at => {
            const meta = at === 'all' ? null : (ACTION_META[at] || FALLBACK_META)
            const active = actionFilter === at
            return (
              <button
                key={at}
                onClick={() => setActionFilter(at)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 'var(--radius-pill)',
                  border: active ? 'none' : '1px solid var(--b1n0-border)',
                  background: active ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)',
                  color: active ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)',
                  fontFamily: F,
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                }}
              >
                {at === 'all' ? `Todas (${rows.length})` : `${meta?.label || at} (${rows.filter(r => r.action_type === at).length})`}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', padding: '10px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-lg)', marginBottom: '12px' }}>
          {error}
        </p>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
            {rows.length === 0
              ? 'Sin acciones admin registradas todavía.'
              : 'Sin acciones del tipo seleccionado.'}
          </p>
        </div>
      )}

      {/* Audit row list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.map(r => {
          const meta = ACTION_META[r.action_type] || FALLBACK_META
          const isExpanded = expandedId === r.id
          const summary = previewPayload(r.action_type, r.payload)
          return (
            <div
              key={r.id}
              style={{
                background: 'var(--b1n0-card)',
                border: '1px solid var(--b1n0-border)',
                borderLeft: `3px solid ${meta.tint}`,
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: `color-mix(in srgb, ${meta.tint} 14%, transparent)`,
                    color: meta.tint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: F,
                    fontSize: '14px',
                    fontWeight: 700,
                  }}
                >
                  {meta.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ fontFamily: F, fontWeight: 700, fontSize: '12px', color: 'var(--b1n0-text-1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {meta.label}
                    </span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                      por {r.actor_name}
                    </span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>·</span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                      {formatRelativeTime(r.created_at)}
                    </span>
                  </div>
                  {r.reason && (
                    <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </p>
                  )}
                  {summary && (
                    <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                      {summary}
                    </p>
                  )}
                  {r.target_id && (
                    <p style={{ fontFamily: N, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>
                      {r.target_type}: {r.target_id.slice(0, 8)}…{r.target_id.slice(-4)}
                    </p>
                  )}
                </div>
                <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', flexShrink: 0, marginTop: '2px' }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--b1n0-border)' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '10px 0 6px' }}>
                    Payload
                  </p>
                  <pre style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--b1n0-text-1)',
                    background: 'var(--b1n0-surface)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    overflowX: 'auto',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                  {r.target_id && (
                    <p style={{ fontFamily: N, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                      Target ID completo: {r.target_id}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
