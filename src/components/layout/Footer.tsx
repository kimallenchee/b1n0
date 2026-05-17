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
        {/* ── Brand row ─────────────────────────────────────────── */}
        <img
          src={logoSrcFor(resolved)}
          alt="b1n0"
          style={{
            height: 22,
            width: 'auto',
            display: 'block',
            margin: '0 auto 8px',
          }}
        />
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

        {/* ── Inline link row — flat, no columns ───────────────── */}
        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '14px',
            rowGap: '8px',
            marginBottom: 'var(--space-6)',
          }}
        >
          <FooterLinkButton onClick={openTour}>Cómo jugar</FooterLinkButton>
          <Dot />
          <FooterLink to="/inicio">Eventos</FooterLink>
          <Dot />
          <FooterLink to="/documentacion">Documentación</FooterLink>
          <Dot />
          <FooterAnchor href="mailto:soporte@b1n0.com">Soporte</FooterAnchor>
          <Dot />
          <FooterLink to="/terminos">Términos</FooterLink>
          <Dot />
          <FooterLink to="/privacidad">Privacidad</FooterLink>
        </nav>

        {/* ── Disclaimer ───────────────────────────────────────── */}
        <p
          style={{
            fontSize: 11,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 'var(--space-5)',
            lineHeight: 1.6,
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Los llamados implican riesgo de pérdida del capital. Solo para mayores
          de 18 años. Los participantes son responsables de cumplir las leyes
          aplicables en su jurisdicción.
        </p>

        {/* ── Hairline divider before corporate block ──────────── */}
        <div
          style={{
            height: 1,
            background: 'var(--b1n0-border)',
            margin: '0 auto var(--space-5)',
            maxWidth: 200,
            opacity: 0.7,
          }}
        />

        {/* ── Corporate + regulatory + copyright ───────────────── */}
        <p
          style={{
            fontSize: 11,
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 4,
            fontWeight: 500,
          }}
        >
          Tres33 SAS de CV · Registrado en El Salvador
        </p>
        <p
          style={{
            fontSize: 11,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 'var(--space-4)',
            opacity: 0.85,
          }}
        >
          Tokenización de contratos y activos digitales bajo el marco regulatorio CNAD de El Salvador
        </p>
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

// ── Inline dot separator between links ────────────────────────
function Dot() {
  return (
    <span
      aria-hidden
      style={{
        color: 'var(--b1n0-muted)',
        fontSize: 13,
        opacity: 0.4,
        userSelect: 'none',
      }}
    >
      ·
    </span>
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
