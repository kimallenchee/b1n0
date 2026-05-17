/**
 * Footer — shared brand footer mounted at the bottom of every page
 * that wants it (Inicio, Portafolio, Historial, Documentación, Perfil,
 * Mis Llamados). NOT mounted on admin, auth, or event-detail pages
 * (those are content-dense / focused funnels).
 *
 * Layout:
 *   - Mobile: stacked, single column
 *   - Desktop (≥720px): 3 columns (Producto / Empresa / Legal) + brand
 *     mark above and copyright below
 *
 * Why inside each page (not mounted globally at App level):
 *   The app shell uses `overflow: hidden` on <main> with per-page
 *   scroll containers. A global footer would either be position:fixed
 *   (bad UX) or never visible. Putting it at the end of each page's
 *   scrollable content means it scrolls naturally and reaches the
 *   user at the moment they finish consuming the page.
 *
 * Links: only links that go somewhere real. Dead/aspirational links
 * are kept out — a footer with broken links looks worse than no
 * footer at all.
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
        marginTop: 'var(--space-8)',
        padding: 'var(--space-8) var(--space-6) var(--space-6)',
        borderTop: '1px solid var(--b1n0-border)',
        background: 'var(--b1n0-surface)',
        fontFamily: F_BODY,
      }}
    >
      {/* ── Brand row: wordmark + tagline ──────────────────────── */}
      <div style={{ maxWidth: 960, margin: '0 auto', marginBottom: 'var(--space-6)' }}>
        <p
          style={{
            fontFamily: F_DISPLAY,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 4,
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
          Demostrá que sabés más que todos.
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
          marginBottom: 'var(--space-6)',
        }}
      >
        <FooterColumn title="Producto">
          <FooterLinkButton onClick={openTour}>Cómo jugar</FooterLinkButton>
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

      {/* ── Copyright row ──────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          paddingTop: 'var(--space-5)',
          borderTop: '1px solid var(--b1n0-border)',
          fontSize: 11,
          color: 'var(--b1n0-muted)',
          lineHeight: 1.6,
        }}
      >
        © {new Date().getFullYear()} Tres33 SAS de CV · Hecho en Centroamérica
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
