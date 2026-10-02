'use client'
import { useState } from 'react'

// ONE LEDGER SECTION, ALL THREE PRODUCTS (2026-09-27, ledger plan step 1).
// The shell every ledger section draws in: a title, one line on what it is,
// the first five rows and "show all" (no long scroll on a phone), and -- when
// there is nothing -- a sentence saying why, never an empty box. Each product
// passes its own theme (C), number font and accent.
export default function LedgerSection({ C, numFont, accent, title, blurb, rows = [], render, empty, footer = null, preview = 5 }) {
  const [open, setOpen] = useState(false)
  const shown = open ? rows : rows.slice(0, preview)
  return (
    <section aria-label={title} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ color: accent, fontFamily: numFont, fontSize: 11, letterSpacing: '.1em' }}>{title}</b>
        {blurb ? <span style={{ color: C.text3, fontSize: 11 }}>{blurb}</span> : null}
        {rows.length ? <span style={{ marginLeft: 'auto', color: C.text3, fontFamily: numFont, fontSize: 10 }}>{rows.length}</span> : null}
      </div>
      {rows.length
        ? <div style={{ display: 'flex', flexDirection: 'column' }}>{shown.map((r, i) => <div key={r.key ?? i} style={{ borderTop: i ? `1px solid ${C.border}` : 'none' }}>{render(r, i)}</div>)}</div>
        : <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{empty}</div>}
      {rows.length > preview && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ marginTop: 6, minHeight: 44, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: accent, font: `800 11px/1 ${numFont}`, cursor: 'pointer' }}>
          {open ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
      {footer}
    </section>
  )
}
