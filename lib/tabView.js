'use client'
// WHICH TABS ARE USED (BATCH-ONE-SITE step 4, 2026-10-05). The app's tabs live in the
// hash (#sport=mlb&tab=props), which Vercel Web Analytics never sees -- every tab counts
// as one "/app". Step 4 has to pick the bottom-bar tab Slate replaces "from the
// analytics, never a guess", so each shell reports the tab it settles on as its own page
// view: /app/<sport>/<tab>. The load's own "/app" view is left as it was. A tab passed
// through on the way (the shell starts on home, then reads the hash) isn't counted: the
// view is sent once the tab has held for a second.
import { useEffect } from 'react'
import { pageview } from '@vercel/analytics'

export function useTabView(sport, tab) {
  useEffect(() => {
    if (!sport || !tab || typeof window === 'undefined') return undefined
    const t = setTimeout(() => {
      try { pageview({ route: '/app/[sport]/[tab]', path: `/app/${sport}/${tab}` }) } catch { /* analytics off or blocked: nothing to count */ }
    }, 1000)
    return () => clearTimeout(t)
  }, [sport, tab])
}
