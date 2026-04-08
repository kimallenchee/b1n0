const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const products = [
  {
    name: 'Fondos Mutuos',
    desc: 'Participá en fondos colectivos con gestión profesional y liquidez mensual.',
  },
  {
    name: 'Certificados de Depósito',
    desc: 'Rendimientos garantizados a plazo fijo. Sin riesgo, sin sorpresas.',
  },
  {
    name: 'Bonos del Estado',
    desc: 'Invertí en deuda soberana de Guatemala desde Q500.',
  },
  {
    name: 'Microfinanzas',
    desc: 'Financiá proyectos locales y compartí el retorno con emprendedores.',
  },
]

export function Otro() {
  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 24px' }}>
      {/* Header */}
      <div style={{ padding: '24px 0 20px', textAlign: 'center' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '24px', color: 'var(--b1n0-text-1)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Más productos
        </p>
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', lineHeight: 1.6, maxWidth: '280px', margin: '0 auto' }}>
          Estamos construyendo alternativas de inversión para el mercado centroamericano.
        </p>
      </div>

      {/* Product cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {products.map((p) => (
          <div
            key={p.name}
            style={{
              background: 'var(--b1n0-card)',
              border: '1px solid var(--b1n0-border)',
              borderLeft: '3px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '14px',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: F, fontWeight: 600, fontSize: '14px', color: 'var(--b1n0-text-1)', marginBottom: '5px' }}>
                {p.name}
              </p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
                {p.desc}
              </p>
            </div>
            <span
              style={{
                fontFamily: F,
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--b1n0-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                background: 'var(--b1n0-surface)',
                borderRadius: '6px',
                padding: '4px 8px',
                flexShrink: 0,
                marginTop: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              Pronto
            </span>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px',
          background: 'var(--b1n0-surface)',
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
          ¿Qué producto te gustaría ver primero?{' '}
          <span style={{ fontFamily: F, fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Escribinos.</span>
        </p>
      </div>
    </div>
  )
}
