import { useEffect } from 'react'

/**
 * usePageMeta — sets <title>, <meta name="description">, and the
 * og:title / og:description / og:url / twitter:title / twitter:description
 * tags on mount. Restores them to the previous values on unmount.
 *
 * b1n0 is a single-page React app, so a static <title> in index.html
 * means every route shows the same string in the browser tab and
 * (more importantly) Google Search results. Calling this hook once
 * at the top of each page component fixes both.
 *
 * Usage:
 *   export function Inicio() {
 *     usePageMeta({
 *       title: 'Inicio · b1n0',
 *       description: 'Las preguntas del momento — fútbol, política, economía.',
 *       path: '/inicio',
 *     })
 *     return …
 *   }
 *
 * The hook updates DOM directly rather than through React state — meta
 * tags live outside the component tree, and there's no benefit to a
 * portal or context for this.
 */
export interface PageMeta {
  /** What appears in the browser tab and Google search result. */
  title: string
  /** What appears under the title in search results and link previews. */
  description?: string
  /**
   * Optional URL for the page's social preview image (og:image,
   * twitter:image). When omitted, the global default is used. For
   * event pages, pass the dynamic /api/og?event=<id> endpoint so
   * shares show the event's question + current SÍ/NO split.
   */
  ogImage?: string
  /**
   * Canonical pathname (without origin) for this page, e.g. '/terminos'.
   * Used to set og:url so each route has a distinct social preview URL —
   * otherwise WhatsApp/Twitter show identical previews for every route.
   */
  path?: string
}

const ORIGIN = 'https://www.b1n0.com'
const DEFAULT_TITLE = 'b1n0'
const DEFAULT_DESCRIPTION =
  'b1n0 — Mercado de contratos de evento sobre el mundo real. Tomá tu posición SÍ o NO en fútbol, política, economía y cultura. Cobro fijo respaldado por LPs.'
const DEFAULT_OG_IMAGE = '/og-image.png'
const DEFAULT_OG_URL = ORIGIN

function setMetaContent(selector: string, content: string) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', content)
}

export function usePageMeta({ title, description, ogImage, path }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const desc = description ?? DEFAULT_DESCRIPTION
    const img = ogImage ?? DEFAULT_OG_IMAGE
    const url = path ? `${ORIGIN}${path}` : DEFAULT_OG_URL

    setMetaContent('meta[name="description"]', desc)
    setMetaContent('meta[property="og:title"]', title)
    setMetaContent('meta[property="og:description"]', desc)
    setMetaContent('meta[property="og:image"]', img)
    setMetaContent('meta[property="og:url"]', url)
    setMetaContent('meta[name="twitter:title"]', title)
    setMetaContent('meta[name="twitter:description"]', desc)
    setMetaContent('meta[name="twitter:image"]', img)

    return () => {
      document.title = previousTitle || DEFAULT_TITLE
      setMetaContent('meta[name="description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[property="og:title"]', DEFAULT_TITLE)
      setMetaContent('meta[property="og:description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[property="og:image"]', DEFAULT_OG_IMAGE)
      setMetaContent('meta[property="og:url"]', DEFAULT_OG_URL)
      setMetaContent('meta[name="twitter:title"]', DEFAULT_TITLE)
      setMetaContent('meta[name="twitter:description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[name="twitter:image"]', DEFAULT_OG_IMAGE)
    }
  }, [title, description, ogImage, path])
}
