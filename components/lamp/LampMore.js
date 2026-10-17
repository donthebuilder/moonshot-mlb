'use client'
// MORE ABOUT HIM -- the ONE fold at the end of the card (MOONSHOT's "More" in components/PlayerModal.js, 2026-10-17 trim): the secondary blocks stay
// out of the Overview until it is tapped. Closed by default; a new player opens closed. The header is a 44px row.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'

export default function LampMore({ resetKey, summary, children }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [resetKey])
  return (
    <section aria-label="More about him" style={{ margin: '4px 0' }}>
      <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
        <button type="button" className="tap-box" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 44, padding: '10.5px 12px', cursor: 'pointer', textAlign: 'left', background: open ? 'transparent' : C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.03em' }}>More</span>
          <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.ice, fontFamily: NUM_FONT, fontWeight: 800, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
        </button>
      </h2>
      {open && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </section>
  )
}
