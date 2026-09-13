'use client'

import { useMemo, useState } from 'react'

// ══ GAMELOG FILTER — one engine, any sport ═══════════════════════════════════
//
// Spec (claude/tuddy-mlb-nfl-upgrade-prompt-2026-09-11.md, Phase 2, "Cross-site
// filter feature"): "Gamelog needs to be filterable by conditional splits, not
// just displayed -- e.g. 'games where this WR had 2+ receptions,' home/away
// splits, other situational cuts. Think of it as a gamelog/player portal: pick
// a player, slice their log by condition." Build order, per the same doc:
// "build the filter logic once as a shared, sport-agnostic piece (not
// NFL-specific code), ship it on NFL first... then point it at MLB's gamelog
// once NFL proves it out. Don't build it twice."
//
// So nothing below knows what a "reception" or a "hit" is. A row is whatever
// per-game object a sport's log already produces -- NFL's nfl_logs.json log
// entries ({s, w, opp, tm, g_td, g_rec, ...} from lib/nfl/streaks.js's own
// seriesFor) today, MLB's lib/gamelogs.js game objects ({h, tb, hr, opp, home,
// iso, ...}) whenever this gets pointed at MLB. Each sport hands in its own
// FieldDef list built from ITS OWN row shape ({ field, label, kind }); this
// file only ever reads row[field] generically.
//
// Two field kinds:
//   'number' -- a stat column, compared with an operator (>=, <=, =, ...):
//               "REC >= 2".
//   'enum'   -- a situational cut with a fixed set of values pulled straight
//               off the rows themselves (opponent, season, home/away if a
//               sport's row carries one) -- always an exact match.
// NOTE: NFL's nfl_logs.json rows carry no home/away flag today (only the
// SEASON-level splits in nfl_week.json's player.splits do) -- so "home/away"
// isn't offered as a per-game NFL condition yet. MLB's row shape already has
// one (`home: boolean`), so it drops in as an enum field the day this points
// at MLB. Filed as a real gap, not silently faked with a guess.

export const OPS = [
  { key: 'gte', label: '≥', test: (v, x) => v >= x },
  { key: 'lte', label: '≤', test: (v, x) => v <= x },
  { key: 'gt', label: '>', test: (v, x) => v > x },
  { key: 'lt', label: '<', test: (v, x) => v < x },
  { key: 'eq', label: '=', test: (v, x) => v === x },
]
export const OP = Object.fromEntries(OPS.map((o) => [o.key, o]))

/**
 * Only offer a condition on a field that actually has data for this player --
 * same rule Leaders.js and StatPortal's own stat grid already follow: a
 * control that can only ever return "no games match" is furniture, not a
 * filter.
 */
export function availableFields(rows, fieldDefs) {
  const list = Array.isArray(rows) ? rows : []
  return (fieldDefs || []).filter((f) => (f.kind === 'enum'
    ? list.some((r) => r?.[f.field] != null && r[f.field] !== '')
    : list.some((r) => Number.isFinite(Number(r?.[f.field])))))
}

/** Distinct values a field actually takes across the log, sorted -- the
 *  option list for an enum condition (opponents faced, seasons played...). */
export function enumValues(rows, field) {
  const list = Array.isArray(rows) ? rows : []
  return [...new Set(list.map((r) => r?.[field]).filter((v) => v != null && v !== ''))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
}

/** One row clears a filter set when it clears EVERY condition in it (AND). */
export function passesAll(row, filters) {
  return (filters || []).every((f) => {
    if (f.kind === 'enum') return String(row?.[f.field]) === String(f.value)
    const v = Number(row?.[f.field])
    const x = Number(f.value)
    if (!Number.isFinite(v) || !Number.isFinite(x)) return false
    return OP[f.op]?.test(v, x) ?? false
  })
}

export function applyFilters(rows, filters) {
  const list = Array.isArray(rows) ? rows : []
  if (!filters?.length) return list
  return list.filter((row) => passesAll(row, filters))
}

export function summarize(rows, filtered) {
  const total = rows?.length || 0
  const matched = filtered?.length || 0
  return { total, matched, rate: total ? matched / total : 0 }
}

export function describeFilter(f) {
  if (f.kind === 'enum') return `${f.label} = ${f.value}`
  return `${f.label} ${OP[f.op]?.label || f.op} ${f.value}`
}

let uid = 0

/**
 * State + wiring for a conditional-split filter panel. Pure logic lives
 * above and is reusable with zero React; this is the thin, still
 * sport-agnostic layer that a presentational bar (e.g.
 * components/nfl/GamelogFilterBar.js) renders against. Draft state (the
 * condition being built but not yet added) is separate from `filters` (the
 * committed, active list) so a half-filled control never silently filters.
 */
export function useGamelogFilters(rows, fieldDefs) {
  const live = useMemo(() => availableFields(rows, fieldDefs), [rows, fieldDefs])
  const [filters, setFilters] = useState([])
  const [draftField, setDraftField] = useState(live[0]?.field || '')
  const [draftOp, setDraftOp] = useState('gte')
  const [draftValue, setDraftValue] = useState('')

  const draft = live.find((f) => f.field === draftField) || live[0]
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters])
  const { total, matched, rate } = summarize(rows, filtered)

  const add = () => {
    if (!draft || draftValue === '') return
    const next = draft.kind === 'enum'
      ? { id: ++uid, field: draft.field, label: draft.label, kind: 'enum', value: draftValue }
      : { id: ++uid, field: draft.field, label: draft.label, kind: 'number', op: draftOp, value: draftValue }
    setFilters((prev) => [...prev, next])
    setDraftValue('')
  }
  const remove = (id) => setFilters((prev) => prev.filter((f) => f.id !== id))
  const clearAll = () => setFilters([])

  return {
    live, filters, filtered, total, matched, rate,
    draft, draftField, setDraftField, draftOp, setDraftOp, draftValue, setDraftValue,
    add, remove, clearAll,
  }
}
