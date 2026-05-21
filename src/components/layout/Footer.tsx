/**
 * Footer — minimal centered footer mounted at the bottom of the
 * user-facing pages (Inicio, Portafolio, Historial, Documentación,
 * Perfil, Mis Llamados). NOT mounted on admin, auth, or event-detail.
 *
 * Visual philosophy: complement the header, don't compete with it.
 *   - Centered layout — single column, no empty-column problem
 *   - Inline link row (· separated) — fits the 5-link footprint better
 *     than a 3-column treatment with one orphan column
 *   - Transparent background — inherits page bg, no contrast plate
 *   - Hairline border-top + a single inner divider — quiet chrome
 *   - Tight vertical spacing — the user is here to leave the page, not
 *     read a 300px tall plate
 *
 * Why inside each page (not mounted at App level):
 *   The app shell uses `overflow: hidden` on <main> with per-page
 *   scroll containers. Mounting at the end of each page's scroll
 *   content means the footer scrolls with the content.
 */

import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTour } from '../../context/TourContext'
import { useTheme } from '../../context/ThemeContext'

const F_BODY = 'var(--font-body)'

// Theme-aware logo — same source as TopBar, so chrome matches
// top-to-bottom (white wordmark on dark, fullcolor on light).
function logoSrcFor(theme: 'dark' | 'light'): string {
  return theme === 'light' ? '/brand/b1n0-logo-fullcolor.svg' : '/brand/b1n0-logo-white.svg'
}

export function Footer() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startTour } = useTour()
  const { resolved } = useTheme()

  function openTour() {
    if (location.pathname !== '/inicio') navigate('/inicio')
    setTimeout(() => startTour(), 300)
  }

  return (
    <footer
      style={{
        marginTop: 'var(--space-8)',
        paddingTop: 'var(--space-7)',
        paddingBottom: 'var(--space-6)',
        paddingLeft: 'var(--space-6)',
        paddingRight: 'var(--space-6)',
        borderTop: '1px solid var(--b1n0-border)',
        background: 'transparent',
        fontFamily: F_BODY,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* ── Brand row — logo is clickable, returns to /inicio ─ */}
        <Link
          to="/inicio"
          aria-label="b1n0 · Volver a inicio"
          style={{
            display: 'inline-block',
            marginBottom: 8,
            // Inherit color for any current/foreground bits inside the
            // logo asset; transition tied to text-1 ↔ si on hover.
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <img
            src={logoSrcFor(resolved)}
            alt="b1n0"
            style={{
              height: 24,  // matches TopBar wordmark size
              width: 'auto',
              display: 'block',
              margin: '0 auto',
              transition: 'opacity var(--duration-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          />
        </Link>
        <p
          style={{
            fontSize: 12,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 'var(--space-6)',
            lineHeight: 1.5,
          }}
        >
          Mercado de opciones sobre eventos.
        </p>

        {/* ── Link row — responsive grid for clean mobile wrap.
            On desktop (≥ 560px): one flex row, all 6 inline.
            On mobile: 3-column grid, 2 rows of 3 — even and tidy.
            Dot separators dropped — at low opacity they were nearly
            invisible on mobile and added clutter without helping
            visual flow. Spacing alone reads cleaner. */}
        <nav
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            columnGap: '12px',
            rowGap: '12px',
            justifyItems: 'center',
            marginBottom: 'var(--space-6)',
          }}
          className="footer-links"
        >
          <FooterLinkButton onClick={openTour}>Cómo jugar</FooterLinkButton>
          <FooterLink to="/inicio">Eventos</FooterLink>
          <FooterLink to="/documentacion">Documentación</FooterLink>
          <FooterAnchor href="mailto:soporte@b1n0.com">Soporte</FooterAnchor>
          <FooterLink to="/terminos">Términos</FooterLink>
          <FooterLink to="/privacidad">Privacidad</FooterLink>
          <FooterLink to="/confianza">Confianza</FooterLink>
        </nav>

        {/* Inline media query so the grid flips to a single inline
            row on screens ≥ 560px without needing a CSS file. The
            scoped class avoids leaking the rule app-wide. */}
        <style>{`
          @media (min-width: 560px) {
            .footer-links {
              display: flex !important;
              flex-wrap: wrap;
              justify-content: center;
              gap: 22px !important;
            }
          }
        `}</style>

        {/* ── Combined disclaimer + corporate paragraph ─────────
            Kim's call: collapse risk warning + Tres33 registration +
            CNAD framework into a single paragraph so it reads as one
            unified legal block, not three stacked plates. */}
        <p
          style={{
            fontSize: 11,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 'var(--space-5)',
            lineHeight: 1.65,
            maxWidth: 580,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Los llamados implican riesgo de pérdida del capital. Solo para mayores
          de 18 años. Los participantes son responsables de cumplir las leyes
          aplicables en su jurisdicción. Tres33 SAS de CV está registrado en El
          Salvador. Tokenización de contratos y activos digitales operada por
          proveedor licenciado bajo el marco regulatorio CNAD de El Salvador.
        </p>

        {/* ── Hairline divider before copyright ────────────────── */}
        <div
          style={{
            height: 1,
            background: 'var(--b1n0-border)',
            margin: '0 auto var(--space-5)',
            maxWidth: 200,
            opacity: 0.7,
          }}
        />

        {/* ── Copyright row — standalone close ────────────────── */}
        <p
          style={{
            fontSize: 11,
            color: 'var(--b1n0-muted)',
            margin: 0,
            opacity: 0.7,
          }}
        >
          © {new Date().getFullYear()} b1n0 · una marca de Tres33 SAS de CV · Todos los derechos reservados
        </p>
      </div>
    </footer>
  )
}

// ── Internal route link ──────────────────────────────────────
function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </Link>
  )
}

// ── External anchor (mailto, http) ───────────────────────────
function FooterAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </a>
  )
}

// ── Action button styled as a link (for Cómo jugar) ──────────
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
        fontFamily: F_BODY,
        fontSize: 13,
        color: 'var(--b1n0-text-1)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
    >
      {children}
    </button>
  )
}
