'use client'
// THE DASH LINE ON THE BOARD (2026-10-02, BATCH-DASH-LINE step 4). A TEST:
// our median for the stat beside the book's line, coloured by the lean
// (lib/dashLine.js leanOf). Shown with a TEST tag; nothing is posted or
// called from it until its record exists. PREVIEW until the game locks.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// the board's market words -> the DASH line's markets
export const DASH_OF = { REC_YDS: 'rec_yds', REC: 'rec', RUSH_YDS: 'rush_yds', RUSH_ATT: 'rush_att', PASS_YDS: 'pass_yds', KICK_PTS: 'kick_pts' }
let CACHE = null
export function useDashLines() {
  const [d, setD] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return undefined
    let live = true
    fetch('/api/nfl/dash').then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (b?.available) {
        // one row per player|market: the API now carries each game's own date, so the newest game wins
        const by = new Map()
        for (const r of b.rows || []) { const k = `${r.player_id}|${r.market}`; const cur = by.get(k); if (!cur || String(r.game_date || '') >= String(cur.game_date || '')) by.set(k, r) }
        CACHE = { by }
      } else CACHE = { by: new Map(), off: true }
      if (live) setD(CACHE)
    }).catch(() => {})
    return () => { live = false }
  }, [])
  return d
}
const INK = { over: C.green, under: C.red, none: C.text3 }
export default function DashChip({ row, compact = false }) {
  if (!row) return null
  if (row.dash_line == null) return compact ? null : <span title={row.reason || ''} style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>DASH — {row.reason}</span>
  const word = row.lean === 'over' ? 'OVER' : row.lean === 'under' ? 'UNDER' : 'NO LEAN'
  const tip = `Our median ${row.dash_line.toFixed(1)} vs the book ${row.book_line?.toFixed(1)}: ${word}. ${row.provisional ? 'A preview; it freezes at the lock, about an hour before kickoff' : 'Frozen at the lock beside the book\u2019s line'}${row.reason ? ` -- ${row.reason}` : ''}. A TEST: not a call.`
  // in a table cell: the number and its arrow (the TEST tag and the rest ride the header / title)
  if (compact) {
    return (
      <span title={tip} style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: INK[row.lean] || C.text3, whiteSpace: 'nowrap' }}>
        {row.dash_line.toFixed(1)}{row.lean === 'over' ? ' \u25B2' : row.lean === 'under' ? ' \u25BC' : ''}
        <span style={{ color: C.text3, fontWeight: 600, fontSize: 10 }}> v {row.book_line?.toFixed(1)}</span>
      </span>
    )
  }
  return (
    <span title={`Our median for this stat (${row.provisional ? 'a preview; it freezes at the lock, about an hour before kickoff' : 'frozen at the lock beside the book’s line'})${row.reason ? ` -- ${row.reason}` : ''}. A TEST: not a call.`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: NUM_FONT, fontSize: compact ? 10 : 11, fontWeight: 800, color: INK[row.lean] || C.text3, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.08em', color: C.text3, border: `1px solid ${C.border2}`, borderRadius: 4, padding: '1px 3px' }}>TEST</span>
      DASH {row.dash_line.toFixed(1)}{compact ? null : <> · BOOK {row.book_line?.toFixed(1)}</>} · {word}{row.provisional ? <span style={{ color: C.text3, fontWeight: 600 }}> · preview</span> : null}
    </span>
  )
}
