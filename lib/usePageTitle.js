'use client'
import { useEffect } from 'react'
import { resolveTab } from './routes'

// THE TAB TITLE THAT STAYS SET (2026-09-26, Batch 6).
//
// Each dashboard names its page in the browser tab (pageTitle, lib/routes.js).
// On a cold open Next writes the route's static <title> (app/app/page.js)
// AFTER the dashboard's first effect, so the tab read "The board — MOONSHOT &
// TUDDY" on every MOONSHOT tab and TUDDY's Home (stranger test F16). LAMP had
// patched it with a second write 600ms later -- a guess at a race. This
// watches <title> instead: whenever anything rewrites it, the page's own title
// goes back, exactly, for as long as the page is mounted.
// `sport`: the product this title belongs to. It holds only while the address names that product -- a product being left
// used to put its own title back over the next product's for ~330 ms (2026-10-21).
export function usePageTitle(title, sport = null) {
  useEffect(() => {
    if (!title) return undefined
    const mine = () => { if (!sport) return true; try { const s = new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('sport'); return !s || s === sport } catch { return true } }
    const apply = () => { if (mine() && document.title !== title) document.title = title }
    apply()
    let obs = null
    try {
      obs = new MutationObserver(apply)
      obs.observe(document.head, { childList: true, subtree: true, characterData: true })
    } catch { /* no observer: the first write still stands */ }
    return () => { if (obs) obs.disconnect() }
  }, [title, sport])
}

/** The tab the ADDRESS names for this product (an alias resolved), for the title a shell holds before it has routed
 *  (2026-10-21): Home's title for a frame on every deep link was the flash. Client only; 'home' on the server. */
export function addressTab(sport) {
  if (typeof window === 'undefined') return 'home'
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    if (h.get('sport') !== sport) return 'home'
    const r = resolveTab(sport, h.get('tab'))
    return r.status === 'ok' || r.status === 'alias' ? r.tab : 'home'
  } catch { return 'home' }
}
