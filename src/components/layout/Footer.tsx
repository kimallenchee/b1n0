/**
 * Footer — shared brand footer mounted at the bottom of the user-
 * facing pages (Inicio, Portafolio, Historial, Documentación,
 * Perfil, Mis Llamados). NOT mounted on admin, auth, or event-detail
 * (those are content-dense / focused funnels).
 *
 * Visual philosophy: complement the header, not compete with it.
 *   - Transparent background — inherits page bg, no contrast plate
 *   - Hairline border-top only — same weight as the rest of the chrome
 *   - Vertical breathing room — readers should reach this naturally
 *     after the page content, not bump into it
 *
 * Layout:
 *   - Mobile: stacked single column
 *   - Desktop (≥640px): 3 columns (Producto / Empresa / Legal),
 *     auto-fit so it collapses gracefully on tablets
 *
 * Why inside each page (not mounted at App level):
 *   The app shell uses `overflow: hidden` on <main> with per-page
 *   scroll containers. A global footer would either be position:fixed
 *   (bad UX) or never visible. Mounting at the end of each page's
 *   scroll content means the footer scrolls with the content.
 */

import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTour } from '../../context/TourContext'

const F_BODY    = 'var(--font-body)'
const F_DISPLAY = 'var(--font-display)'

export function Footer() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startTour } = useTour()

  function openTour() {
    if (location.pathname !== '/inicio') navigate('/inicio')
    setTimeout(() => startTour(), 300)
  }

  return (
    <footer
      style={{
        marginTop: 'var(--space-9)',
        paddingTop: 'var(--space-8)',
        paddingBottom: 'var(--space-7)',
        paddingLeft: 'var(--space-6)',
        paddingRight: 'var(--space-6)',
        borderTop: '1px solid var(--b1n0-border)',
        // Transparent — inherits page bg so the footer reads as a
        // natural extension of the content rather than a heavy plate.
        background: 'transparent',
        fontFamily: F_BODY,
      }}
    >
      {/* ── Brand row: wordmark + descriptor ──────────────────── */}
      <div style={{ maxWidth: 960, margin: '0 auto', marginBottom: 'var(--space-7)' }}>
        <p
          style={{
            fontFamily: F_DISPLAY,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 6,
          }}
        >
          b1n0
        </p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--b1n0-muted)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Mercado de opciones sobre eventos.
        </p>
      </div>

      {/* ── Link columns ───────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-6)',
          marginBottom: 'var(--space-7)',
        }}
      >
        <FooterColumn title="Producto">
          <FooterLinkButton onClick={openTour}>Cómo jugar</FooterLinkButton>
          <FooterLink to="/inicio">Eventos</FooterLink>
          <FooterLink to="/documentacion">Documentación</FooterLink>
        </FooterColumn>

        <FooterColumn title="Empresa">
          <FooterAnchor href="mailto:soporte@b1n0.com">Soporte</FooterAnchor>
        </FooterColumn>

        <FooterColumn title="Legal">
          <FooterLink to="/terminos">Términos</FooterLink>
          <FooterLink to="/privacidad">Privacidad</FooterLink>
        </FooterColumn>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          marginBottom: 'var(--space-5)',
          fontSize: 11,
          color: 'var(--b1n0-muted)',
          lineHeight: 1.6,
        }}
      >
        Los llamados implican riesgo de pérdida del capital. Solo para mayores
        de 18 años. Los participantes son responsables de cumplir las leyes
        aplicables en su jurisdicción.
      </div>

      {/* ── Corporate + regulatory ─────────────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          paddingTop: 'var(--space-5)',
          borderTop: '1px solid var(--b1n0-border)',
          fontSize: 11,
          color: 'var(--b1n0-muted)',
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: 0 }}>
          Operado por <strong style={{ color: 'var(--b1n0-text-1)', fontWeight: 600 }}>Tres33 SAS de CV</strong> · Registrado en El Salvador
        </p>
        <p style={{ margin: 0, marginTop: 2, opacity: 0.85 }}>
          Tokenización de contratos y activos digitales bajo el marco regulatorio CNAD de El Salvador
        </p>
        <p style={{ margin: 0, marginTop: 'var(--space-3)' }}>
          © {new Date().getFullYear()} b1n0
        </p>
      </div>
    </footer>
  )
}

// ── Column header + children stack ─────────────────────────────
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginBottom: 'var(--space-3)',
        }}
      >
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {children}
      </div>
    </div>
  )
}

// ── Internal route link (react-router) ────────────────────────
function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </Link>
  )
}

// ── External anchor (mailto, http) ────────────────────────────
function FooterAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </a>
  )
}

// ── Inline action button styled like a link (for "Cómo jugar"). ─
function FooterLinkButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        fontFamily: F_BODY,
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </button>
  )
}
