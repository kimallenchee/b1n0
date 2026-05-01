import { useEffect } from 'react'

/**
 * usePageMeta — sets <title>, <meta name="description">, and the
 * og:title / og:description / twitter:title / twitter:description
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
}

const DEFAULT_TITLE = 'b1n0'
const DEFAULT_DESCRIPTION =
  'b1n0 — La plataforma de opinión donde demostrás que sabés más que todos. Hacé tu llamado en fútbol, economía y cultura de Centroamérica.'

function setMetaContent(selector: string, content: string) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', content)
}

export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const desc = description ?? DEFAULT_DESCRIPTION

    setMetaContent('meta[name="description"]', desc)
    setMetaContent('meta[property="og:title"]', title)
    setMetaContent('meta[property="og:description"]', desc)
    setMetaContent('meta[name="twitter:title"]', title)
    setMetaContent('meta[name="twitter:description"]', desc)

    return () => {
      document.title = previousTitle || DEFAULT_TITLE
      // Reset meta tags to defaults so a navigation that doesn't call
      // usePageMeta (e.g. an admin route) doesn't inherit a stale
      // title from the previous page.
      setMetaContent('meta[name="description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[property="og:title"]', DEFAULT_TITLE)
      setMetaContent('meta[property="og:description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[name="twitter:title"]', DEFAULT_TITLE)
      setMetaContent('meta[name="twitter:description"]', DEFAULT_DESCRIPTION)
    }
  }, [title, description])
}
