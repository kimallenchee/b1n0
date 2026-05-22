/**
 * ShareButton — universal share affordance for events, profiles,
 * win moments, and post-vote celebrations.
 *
 * Behavior priority:
 *   1. On mobile (or any browser exposing navigator.share), open the
 *      native share sheet. This gives the user WhatsApp / X / IG DM /
 *      AirDrop / Telegram / SMS for free without us listing them.
 *   2. On desktop (no navigator.share), open a small in-app modal with
 *      explicit options: Copy link, WhatsApp, X, Facebook, Email.
 *
 * Props:
 *   url      — absolute URL to share. Required.
 *   title    — title used by navigator.share (and as the OG fallback
 *              text in the prefill). Required.
 *   text     — pre-fill message for share targets. Optional.
 *   variant  — 'icon' (just the icon, for nav rows), 'pill' (icon +
 *              label, for primary share buttons), 'compact' (just the
 *              ShareNetwork icon with no border, for inline use).
 *   size     — pixel size of the icon. Default 16.
 *   label    — override the button label (defaults to t('common.share')).
 *
 * Why we don't use a single share-intent URL across all networks:
 *   Each network's share URL grammar is different. Centralizing them
 *   here means callers don't need to know about wa.me vs twitter
 *   intent vs facebook sharer.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShareNetwork,
  XLogo,
  FacebookLogo,
  WhatsappLogo,
  EnvelopeSimple,
  Link as LinkIcon,
  Check,
  X as XIcon,
} from '@phosphor-icons/react'

interface ShareButtonProps {
  url: string
  title: string
  text?: string
  variant?: 'icon' | 'pill' | 'compact'
  size?: number
  label?: string
}

export function ShareButton({
  url,
  title,
  text,
  variant = 'pill',
  size = 16,
  label,
}: ShareButtonProps) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)
  const buttonLabel = label ?? t('common.share')

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()

    // Native share sheet wherever it's exposed. iOS Safari, Chrome
    // Android, and increasingly desktop Chrome on https origins. We
    // pass title + text + url; the platform decides what to show.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: text || title, url })
        return
      } catch (err) {
        // User cancelled (AbortError) or share failed — fall through
        // to the modal as a graceful fallback. Don't surface the
        // error; navigator.share UX already handles its own messaging.
        const name = (err as { name?: string })?.name
        if (name === 'AbortError') return
      }
    }

    // Desktop fallback: open our own modal.
    setModalOpen(true)
  }

  return (
    <>
      <ShareTrigger variant={variant} size={size} label={buttonLabel} onClick={handleClick} />
      {modalOpen && (
        <ShareModal
          url={url}
          title={title}
          text={text || title}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ── The clickable trigger — three visual variants ────────────
function ShareTrigger({
  variant,
  size,
  label,
  onClick,
}: {
  variant: 'icon' | 'pill' | 'compact'
  size: number
  label: string
  onClick: (e: React.MouseEvent) => void
}) {
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          color: 'var(--b1n0-muted)',
          padding: 8,
          borderRadius: 999,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
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
        <ShareNetwork size={size} weight="regular" />
      </button>
    )
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          color: 'var(--b1n0-muted)',
          padding: 4,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-body)',
          fontSize: 13,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--b1n0-text-1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--b1n0-muted)' }}
      >
        <ShareNetwork size={size} weight="regular" />
      </button>
    )
  }

  // pill (default)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        appearance: 'none',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        color: 'var(--b1n0-text-1)',
        padding: '8px 14px',
        borderRadius: 999,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 600,
        transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--b1n0-surface)'
        e.currentTarget.style.borderColor = 'var(--b1n0-si)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--b1n0-card)'
        e.currentTarget.style.borderColor = 'var(--b1n0-border)'
      }}
    >
      <ShareNetwork size={size} weight="regular" />
      <span>{label}</span>
    </button>
  )
}

// ── Desktop fallback modal ───────────────────────────────────
function ShareModal({
  url,
  title,
  text,
  onClose,
}: {
  url: string
  title: string
  text: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // ESC closes, click-outside closes. Focus trap stays light — this is
  // a 5-option leaf modal, not a form, so trapping focus rigorously
  // adds complexity without much accessibility win.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)
  const shareTargets = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    x: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}%20${encodedUrl}`,
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access blocked (rare in https context). Fallback:
      // select the URL in a temp textarea and execCommand. Skip the
      // fallback complexity unless this surfaces in user reports.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('share.title')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 16,
          padding: 'var(--space-6)',
          width: '100%',
          maxWidth: 380,
          fontFamily: 'var(--font-body)',
          color: 'var(--b1n0-text-1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('share.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              color: 'var(--b1n0-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <XIcon size={18} weight="regular" />
          </button>
        </div>

        {/* Share targets — grid of 4 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 'var(--space-4)',
          }}
        >
          <ShareTarget
            href={shareTargets.whatsapp}
            label={t('share.whatsapp')}
            color="#25D366"
            icon={<WhatsappLogo size={22} weight="regular" />}
          />
          <ShareTarget
            href={shareTargets.x}
            label={t('share.x')}
            color="var(--b1n0-text-1)"
            icon={<XLogo size={22} weight="regular" />}
          />
          <ShareTarget
            href={shareTargets.facebook}
            label={t('share.facebook')}
            color="#1877F2"
            icon={<FacebookLogo size={22} weight="regular" />}
          />
          <ShareTarget
            href={shareTargets.email}
            label={t('share.email')}
            color="var(--b1n0-muted)"
            icon={<EnvelopeSimple size={22} weight="regular" />}
          />
        </div>

        {/* Copy link row */}
        <button
          type="button"
          onClick={handleCopy}
          style={{
            width: '100%',
            appearance: 'none',
            background: 'var(--b1n0-surface)',
            border: '1px solid var(--b1n0-border)',
            color: 'var(--b1n0-text-1)',
            padding: '12px 14px',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--b1n0-muted)',
            }}
          >
            <LinkIcon size={16} weight="regular" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</span>
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: copied ? 'var(--b1n0-si)' : 'var(--b1n0-text-1)',
              fontWeight: 600,
              marginLeft: 12,
              flexShrink: 0,
            }}
          >
            {copied ? <Check size={14} weight="bold" /> : null}
            {copied ? t('share.linkCopied') : t('share.copyLink')}
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Individual share-target tile ─────────────────────────────
function ShareTarget({
  href,
  label,
  color,
  icon,
}: {
  href: string
  label: string
  color: string
  icon: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '14px 8px',
        borderRadius: 12,
        background: 'var(--b1n0-surface)',
        border: '1px solid var(--b1n0-border)',
        textDecoration: 'none',
        color,
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        transition: 'transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.borderColor = 'var(--b1n0-si)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--b1n0-border)'
      }}
    >
      {icon}
      <span style={{ color: 'var(--b1n0-text-1)' }}>{label}</span>
    </a>
  )
}
