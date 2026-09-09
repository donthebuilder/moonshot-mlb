'use client'

// ── #76 · THE PART THAT MADE THE REST OF IT DEAD CODE ───────────────────────
//
// FRANCHISE's light palette selects on html[data-theme='light']. That attribute
// is stamped by applyTheme() in lib/theme.js — which is called from
// SportRoot, and SportRoot only mounts on /app. FRANCHISE is a separate route
// tree with its own layout, so a full navigation to /fantasy lands on a
// document where nothing has ever set data-theme.
//
// So every light rule I wrote for FRANCHISE would have matched nothing, on
// every page, forever. The stylesheet would have been correct and the product
// would have been unchanged, which is the worst kind of wrong: a fix that
// tests green and does nothing. It was caught by loading the page in a real
// browser and reading back document.documentElement.dataset.theme — not by
// reading the code, where it is invisible.
//
// This is deliberately the SMALLEST thing that closes it. It sets the
// attribute and nothing else: it does not call applyTheme, because that also
// mutates the shared C object and publishes --dash-* custom properties for
// MOONSHOT's chrome, none of which FRANCHISE uses. FRANCHISE reads its own
// --fx-* tokens; all it has ever needed is to be told which theme is on.
//
// Read in an effect, never during render. localStorage does not exist on the
// server, and an attribute that disagrees between the server HTML and the
// first client render is a hydration error — on every Franchise page at once.
// The cost is one frame of the default palette before a non-default one swaps
// in, which is the same trade lib/theme.js already documents and explains at
// length.

import { useEffect } from 'react'

const KEY = 'moonshot_theme_v1'
const KNOWN = ['ember', 'light', 'mono', 'steel', 'regal']

export default function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      try {
        const q = new URLSearchParams(window.location.search).get('theme')
        const saved = (q && KNOWN.includes(q)) ? q : localStorage.getItem(KEY)
        const key = KNOWN.includes(saved) ? saved : 'ember'
        document.documentElement.dataset.theme = key
      } catch {
        // Private mode, or a browser refusing storage. The default palette is
        // already on the page, so doing nothing is the correct fallback.
      }
    }
    apply()
    // The toggle lives on MOONSHOT, so a change usually arrives from another
    // tab. Same-tab changes are covered because FRANCHISE navigations are full
    // page loads, which re-run this effect.
    const onStorage = (e) => { if (!e.key || e.key === KEY) apply() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return null
}
