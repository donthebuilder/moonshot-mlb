'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { nflDepth } from '../../lib/writeups/nfl'

// THE FULL WRITE-UP, FOOTBALL DEPTH (2026-10-07). The sections come from
// lib/writeups/nfl.js (every sentence a field we hold, none random), drawn
// here as plain lists. Behind its own toggle on the card; on the game page the
// toggle is the write-up's own, so `sections` arrive already built (open).
export function DepthSections({ sections }) {
  if (!sections?.length) return null
  return (
    <div>
      {sections.map((s) => (
        <div key={s.key} style={{ marginTop: 8 }}>
          <div style={{ font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2, margin: '8px 0 4px' }}>{s.title}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
            {s.lines.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function DepthWriteup({ player, matchup, slateSeason = null }) {
  const [open, setOpen] = useState(false)
  const sections = nflDepth(player, matchup, slateSeason)
  if (!sections.length) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.green, font: `800 13px/1 ${NUM_FONT}`, letterSpacing: '.04em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
      {open && <DepthSections sections={sections} />}
    </div>
  )
}
