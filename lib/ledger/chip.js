'use client'
// THE LEDGER CHIP'S NUMBER (2026-10-07): "called who scored so far tonight", e.g. 7/18. It is NEVER
// computed here and never fetched: the Tonight strip (components/TonightStrip.js) already holds the
// sport's board, with each man's CALLED / ON THE BOARD / NOT ON THE BOARD status (lib/callStatus,
// scoreNight for hockey) and who has scored, and publishes the one count it derived. Every chip in the
// app reads that same count, so "Ledger 7/18" on the Rankings page and "7 of 18 CALLED scored" on Home
// cannot disagree. Before any strip has answered this session the chip says "Ledger" and no number --
// it never shows a placeholder or a guess.
import { useSyncExternalStore } from 'react'

const counts = {}
const subs = new Set()
const emit = () => { for (const f of subs) f() }
const same = (a, b) => (a?.of ?? null) === (b?.of ?? null) && (a?.scored ?? null) === (b?.scored ?? null)

/** { scored, of } = the CALLED men who have scored / the CALLED men on the board tonight, or null. */
export function publishLedgerCount(sport, count) {
  const next = count && Number.isFinite(count.of) && count.of > 0 ? { scored: count.scored || 0, of: count.of } : null
  if (same(counts[sport], next)) return
  counts[sport] = next
  emit()
}
export function useLedgerCount(sport) {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f) },
    () => counts[sport] || null,
    () => null,
  )
}
/** "7/18", or '' when there is no count yet. */
export const ledgerCountText = (c) => (c && c.of > 0 ? `${c.scored}/${c.of}` : '')
