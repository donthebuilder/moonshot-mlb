'use client'
import { useEffect } from 'react'

// THE TAB TITLE THAT STAYS SET (2026-09-26, Batch 6).
//
// Each dashboard names its page in the browser tab (pageTitle, lib/routes.js).
// On a cold open Next writes the route's static <title> (app/app/page.js)
// AFTER the dashboard's first effect, so the tab read "The board — MOONSHOT &
// TUDDY" on every MOONSHOT tab and TUDDY's Home (stranger test F16). LAMP had
// patched it with a second write 600ms later -- a guess at a race. This
// watches <title> instead: whenever anything rewrites it, the page's own title
// goes back, exactly, for as long as the page is mounted.
export function usePageTitle(title) {
  useEffect(() => {
    if (!title) return undefined
    const apply = () => { if (document.title !== title) document.title = title }
    apply()
    let obs = null
    try {
      obs = new MutationObserver(apply)
      obs.observe(document.head, { childList: true, subtree: true, characterData: true })
    } catch { /* no observer: the first write still stands */ }
    return () => { if (obs) obs.disconnect() }
  }, [title])
}
