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
export function usePreview(items = [], n = 5) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, n)
  const restN = Math.max(0, items.length - shown.length)
  const toggle = () => setOpen((v) => !v)
  return { shown, open, restN, toggle }
}

export function ShowMoreButton({ open, restN, toggle, itemWord = '' }) {
  if (restN <= 0 && !open) return null
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      style={{
        width: '100%', marginTop: 6, padding: '6px 9px',
        background: 'transparent', border: `1px solid ${C.border}`,
        borderRadius: 8, cursor: 'pointer',
        fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
        color: C.text3, letterSpacing: '.04em',
      }}
    >
      {open ? 'Show less' : `Show ${restN} more${itemWord ? ` ${itemWord}` : ''}`}
    </button>
  )
}
