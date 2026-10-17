'use client'
import { useLayoutEffect, useState } from 'react'
import { C } from '../lib/theme'

// ❓ WHAT AM I LOOKING AT — the answer to the most common piece of feedback
// the site gets: "looks nice, but I don't know what I'm looking at."
//
// One short plain-language paragraph per tab, written for someone who has
// never seen the site: what this page IS, what the main number MEANS, and
// the one thing to actually do here. Auto-open the first time you visit each
// tab, then collapses to a small pill forever (localStorage). One voice,
// beginner-first — the dense stuff stays untouched underneath.

const TEXTS = {
  // MOONSHOT mounts the explainer on Home only (Dashboard.js); every other MLB
  // tab explains itself in its own header. NHL / NBA bring their own maps.
  home: {
    // 2026-09-26 (stranger test F12): says what MOONSHOT does, then what this page holds.
    what: 'Every hitter rated before first pitch. Calls are graded in public.',
  },
}

// 2026-09-05: generalised for TUDDY -- pass `texts` (its own map), a
// `storageKey` (the two products share tab names, so 'home' seen on one must
// not silence the other) and an `accent`.
export default function TabExplainer({ tab, texts = TEXTS, storageKey = 'tab_explained', accent = C.orange }) {
  const info = texts[tab === 'due' ? 'longest' : tab === 'hitshrr' ? 'board' : tab]
  const [open, setOpen] = useState(false)

  // useLayoutEffect, not useEffect: the first-visit box is decided before the
  // first paint, so it never paints as the small pill and then grows by ~80px
  // (LAMP / MOONSHOT layout shift, 2026-10-06).
  useLayoutEffect(() => {
    if (!info) return
    // ONCE PER VISITOR, PER PRODUCT (2026-10-07 text sweep, audit X4): the box opens on the first tab a
    // visitor ever lands on under this storageKey, and every other tab (and every visit after) is the
    // small pill. It used to open once per TAB, so a new visitor met a 120-160px banner on every page.
    try {
      const seen = JSON.parse(localStorage.getItem(storageKey) || '{}')
      const first = Object.keys(seen).length === 0
      setOpen(first)
      if (!seen[tab]) {
        seen[tab] = 1
        localStorage.setItem(storageKey, JSON.stringify(seen))
      }
    } catch { setOpen(false) }
  }, [tab])

  if (!info) return null

  if (!open) {
    return (
      <button className="tab-explainer tap-box" onClick={() => setOpen(true)} style={{
        fontSize: 12, fontWeight: 700, color: C.text3, cursor: 'pointer',
        background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 999,
        padding: '2px 10px', marginBottom: 8,
      }}>❓ what am I looking at</button>
    )
  }
  return (
    // .tab-explainer is what Quiet mode hides — see lib/quiet.js. The pill
    // above wears it too, so quiet means gone rather than collapsed to a
    // control you now have to ignore instead of read.
    <div className="tab-explainer" style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${accent}0a)`,
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '9px 13px', marginBottom: 12,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>❓</span>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, minWidth: 0 }}>{info.what}</div>
      {/* 33px to a thumb, same spot to the eye (mobile pass C): padding out,
          margins back in; .tap-box (app/globals.css) makes the touch target 44px tall, 2026-10-15. */}
      <button type="button" className="tap-box" aria-label="Dismiss" onClick={() => setOpen(false)} style={{
        background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
        fontSize: 13, lineHeight: 1, flexShrink: 0, padding: '10px 9px', margin: '-10px -9px', minHeight: 0,
      }}>✕</button>
    </div>
  )
}
