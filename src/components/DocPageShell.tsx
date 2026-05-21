/**
 * DocPageShell — shared documentation-style chrome.
 *
 * Mirrors the structure of `/documentacion` so that every footer-linked
 * informational page (Términos, Privacidad, Confianza) renders with the
 * same outer layout: back link → header (eyebrow + H1 + intro + last
 * updated) → body (sticky TOC on desktop / accordion on mobile) → Footer.
 *
 * Pages provide their content as an array of sections, each with its own
 * eyebrow, title, and ReactNode body. The body should be composed from
 * the exported block helpers (DocParagraph, DocBullets, DocCallout) to
 * stay visually aligned with the canonical /documentacion typography.
 *
 * Sections are deep-linkable via URL hash (e.g. /confianza#seguridad).
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CaretDown } from '@phosphor-icons/react'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { Footer } from './layout/Footer'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

export interface DocPageSection {
  id: string
  eyebrow: string
  title: string
  children: React.ReactNode
}

export interface DocPageShellProps {
  pageEyebrow: string
  pageTitle: string
  intro: string
  lastUpdated?: string
  sections: DocPageSection[]
}

// ── Section header (matches Documentacion SectionHeader) ─────
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.6px', marginBottom: '6px' }}>
        {eyebrow}
      </p>
      <h2 style={{ fontFamily: D, fontSize: '26px', fontWeight: 800, color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', margin: 0 }}>
        {title}
      </h2>
    </div>
  )
}

// ── Mobile accordion section ─────────────────────────────────
function AccordionSection({ section, openByDefault }: { section: DocPageSection; openByDefault: boolean }) {
  const [open, setOpen] = useState(openByDefault)
  return (
    <section id={section.id} style={{ borderTop: '1px solid var(--b1n0-border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.6px' }}>{section.eyebrow}</span>
          <h2 style={{ fontFamily: D, fontSize: '17px', fontWeight: 800, color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px', margin: 0 }}>{section.title}</h2>
        </div>
        <CaretDown size={16} color="var(--b1n0-muted)" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.18s var(--ease-out)' }} />
      </button>
      {open && (
        <div style={{ paddingBottom: '24px' }}>
          {section.children}
        </div>
      )}
    </section>
  )
}

// ── Sticky TOC (desktop) ────────────────────────────────────
function TableOfContents({ sections, active }: { sections: DocPageSection[]; active: string }) {
  return (
    <nav style={{ position: 'sticky', top: '24px', alignSelf: 'flex-start' }}>
      <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>
        En esta página
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {sections.map((s) => {
          const isActive = active === s.id
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                style={{
                  display: 'block', padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                  fontFamily: F, fontSize: '13px',
                  color: isActive ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                  background: isActive ? 'var(--b1n0-hover-overlay)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? '2px solid var(--b1n0-si)' : '2px solid transparent',
                  textDecoration: 'none', transition: 'all 0.15s var(--ease-out)',
                }}
              >
                {s.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ── Main shell ──────────────────────────────────────────────
export function DocPageShell({ pageEyebrow, pageTitle, intro, lastUpdated, sections }: DocPageShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useIsDesktop()
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')

  // Scroll-spy on desktop
  useEffect(() => {
    if (!isDesktop) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id)
        }
      },
      { rootMargin: '-30% 0px -60% 0px' }
    )
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [isDesktop, sections])

  // Hash deep-link on mount
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    }
  }, [location.hash])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', color: 'var(--b1n0-text-1)', padding: isDesktop ? '32px 24px 64px' : '20px 16px 64px' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{ background: 'none', border: 'none', color: 'var(--b1n0-muted)', fontFamily: F, fontSize: '13px', cursor: 'pointer', padding: '8px 0', marginBottom: '20px' }}
        >
          ← Volver
        </button>

        <header style={{ marginBottom: isDesktop ? '40px' : '24px', maxWidth: '720px' }}>
          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.6px', marginBottom: '8px' }}>
            {pageEyebrow}
          </p>
          <h1 style={{ fontFamily: D, fontSize: isDesktop ? '40px' : '28px', fontWeight: 800, color: 'var(--b1n0-text-1)', letterSpacing: '-1px', margin: '0 0 12px', lineHeight: 1.1 }}>
            {pageTitle}
          </h1>
          <p style={{ fontFamily: F, fontSize: isDesktop ? '16px' : '14px', color: 'var(--b1n0-text-2)', lineHeight: 1.6, margin: 0 }}>
            {intro}
          </p>
          {lastUpdated && (
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '12px' }}>
              Última actualización: {lastUpdated}
            </p>
          )}
        </header>

        {isDesktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '48px' }}>
            <TableOfContents sections={sections} active={activeId} />
            <main style={{ maxWidth: '720px' }}>
              {sections.map((s, idx) => (
                <section key={s.id} id={s.id} style={{ marginBottom: '48px', scrollMarginTop: '24px' }}>
                  <SectionHeader eyebrow={s.eyebrow} title={s.title} />
                  {s.children}
                  {idx < sections.length - 1 && (
                    <hr style={{ border: 'none', borderTop: '1px solid var(--b1n0-border)', marginTop: '40px' }} />
                  )}
                </section>
              ))}
            </main>
          </div>
        ) : (
          <div>
            {sections.map((s, i) => (
              <AccordionSection key={s.id} section={s} openByDefault={i === 0} />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

// ── Block helpers — keep typography in lockstep with /documentacion

export function DocParagraph({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: F, fontSize: '15px', lineHeight: 1.65, color: 'var(--b1n0-text-2)', marginBottom: '14px' }}>
      {children}
    </p>
  )
}

export function DocBullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 14px' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '6px 0', fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-2)' }}>
          <span style={{ color: 'var(--b1n0-si)', marginTop: '7px', flexShrink: 0, fontSize: '8px' }}>●</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export function DocCallout({
  title,
  children,
  tone = 'info',
}: {
  title?: string
  children: React.ReactNode
  tone?: 'info' | 'positive' | 'warn'
}) {
  const accent = tone === 'positive' ? 'var(--b1n0-si)' : tone === 'warn' ? 'var(--b1n0-no)' : 'var(--b1n0-si)'
  const bg = tone === 'positive' ? 'var(--b1n0-si-bg)' : tone === 'warn' ? 'var(--b1n0-no-bg)' : 'var(--b1n0-si-bg)'
  return (
    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${accent}`, background: bg, margin: '8px 0 18px' }}>
      {title && (
        <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
          {title}
        </p>
      )}
      <div style={{ fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-1)' }}>{children}</div>
    </div>
  )
}
