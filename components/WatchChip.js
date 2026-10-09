'use client'
// THE WATCHLIST CHIP (2026-10-07, Donovan: the Watchlist was buried): one small pill, "Watchlist", beside the
// Ledger chip in the Filters row of every Rankings page (components/FiltersDrawer.js, with `ledger`), so the
// list is one tap from the page people live on, without adding a row. A real link (an address), so a
// long-press or a copied link opens the same page; 44px target pulled back with a negative margin so the row
// keeps its height. Sits right after LedgerChip and wears the same type. The sport's own watchlist tab comes
// from the registry (WATCH_TAB, lib/routes.js).
import { useSportTheme } from './SportTheme'
import { isHiddenSport, watchHash } from '../lib/routes'

export default function WatchChip({ sport, style = null }) {
  const { C, NUM_FONT } = useSportTheme()
  if (isHiddenSport(sport)) return null   // BUCKETS has no public surface until it opens
  return (
    <a href={watchHash(sport)} aria-label="Your watchlist" title="Your watchlist: the players you starred"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto', minHeight: 44, margin: '-7px 0', padding: '0 4px',
        color: C.text2, font: `800 11.5px/1 ${NUM_FONT}`, textDecoration: 'none', whiteSpace: 'nowrap', ...(style || {}),
      }}>
      <span aria-hidden="true">{'⭐'}</span>
      <span style={{ textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: C.border2 }}>Watchlist</span>
    </a>
  )
}
