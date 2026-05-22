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
 *
 * Social row + language toggle added 2026-05-21 to match the pattern
 * users expect from comparable global platforms. Socials live above
 * the legal/nav links; the ES/EN pill lives below the disclaimer so
 * it doesn't visually compete with the nav.
 */

import { useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTour } from '../../context/TourContext'
import { useTheme } from '../../context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { setLanguage, getLanguage } from '../../i18n'
import { setTranslation } from '../../i18n/google-translate'
import {
  XLogo,
  InstagramLogo,
  FacebookLogo,
  WhatsappLogo,
  EnvelopeSimple,
} from '@phosphor-icons/react'

const F_BODY = 'var(--font-body)'

// Social destinations. Centralized so the URLs live in one place — if a
// handle changes, this is the only line that updates.
const SOCIALS = {
  x: 'https://x.com/b1n0media',
  instagram: 'https://instagram.com/b1n0media',
  facebook: 'https://facebook.com/b1n0media',
  whatsapp: 'https://wa.me/50312345678', // placeholder ES support number
  email: 'mailto:soporte@b1n0.com',
}

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
  const { t, i18n } = useTranslation()
  const currentLang = getLanguage()

  // Boot the Google Translate widget on mount if a returning visitor
  // has 'en' saved. We do this from Footer rather than main.tsx so the
  // widget module is only ever fetched on user-facing pages (admin /
  // auth pages don't mount the Footer and won't pay the cost).
  useEffect(() => {
    if (currentLang === 'en') {
      setTranslation('en')
    }
    // Only on mount — the toggle handler covers subsequent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openTour() {
    if (location.pathname !== '/inicio') navigate('/inicio')
    setTimeout(() => startTour(), 300)
  }

  // Toggle handler. Two coordinated effects:
  //   1. Our own i18n (react-i18next) flips the chrome strings we
  //      manually translated (footer, nav, share modal, etc).
  //   2. The Google Translate widget translates everything else
  //      (event questions, news, comments, deep pages) live in the DOM.
  // The widget is lazy-loaded the first time the user picks EN; going
  // back to ES restores the original DOM and clears the widget's cookie.
  function pickLang(lang: 'es' | 'en') {
    if (lang === currentLang) return
    setLanguage(lang)
    // Touch i18n directly to be doubly sure the change propagates even if
    // some component holds a stale reference.
    i18n.changeLanguage(lang)
    // Fire-and-forget — the widget may take a few hundred ms to load on
    // first invocation but we don't want to block the UI on it.
    setTranslation(lang)
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
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <img
            src={logoSrcFor(resolved)}
            alt="b1n0"
            style={{
              height: 24,
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
          {t('footer.tagline')}
        </p>

        {/* ── Social icons row — Phosphor regular weight, muted color.
            Outbound links open in a new tab. Each icon is wrapped in an
            anchor with an accessible label since the icons themselves
            carry no text. */}
        <nav
          aria-label={t('footer.follow')}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 18,
            marginBottom: 'var(--space-6)',
          }}
        >
          <SocialIcon href={SOCIALS.x} label="X (Twitter)"><XLogo size={18} weight="regular" /></SocialIcon>
          <SocialIcon href={SOCIALS.instagram} label="Instagram"><InstagramLogo size={18} weight="regular" /></SocialIcon>
          <SocialIcon href={SOCIALS.facebook} label="Facebook"><FacebookLogo size={18} weight="regular" /></SocialIcon>
          <SocialIcon href={SOCIALS.whatsapp} label="WhatsApp"><WhatsappLogo size={18} weight="regular" /></SocialIcon>
          <SocialIcon href={SOCIALS.email} label={t('footer.support')}><EnvelopeSimple size={18} weight="regular" /></SocialIcon>
        </nav>

        {/* ── Link row — responsive grid for clean mobile wrap. */}
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
          <FooterLinkButton onClick={openTour}>{t('footer.howToPlay')}</FooterLinkButton>
          <FooterLink to="/inicio">{t('footer.events')}</FooterLink>
          <FooterLink to="/documentacion">{t('footer.docs')}</FooterLink>
          <FooterAnchor href="mailto:soporte@b1n0.com">{t('footer.support')}</FooterAnchor>
          <FooterLink to="/terminos">{t('footer.terms')}</FooterLink>
          <FooterLink to="/privacidad">{t('footer.privacy')}</FooterLink>
          {/* Confianza is the 7th link — on mobile's 3-col grid it lands
              alone in row 3. Forcing it into column 2 centers it for
              symmetry. */}
          <div style={{ gridColumn: '2', display: 'flex', justifyContent: 'center' }} className="footer-confianza">
            <FooterLink to="/confianza">{t('footer.trust')}</FooterLink>
          </div>
        </nav>

        {/* Inline media query so the grid flips to a single inline
            row on screens ≥ 560px without needing a CSS file. */}
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

        {/* ── Combined disclaimer + corporate paragraph ───────── */}
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
          {t('footer.disclaimer')}
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

        {/* ── Bottom row: copyright (left) + language pill (right) on
             desktop. On mobile they stack — copyright above, pill below. */}
        <div
          className="footer-bottom"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: 'var(--b1n0-muted)',
              margin: 0,
              opacity: 0.7,
              textAlign: 'center',
            }}
          >
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>

          {/* Language toggle — segmented pill. Selected state inverts
              (text-1 bg, bg text) per the b1n0 selected-state pattern
              in CLAUDE.md. */}
          <div
            role="group"
            aria-label={t('footer.language')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--b1n0-card)',
              border: '1px solid var(--b1n0-border)',
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}
          >
            <LangButton
              active={currentLang === 'es'}
              onClick={() => pickLang('es')}
              label="Español"
            >
              ES
            </LangButton>
            <LangButton
              active={currentLang === 'en'}
              onClick={() => pickLang('en')}
              label="English"
            >
              EN
            </LangButton>
          </div>
        </div>
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

// ── Action button styled as a link ───────────────────────────
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

// ── Social icon link ─────────────────────────────────────────
function SocialIcon({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  const isExternal = href.startsWith('http')
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 999,
        color: 'var(--b1n0-muted)',
        textDecoration: 'none',
        transition: 'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--b1n0-text-1)'
        e.currentTarget.style.background = 'var(--b1n0-card)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--b1n0-muted)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </a>
  )
}

// ── Language pill button ─────────────────────────────────────
function LangButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      style={{
        appearance: 'none',
        border: 'none',
        background: active ? 'var(--b1n0-text-1)' : 'transparent',
        color: active ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)',
        fontFamily: F_BODY,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        padding: '4px 12px',
        borderRadius: 999,
        cursor: active ? 'default' : 'pointer',
        transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
        minWidth: 36,
      }}
    >
      {children}
    </button>
  )
}
