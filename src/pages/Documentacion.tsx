/**
 * /documentacion — public documentation page.
 *
 * Renders the content tree from src/content/documentation.ts.
 * Layout: sticky TOC on desktop (left), accordion on mobile.
 * All copy lives in the content file; this component only renders blocks.
 *
 * Sections are deep-linkable via URL hash: /documentacion#comisiones.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CaretDown } from '@phosphor-icons/react'
import { DOC_SECTIONS, DOC_LAST_UPDATED, type DocSection, type DocBlock } from '../content/documentation'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePageMeta } from '../hooks/usePageMeta'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

// ── Block renderer ───────────────────────────────────────────────────
function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p style={{ fontFamily: F, fontSize: '15px', lineHeight: 1.65, color: 'var(--b1n0-text-2)', marginBottom: '14px' }}>
          {block.text}
        </p>
      )

    case 'bullets':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 14px' }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '6px 0', fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-2)' }}>
              <span style={{ color: 'var(--b1n0-si)', marginTop: '7px', flexShrink: 0, fontSize: '8px' }}>●</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )

    case 'callout': {
      const tone = block.tone ?? 'info'
      const accent = tone === 'positive' ? 'var(--b1n0-si)' : tone === 'warn' ? 'var(--b1n0-no)' : 'var(--b1n0-si)'
      const bg     = tone === 'positive' ? 'var(--b1n0-si-bg)' : tone === 'warn' ? 'var(--b1n0-no-bg)' : 'var(--b1n0-si-bg)'
      return (
        <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${accent}`, background: bg, margin: '8px 0 18px' }}>
          {block.title && (
            <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
              {block.title}
            </p>
          )}
          <p style={{ fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-1)', margin: 0 }}>{block.body}</p>
        </div>
      )
    }

    case 'table':
      return (
        <div style={{ margin: '8px 0 18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--b1n0-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F, fontSize: '13px' }}>
            <thead style={{ background: 'var(--b1n0-card)' }}>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: 'var(--b1n0-text-1)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--b1n0-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '10px 14px', color: ci === 0 ? 'var(--b1n0-text-1)' : 'var(--b1n0-text-2)', fontWeight: ci === 0 ? 600 : 400, borderTop: ri === 0 ? 'none' : '1px solid var(--b1n0-border)', lineHeight: 1.5 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && (
            <p style={{ padding: '10px 14px', fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', borderTop: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)', margin: 0, fontStyle: 'italic' }}>{block.caption}</p>
          )}
        </div>
      )

    case 'glossary':
      return (
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0', margin: '8px 0 18px' }}>
          {block.items.map((it, i) => (
            <div key={i} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--b1n0-border)' }}>
              <dt style={{ fontFamily: D, fontSize: '15px', fontWeight: 700, color: 'var(--b1n0-text-1)', marginBottom: '4px' }}>{it.term}</dt>
              <dd style={{ fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-2)', margin: 0 }}>{it.def}</dd>
            </div>
          ))}
        </dl>
      )

    case 'noEs':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 14px' }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '8px 0', fontFamily: F, fontSize: '14px', lineHeight: 1.6, color: 'var(--b1n0-text-1)', borderBottom: i < block.items.length - 1 ? '1px solid var(--b1n0-border)' : 'none' }}>
              <span style={{ color: 'var(--b1n0-error)', fontWeight: 700, flexShrink: 0, fontSize: '14px' }}>✕</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )

    case 'divider':
      return <hr style={{ border: 'none', borderTop: '1px solid var(--b1n0-border)', margin: '24px 0' }} />

    case 'deepLink':
      return (
        <a
          href={block.href}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: 'var(--radius-md)',
            background: 'var(--b1n0-si)', color: 'var(--b1n0-si-fg)',
            fontFamily: F, fontSize: '13px', fontWeight: 700,
            textDecoration: 'none', margin: '8px 0 18px',
          }}
        >
          {block.label} →
        </a>
      )
  }
}

// ── Section heading + content ─────────────────────────────────────────
function SectionHeader({ section }: { section: DocSection }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.6px', marginBottom: '6px' }}>
        {section.eyebrow}
      </p>
      <h2 style={{ fontFamily: D, fontSize: '26px', fontWeight: 800, color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', margin: 0 }}>
        {section.title}
      </h2>
    </div>
  )
}

// ── Mobile accordion section ──────────────────────────────────────────
function AccordionSection({ section, openByDefault }: { section: DocSection; openByDefault: boolean }) {
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
          {section.blocks.map((b, i) => <Block key={i} block={b} />)}
        </div>
      )}
    </section>
  )
}

// ── Sticky TOC (desktop) ──────────────────────────────────────────────
function TableOfContents({ active }: { active: string }) {
  return (
    <nav style={{ position: 'sticky', top: '24px', alignSelf: 'flex-start' }}>
      <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>
        En esta página
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {DOC_SECTIONS.map((s) => {
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

// ── Page ──────────────────────────────────────────────────────────────
export function Documentacion() {
  usePageMeta({
    title: 'Documentación · b1n0',
    description: 'Cómo funciona b1n0: contratos de eventos, comisiones, LPs, KYC, custodia. Todo lo que necesitás saber.',
  })

  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useIsDesktop()
  const [activeId, setActiveId] = useState<string>(DOC_SECTIONS[0].id)

  // Scroll-spy: update active TOC entry based on which section is in view
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
    DOC_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [isDesktop])

  // Initial hash scroll on mount
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    }
  }, [location.hash])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', color: 'var(--b1n0-text-1)', padding: isDesktop ? '32px 24px 64px' : '20px 16px 64px' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
        {/* Back link */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{ background: 'none', border: 'none', color: 'var(--b1n0-muted)', fontFamily: F, fontSize: '13px', cursor: 'pointer', padding: '8px 0', marginBottom: '20px' }}
        >
          ← Volver
        </button>

        {/* Header */}
        <header style={{ marginBottom: isDesktop ? '40px' : '24px', maxWidth: '720px' }}>
          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.6px', marginBottom: '8px' }}>
            DOCUMENTACIÓN
          </p>
          <h1 style={{ fontFamily: D, fontSize: isDesktop ? '40px' : '28px', fontWeight: 800, color: 'var(--b1n0-text-1)', letterSpacing: '-1px', margin: '0 0 12px', lineHeight: 1.1 }}>
            Cómo funciona b1n0.
          </h1>
          <p style={{ fontFamily: F, fontSize: isDesktop ? '16px' : '14px', color: 'var(--b1n0-text-2)', lineHeight: 1.6, margin: 0 }}>
            Todo lo que necesitás saber sobre llamados, contratos, comisiones, LPs, custodia, resolución y verificación. Sin letra chica.
          </p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '12px' }}>
            Última actualización: {DOC_LAST_UPDATED}
          </p>
        </header>

        {/* Body */}
        {isDesktop ? (
          // Desktop: 2-column layout — sticky TOC + content
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '48px' }}>
            <TableOfContents active={activeId} />
            <main style={{ maxWidth: '720px' }}>
              {DOC_SECTIONS.map((s, idx) => (
                <section key={s.id} id={s.id} style={{ marginBottom: '48px', scrollMarginTop: '24px' }}>
                  <SectionHeader section={s} />
                  {s.blocks.map((b, i) => <Block key={i} block={b} />)}
                  {idx < DOC_SECTIONS.length - 1 && (
                    <hr style={{ border: 'none', borderTop: '1px solid var(--b1n0-border)', marginTop: '40px' }} />
                  )}
                </section>
              ))}
            </main>
          </div>
        ) : (
          // Mobile: accordion
          <div>
            {DOC_SECTIONS.map((s, i) => (
              <AccordionSection key={s.id} section={s} openByDefault={i === 0} />
            ))}
          </div>
        )}

        {/* Footer */}
        <footer style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid var(--b1n0-border)', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', margin: 0 }}>
            Tres33 SAS de CV · Ciudad de Guatemala
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <a href="/terminos" style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}>Términos</a>
            <a href="/privacidad" style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}>Privacidad</a>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default Documentacion
