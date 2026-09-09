'use client'
// Which heat mode the table renders in.
//
// Read from the URL during the redesign so the four options can be compared
// on the same real board instead of described in prose — ?heat=standouts.
// When one is chosen this becomes a stored setting alongside the palette,
// which is where a view preference belongs.
import { HEAT_MODES } from '../components/DenseTable'

// ── THE DEFAULT IS 'sorted' NOW (2026-08-22) ───────────────────────────────
// This was written with fallback 'full' while the four modes were being
// compared on a real board. That comparison is over: Donovan chose colour-
// follows-the-sort for every board, so the default moves and ?heat= keeps
// working for anyone who wants to put a full heatmap back on one page.
export function heatModeFromUrl(fallback = 'sorted') {
  if (typeof window === 'undefined') return fallback
  try {
    const q = new URLSearchParams(window.location.search).get('heat')
    if (q && HEAT_MODES.includes(q)) return q
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('heat')
    if (h && HEAT_MODES.includes(h)) return h
  } catch { /* ignore */ }
  return fallback
}


// Whether role badges show their tier glyph. ONE glyph per tier, always the
// same one — the version worth comparing is 'curated', not the old free-for-all
// where a card could stack a role emoji, an HRW-zone emoji, a lock and a target.
export function glyphModeFromUrl(fallback = 'off') {
  if (typeof window === 'undefined') return fallback
  try {
    const q = new URLSearchParams(window.location.search).get('glyph')
    if (q === 'on' || q === 'off') return q
  } catch { /* ignore */ }
  return fallback
}

