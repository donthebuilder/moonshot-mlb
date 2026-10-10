'use client'
// CALLED LAST NIGHT -- the client half. One fetch of /api/called-last per sport+slate (shared across every
// component that asks, kept for this page load), and the lens every board uses:
//   mode  ''        off (the default; nothing narrowed, nothing in the address)
//         'all'     everyone the bot called last night (#cln=all)
//         'miss' | 'hit' | 'void'   optional narrowing inside that set
// The mode rides the address (#cln=) through lib/filterHash.js useHashFilter, like the team / game filters, so
// a pasted link and Back reopen the same filter. While the rows load the filter passes everything through (it
// never blanks a board it has not read yet).
import { useEffect, useMemo, useState } from 'react'
import { useHashFilter } from '../filterHash'
import { FILTER_KEY, MODES, modeOf, passes, cellText, summarize, SECTION_TITLE, RESULT_LOWER } from './core'

const memo = new Map()   // 'sport|date|week' -> Promise<payload|null>, this page load only
const load = (sport, date, week) => {
  const k = `${sport}|${date}|${week ?? ''}`
  if (!memo.has(k)) {
    const q = new URLSearchParams({ sport, date })
    if (week) q.set('week', String(week))
    memo.set(k, fetch(`/api/called-last?${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  }
  return memo.get(k)
}

/** { data, loading } -- data null on a failed read (the section then says it could not read, never "none"). */
export function useCalledLast(sport, date, week = null) {
  const [state, setState] = useState({ key: '', data: null, done: false })
  const key = `${sport}|${date || ''}|${week ?? ''}`
  useEffect(() => {
    if (!sport || !date) return undefined
    let live = true
    load(sport, date, week).then((data) => { if (live) setState({ key, data, done: true }) })
    return () => { live = false }
  }, [sport, date, week, key])
  const fresh = state.key === key
  return { data: fresh ? state.data : null, loading: !fresh || !state.done, failed: fresh && state.done && !state.data }
}

/**
 * The lens a board draws its filter, chip and column from.
 * @param sport  mlb | nfl | nhl | nba      @param date  the slate's own date      @param week  NFL week
 */
export function useCalledLastLens(sport, date, week = null, { enabled = true } = {}) {
  const [raw, setRaw] = useHashFilter(FILTER_KEY)
  const mode = enabled ? modeOf(raw) : ''
  const { data, loading, failed } = useCalledLast(enabled ? sport : '', date, week)
  const rows = data?.rows || []
  const byId = useMemo(() => new Map(rows.map((r) => [String(r.pid), r])), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const known = Boolean(data)
  return useMemo(() => ({
    sport, enabled, mode, on: Boolean(mode), setMode: (m) => setRaw(modeOf(m)), data, loading, failed, rows, byId,
    summary: summarize(rows),
    rowFor: (id) => byId.get(String(id)) || null,
    /** the board's row test: always true when the filter is off or its rows have not loaded */
    test: (id) => !mode || !known || passes(mode, byId.get(String(id))),
    cell: (id) => cellText(byId.get(String(id))),
    chip: mode ? {
      key: FILTER_KEY,
      label: `${SECTION_TITLE}${mode === 'all' ? '' : ` · ${RESULT_LOWER[mode]}`}`,
      onRemove: () => setRaw(''), onClear: () => setRaw(''),
    } : null,
    modes: MODES,
  }), [sport, enabled, mode, data, loading, failed, byId]) // eslint-disable-line react-hooks/exhaustive-deps
}
