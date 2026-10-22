'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// SITE-WIDE LONG-LIST RULE (Phase 1 simplify pass, 2026-09-11 — the TUDDY/
// MOONSHOT upgrade prompt): "Any long list (Top 30 board, alt looks, player
// pools, etc.) previews a short cut (3-5 rows) with a clear 'see all' rather
// than dumping the full list inline — this is a site-wide rule, not
// MLB-only." YourPlayers.js already built exactly this (COLLAPSED_N + a
// "Show N more" toggle) for the watchlist; this lifts that same mechanism
// and look out to a shared place so the next wall-of-N reuses it instead of
// growing its own slightly-different cap, which is its own kind of clutter.
//
// ONE SHOW-MORE RULE (Donovan 10-18: "show eight more out of the 28 -- just show all or don't show
// that at all ... show like four or three if you're gonna have a show more"): a list previews 4,
// then ONE tap shows all of it. The button says the whole count ("All 28"), never "Show 8 more".
export const PREVIEW_ROWS = 4
export function usePreview(items = [], n = PREVIEW_ROWS) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, n)
  const restN = Math.max(0, items.length - shown.length)
  const toggle = () => setOpen((v) => !v)
  return { shown, open, restN, toggle, total: items.length }
}

export function ShowMoreButton({ open, restN, toggle, itemWord = '', total = null }) {
  if (restN <= 0 && !open) return null
  return (
    <button
      type="button"
      className="tap-box show-more"
      onClick={toggle}
      aria-expanded={open}
      // a small pill (10-18: "the little buttons are way too big ... they take up a hell of a page"); the tap area is .tap-box's 44px ::after
      style={{
        display: 'inline-block', width: 'auto', marginTop: 6, padding: '5px 12px',
        background: 'transparent', border: `1px solid ${C.border}`,
        borderRadius: 3, cursor: 'pointer',   // flat square chip (2026-10-21, chips batch); .tap-box keeps the 44px target
        fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
        color: C.text3, letterSpacing: '.04em',
      }}
    >
      {open ? 'Fewer' : total ? `All ${total}${itemWord ? ` ${itemWord}` : ''}` : `+${restN} more${itemWord ? ` ${itemWord}` : ''}`}
    </button>
  )
}
