/**
 * Google Translate Element wrapper — cookie-driven.
 *
 * The widget script + init are loaded eagerly from index.html's <head>.
 * That's a deliberate choice: Google's auto-translate-from-cookie path
 * runs during widget construction, and constructing the widget late
 * (e.g. from a React effect) gets you a script that finishes after
 * the body has already rendered — too late for in-place translation.
 *
 * This file only knows about the *cookie*. Reading it tells you whether
 * the current page should be translated; writing it + reloading flips
 * the page into / out of EN. The widget itself does the actual work
 * during the next load.
 *
 * Override map: Google's neural translate will sometimes produce
 * gambling-house English ("bet", "wager", "odds") for our Spanish
 * vocab. That contradicts b1n0's positioning, so a MutationObserver
 * scrubs problematic phrases AFTER Google translates. The list is
 * intentionally small — add patterns as new offenders show up.
 */

type Lang = 'es' | 'en'

let overrideObserver: MutationObserver | null = null

// Vocab overrides — applied AFTER Google translates. Keep this map small
// and high-impact. Match on word boundaries so we don't break unrelated
// substrings.
const VOCAB_OVERRIDES: Array<[RegExp, string]> = [
  // The big offenders — gambling vocab → b1n0 vocab
  [/\bplace (?:a |your |the )?bet(?:s)?\b/gi, 'cast a vote'],
  [/\bplaced (?:a |your |the )?bet(?:s)?\b/gi, 'cast a vote'],
  [/\bplaces (?:a |your |the )?bet(?:s)?\b/gi, 'casts a vote'],
  [/\bplacing (?:a |your |the )?bet(?:s)?\b/gi, 'casting a vote'],
  [/\bmake (?:a |your )?bet\b/gi, 'cast a vote'],
  [/\bbet(?:s)?\b(?! against)/gi, 'vote'], // "bet" alone → "vote", but leave "bet against"
  [/\bwager(?:s|ed|ing)?\b/gi, 'vote'],
  [/\bgambl(?:e|ed|ing|er|ers)\b/gi, 'predict'],
  [/\bodds\b/gi, 'split'],
  [/\bpayout(?:s)?\b/gi, 'payout'], // keep (Robinhood-style, OK)
  [/\bwinnings\b/gi, 'payout'],
  // Specific b1n0 brand phrases that Google butchers
  [/\bevent options market\b/gi, 'event-options market'],
  // "You won" pattern in celebrations — keep but soften
  [/\byou won!?\b/gi, 'You called it!'],
  [/\byou lost\b/gi, 'Not this time'],
  [/\bloser(?:s)?\b/gi, 'on the other side'],
  [/\blost the bet\b/gi, 'missed this one'],
]

/**
 * Set the user-facing translation language.
 *
 * EN: write `googtrans=/es/en`, reload. On next page load Google's
 *     widget (loaded in index.html <head>) reads the cookie and
 *     translates the body in place.
 *
 * ES: clear the cookie, reload. The widget runs but does nothing.
 */
export function setTranslation(lang: Lang): Promise<void> {
  const desired = lang === 'en' ? '/es/en' : null
  const current = readGoogtransCookie()
  if (desired === current) {
    if (lang === 'en') installOverrideObserver()
    return Promise.resolve()
  }
  if (lang === 'en') {
    writeGoogtransCookie('/es/en')
  } else {
    clearGoogtransCookie()
  }
  // Small delay so the cookie write reliably hits document.cookie
  // before the reload reads it back on the next request.
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      window.location.replace(window.location.pathname + window.location.search)
      resolve()
    }, 80)
  })
}

/**
 * Boot-time hook. Called from Footer on mount. If the cookie says the
 * session is translated, install the override observer so we catch any
 * dynamically-loaded content (comments, async-loaded event cards) that
 * arrives after the initial Google translate pass.
 */
export function bootIfTranslatedSession(): Promise<void> {
  const cookie = readGoogtransCookie()
  if (cookie && cookie !== '/es/es') {
    installOverrideObserver()
  }
  return Promise.resolve()
}

function readGoogtransCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}

function writeGoogtransCookie(value: string) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `googtrans=${value}; expires=${expires}; path=/`
  if (typeof window !== 'undefined' && window.location.hostname.includes('b1n0.com')) {
    document.cookie = `googtrans=${value}; expires=${expires}; path=/; domain=.b1n0.com`
  }
}

function clearGoogtransCookie() {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT'
  document.cookie = `googtrans=; expires=${past}; path=/`
  if (typeof window !== 'undefined' && window.location.hostname.includes('b1n0.com')) {
    document.cookie = `googtrans=; expires=${past}; path=/; domain=.b1n0.com`
  }
}

/**
 * Watch for translated content getting injected (Google does it async
 * during initial translation, and new comments / event cards arrive
 * after page load) and re-run the vocab override pass on each batch.
 */
function installOverrideObserver() {
  if (overrideObserver) return
  // Initial pass on the current DOM.
  applyVocabOverrides(document.body)

  overrideObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of Array.from(m.addedNodes)) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          applyVocabOverrides(n as Element)
        } else if (n.nodeType === Node.TEXT_NODE && n.parentElement) {
          applyVocabOverridesToTextNode(n as Text)
        }
      }
      if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
        applyVocabOverridesToTextNode(m.target as Text)
      }
    }
  })
  overrideObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function applyVocabOverrides(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const targets: Text[] = []
  let node = walker.nextNode()
  while (node) {
    targets.push(node as Text)
    node = walker.nextNode()
  }
  for (const t of targets) applyVocabOverridesToTextNode(t)
}

function applyVocabOverridesToTextNode(node: Text) {
  const original = node.nodeValue
  if (!original) return
  const parent = node.parentElement
  if (!parent) return
  const tag = parent.tagName
  if (tag === 'SCRIPT' || tag === 'STYLE' || parent.closest('#google_translate_element')) return
  let next = original
  for (const [pattern, replacement] of VOCAB_OVERRIDES) {
    next = next.replace(pattern, replacement)
  }
  if (next !== original) {
    node.nodeValue = next
  }
}
