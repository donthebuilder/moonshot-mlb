'use client'
// A GAME'S OWN TOTAL (2026-10-10, Donovan on the TUDDY game page: "i dont think i care about the team totals being there in
// general. just add them to the games that are respectively on"). The Top Totals row the lock stored for THIS game, said once
// beside the game it belongs to instead of as a separate table above the slate: the projected combined count, the number it is
// graded against, the CALLED / ON THE BOARD word (lib/callStatus via CallStatusBadge, never typed here) and, once graded, the
// final count and OVER / UNDER. Nothing is computed here and nothing is stored: the rows are /api/totals' rows. The ledger
// (components/TopTotals mode="record") keeps the record.
import { useMemo } from 'react'
import { useLiveFetch } from '../lib/useLiveFetch'
import { useSportTheme } from './SportTheme'
import CallStatusBadge from './CallStatusBadge'
import { TOTALS_UNITS, lineWord, fmtTotal } from '../lib/totals/core'

/** The newest slate's total rows by game id: { [game_id]: row } (null while loading / unavailable). */
export function useGameTotals(sport) {
  const { data } = useLiveFetch(`/api/totals?sport=${sport}`)
  return useMemo(() => {
    if (!data?.rows) return null
    return Object.fromEntries(data.rows.map((r) => [String(r.game_id), r]))
  }, [data])
}

const WORD = { over: 'OVER', under: 'UNDER', push: 'PUSH', void: 'VOID' }

export default function GameTotalLine({ sport, row, style }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!row) return null
  const u = TOTALS_UNITS[sport]
  return (
    <div data-game-total={row.game_id} style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap', fontSize: 12, color: C.text2, ...style }}>
      <span style={{ fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.1em', fontSize: 11, color: C.text3 }}>GAME TOTAL</span>
      <b style={{ fontFamily: NUM_FONT, fontSize: 13, color: C.text }}>{fmtTotal(sport, row.projected_total)} {u.short}</b>
      <span>projected{row.rank ? ` · #${row.rank} this ${u.slate}` : ''}</span>
      <span>graded {lineWord(row)} {fmtTotal(sport, row.line)}</span>
      <CallStatusBadge status={row.status} />
      {row.actual_total != null && <span>final <b style={{ fontFamily: NUM_FONT, color: C.text }}>{fmtTotal(sport, row.actual_total)}</b></span>}
      {row.result && <b style={{ fontFamily: NUM_FONT, color: row.result === 'over' ? accent : C.text2 }}>{WORD[row.result] || row.result}</b>}
    </div>
  )
}
