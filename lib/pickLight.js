'use client'
import { useSyncExternalStore } from 'react'

// ✨ THE TAP HIGHLIGHT, SITE-WIDE (2026-09-30, Donovan: the numerology page
// "how you can click and highlight players and then click thru and see
// they are highlighted -- that component needs to be everywhere"; asked
// where: "site-wide").
//
// MOONSHOT's Alignments chips kept a tapped name lit while you opened other
// clubs and braids -- inside that one page. This is that set, per sport,
// shared by every page: tap a name on the numerology chips and he stays lit
// on the boards, Live, Leaders, the Players list, until you clear him. It is
// NOT the Spotlight (lib/spotlight.js: rules like "Barrel% >= 10" in colours
// you pick); this is a hand-picked list of names, and it draws in the same
// grammar (row wash, edge, mark) so the two read as one idea.
//
// Stored in this browser only (localStorage); a per-viewer convenience, the
// way the watchlist started. { mlb: { id: name }, nfl: {...}, nhl: {...} }

const KEY = 'dash_picklight_v1'
const SPORTS = ['mlb', 'nfl', 'nhl']
const EMPTY = Object.freeze({})
let state = null
const listeners = new Set()

function load() {
  if (state) return state
  state = { mlb: {}, nfl: {}, nhl: {} }
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}')
    for (const s of SPORTS) if (raw && typeof raw[s] === 'object' && raw[s]) state[s] = { ...raw[s] }
  } catch { /* private window / blocked storage: start empty */ }
  return state
}
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
}
function emit() { for (const cb of listeners) cb() }
function subscribe(cb) {
  listeners.add(cb)
  const onStorage = (e) => { if (e.key === KEY) { state = null; load(); cb() } }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage) }
}

/** The one id every row shape carries, as a string ('' when none). */
export function rowPid(r) {
  const x = r?._raw ?? r
  const v = x?.player_id ?? x?.playerId ?? x?.pid ?? x?.id ?? r?.player_id ?? r?.playerId ?? r?.pid ?? r?.id
  return v === undefined || v === null ? '' : String(v)
}

export function togglePick(sport, id, name = '') {
  const s = load()
  if (!s[sport] || !id) return
  const next = { ...s[sport] }
  if (next[id] !== undefined) delete next[id]; else next[id] = String(name || '')
  state = { ...s, [sport]: next }
  save(); emit()
}
export function clearPicks(sport) {
  const s = load()
  if (!s[sport]) return
  state = { ...s, [sport]: {} }
  save(); emit()
}

/** { map: {id: name}, has(id), toggle(id, name), clear(), count } for a sport. */
export function usePickLight(sport) {
  const map = useSyncExternalStore(
    subscribe,
    () => load()[sport] || EMPTY,
    () => EMPTY,
  )
  return {
    map,
    count: Object.keys(map).length,
    has: (id) => Boolean(id) && map[String(id)] !== undefined,
    toggle: (id, name) => togglePick(sport, String(id), name),
    clear: () => clearPicks(sport),
  }
}

// The highlight's colour: the orange MOONSHOT's Alignments chips light in.
// A theme token on every product (C.orange resolves on all three).
export const pickColorOf = (C) => C.orange
