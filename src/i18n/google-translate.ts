/**
 * Google Translate Element wrapper.
 *
 * Why this exists:
 *   Our own i18n JSON covers the chrome (footer, nav, share modal,
 *   PurchaseCelebration) — the surfaces where the b1n0 anti-gambling
 *   vocab really matters and we want pixel control. For everything else
 *   (event questions, news, comments, deep page bodies) we lean on
 *   Google's Translate Element widget to live-translate the DOM when
 *   the user toggles to English. Zero string extraction needed for
 *   that long tail.
 *
 * Why lazy:
 *   The widget loads ~80 KB of Google script + a cookie. For the 99 %
 *   of Spanish visitors who never touch the toggle, we don't want to
 *   pay that cost on every page load. We boot the widget the first
 *   time the user picks EN, never before.
 *
 * Why the override map:
 *   Google's neural translate will sometimes produce gambling-house
 *   English ("bet", "wager", "odds") for our Spanish vocab. That
 *   directly contradicts b1n0's positioning. We run a small DOM
 *   walker after every translate pass that swaps those phrases for
 *   our preferred English vocabulary. It's whack-a-mole by nature —
 *   add to the map as new offenders surface.
 *
 * Lifecycle:
 *   - First setTranslation('en') call → injects translate.google.com
 *     script tag, instantiates TranslateElement, triggers the hidden
 *     <select> to 'en'.
 *   - Subsequent setTranslation('en') / setTranslation('es') calls →
 *     just toggles the hidden <select>'s value (no extra script loads).
 *   - applyVocabOverrides() runs on a MutationObserver so newly-added
 *     translated content (e.g., comments loaded after page load) also
 *     gets scrubbed.
 */

type Lang = 'es' | 'en'

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement?: new (config: object, elementId: string) => unknown
      }
    }
    googleTranslateElementInit?: () => void
  }
}

let widgetLoaded = false
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
  [/\blost the bet\b/gi, "missed this one"],
]

/**
 * Set the user-facing translation language. First call to 'en' boots
 * the widget; subsequent calls just flip the underlying <select>.
 *
 * Going back to 'es' clears the translation (we set the widget select
 * to its restore value — Google interprets the empty value as "show
 * original").
 */
export function setTranslation(lang: Lang): Promise<void> {
  // ES = original page language → either no-op or restore.
  if (lang === 'es') {
    restoreOriginal()
    return Promise.resolve()
  }

  if (widgetLoaded) {
    flipSelect('en')
    return Promise.resolve()
  }

  return loadWidget()
    .then(() => {
      widgetLoaded = true
      flipSelect('en')
      installOverrideObserver()
    })
    .catch((err) => {
      // Network blocked or widget deprecated server-side. Fail soft:
      // the i18n JSON-translated chrome still works, the body just
      // stays in Spanish. Logged so we notice if Google kills it.
      console.warn('[google-translate] widget failed to load', err)
    })
}

function loadWidget(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Google's loader expects this callback to exist on window before
    // the script runs. The widget calls it once it's ready.
    window.googleTranslateElementInit = () => {
      try {
        if (!window.google?.translate?.TranslateElement) {
          reject(new Error('TranslateElement constructor missing'))
          return
        }
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'es',
            includedLanguages: 'en',
            autoDisplay: false,
            // Layout 0 = no in-page UI; we drive the <select> by hand.
            layout: 0,
          },
          'google_translate_element',
        )
        // Google populates the language <select> asynchronously after
        // construction. Poll for the select to have at least one option
        // before resolving so flipSelect() doesn't run against an empty
        // dropdown. ~5s ceiling — Google is typically ready in <300 ms;
        // beyond that we resolve anyway and let the flip attempt fail
        // silently (the override scrubber can still run on whatever
        // Google does inject).
        const deadline = Date.now() + 5000
        const poll = () => {
          const sel = document.querySelector<HTMLSelectElement>('select.goog-te-combo')
          if (sel && sel.options.length > 0) {
            resolve()
            return
          }
          if (Date.now() > deadline) {
            resolve()
            return
          }
          setTimeout(poll, 80)
        }
        poll()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }

    const script = document.createElement('script')
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    script.async = true
    script.onerror = () => reject(new Error('script load error'))
    document.head.appendChild(script)
  })
}

function flipSelect(value: string) {
  // The injected select carries class `goog-te-combo`. Setting its value
  // and dispatching a change event triggers Google's translation pass.
  const select = document.querySelector<HTMLSelectElement>('select.goog-te-combo')
  if (!select) return
  select.value = value
  select.dispatchEvent(new Event('change'))
}

function restoreOriginal() {
  // Google stores the user's last translation choice in a cookie. If we
  // want the page to stay in ES across reloads, we explicitly clear
  // both the cookie and the in-DOM translation.
  flipSelect('')
  // Clear cookie at apex + subdomain for safety.
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT'
  document.cookie = `googtrans=; expires=${past}; path=/`
  if (typeof window !== 'undefined' && window.location.hostname.includes('b1n0.com')) {
    document.cookie = `googtrans=; expires=${past}; path=/; domain=.b1n0.com`
  }
  if (overrideObserver) {
    overrideObserver.disconnect()
    overrideObserver = null
  }
}

/**
 * Watch for translated content getting injected (Google does it async,
 * and new comments / event cards arrive after page load) and re-run
 * the vocab override pass on each batch.
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
      // Google also mutates existing text nodes in place when it
      // translates — those show up as characterData mutations.
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
  // Skip nodes inside <script>, <style>, or our own translate widget.
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
