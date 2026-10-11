'use client'
import { useCallback, useMemo } from 'react'
import { useHashFilter } from './filterHash'
import { parsePos, serializePos, positionOptions, rowMatches, posWords, specOf } from './positions'

// THE POSITION FILTER, AS A HOOK (2026-10-10). Every Rankings page calls it once with its sport key and its rows:
//
//   const pf = usePositionFilter('nfl', pool, { posOf: (p) => p.position, countRows: otherFiltered, extraOf, extraOrder })
//   rows.filter(pf.test)                       // narrows nothing until a position is picked
//   <FiltersDrawer positions={pf.control} .../>  // the pills (components/FiltersDrawer.js draws them)
//   pf.chip                                    // the removable chip for the active-filters row
//
// The choice rides the address as `pos=RB,WR` (lib/filterHash useHashFilter: a REPLACE, read after mount, followed on
// Back / Forward and on a pasted link), so reload, Back and a shared link reopen the same filter.
//
// `ready` (default true): false while the page is still waiting for the position data (MOONSHOT asks the league for
// them). Until it is ready the filter is not applied, so a held #pos=SS shows the board, not an empty one.
//
// `version`: bump it when the position data behind posOf changes without the rows changing (MOONSHOT's arrives late).
//
// Not applied = a row with no position of its own clears nothing: it is only on the board under All, and the count on
// a pill never includes it. The page does not guess a position.
export default function usePositionFilter(sport, pool, { posOf, extraOf = null, extraOrder = [], countRows = null, ready = true, version = 0, pending = null } = {}) {
  const [raw, setRaw] = useHashFilter('pos')
  const sel = useMemo(() => parsePos(raw), [raw])
  const options = useMemo(
    () => positionOptions(sport, pool, { posOf, extraOf, extraOrder, countRows, selected: sel, pending }),
    [sport, pool, countRows, sel, version, extraOrder.join('|'), pending],   // eslint-disable-line react-hooks/exhaustive-deps
  )
  const active = sel.length > 0
  const applied = active && ready
  const test = useCallback((row) => !applied || rowMatches(sport, row, sel, { posOf, extraOf }), [applied, sport, sel, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => setRaw(''), [setRaw])
  const toggle = useCallback((key) => setRaw(serializePos(sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key])), [sel, setRaw])
  const control = useMemo(
    () => (options.length ? { options, value: sel, onToggle: toggle, onClear: clear, noun: specOf(sport).noun, pending } : null),
    [options, sel, toggle, clear, sport, pending],
  )
  const chip = active ? { key: 'pos', label: `Pos ${posWords(sel)}`, onClear: clear, onRemove: clear } : null
  return { sel, active, applied, test, clear, toggle, options, control, chip, noun: specOf(sport).noun }
}
