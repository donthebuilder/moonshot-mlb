'use client'
// THE ONE SLIP STORE (2026-10-17), NOW ONE SLIP FOR EVERY SPORT (2026-10-25). All legs live in one list kept in this browser for a day under
// SLIP_KEY_ALL (lib/slip/core.js); each leg carries its sport. `useSlip(sport)` still hands a surface only ITS sport's legs (so every adder and
// card reads exactly what it did), and adds `all` for the slip panel, which shows every sport. A slip saved under the four old keys is merged in
// once, on first read. All storage is in try/catch: a private window still gets a slip for the visit, it just does not survive a reload.
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { SLIP_KEYS, SLIP_KEY_ALL, readLegs, mergeLegacy, withLeg, withLegs, withoutLeg, toggledLeg, withPrice, legsOfSport } from './core'

const EMPTY = Object.freeze([])
let cache = null             // every leg (replaced, never mutated, so a snapshot is stable)
const subs = new Set()
const emit = () => subs.forEach((f) => f())

function allLegs() {
  if (cache) return cache
  let raw = null
  try { raw = window.localStorage.getItem(SLIP_KEY_ALL) } catch { /* private mode */ }
  if (raw != null) { cache = readLegs(raw); return cache }
  const old = {}
  for (const s of Object.keys(SLIP_KEYS)) { try { old[s] = window.localStorage.getItem(SLIP_KEYS[s]) } catch { /* private mode */ } }
  cache = mergeLegacy(old)
  if (cache.length) { try { window.localStorage.setItem(SLIP_KEY_ALL, JSON.stringify(cache)) } catch { /* private mode */ } }
  return cache
}
function put(next) {
  cache = next
  try { window.localStorage.setItem(SLIP_KEY_ALL, JSON.stringify(next)) } catch { /* private mode */ }
  emit()
}
const subscribe = (f) => {
  subs.add(f)
  const onStorage = (e) => { if (!e.key || e.key === SLIP_KEY_ALL) { cache = null; emit() } }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => { subs.delete(f); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage) }
}

const stamp = (sport, leg) => (SLIP_KEYS[sport] ? { ...leg, sport } : null)
export const slipAdd = (sport, leg) => { const l = stamp(sport, leg); if (l) put(withLeg(allLegs(), l)) }
export const slipAddMany = (sport, legs) => { if (SLIP_KEYS[sport]) put(withLegs(allLegs(), legs.map((l) => ({ ...l, sport })))) }
export const slipRemove = (sport, key) => put(withoutLeg(allLegs(), key, sport))
export const slipToggle = (sport, leg) => { const l = stamp(sport, leg); if (l) put(toggledLeg(allLegs(), l)) }
export const slipClear = (sport) => put(allLegs().filter((l) => l.sport !== sport))
export const slipClearAll = () => put([])
export const slipSetPrice = (sport, key, price) => put(withPrice(allLegs(), key, sport, price))

/** The calls tonight's CALLED picks are published under (PropCards publishes while a Props board is on screen; the slip panel reads). */
const calls = new Map()
const callSubs = new Set()
export function publishCalls(sport, payload) { calls.set(sport, payload); callSubs.forEach((f) => f()) }
const callsSubscribe = (f) => { callSubs.add(f); return () => callSubs.delete(f) }

/**
 * { legs, all, add, remove, toggle, clear, addMany, setPrice, has } for one sport. `legs` = THIS sport's legs (what every surface always read);
 * `all` = every sport's, for the slip panel. Server render and first paint: empty.
 */
export function useSlip(sport) {
  const all = useSyncExternalStore(subscribe, allLegs, () => EMPTY)
  const legs = useMemo(() => legsOfSport(all, sport), [all, sport])   // stable between changes, as the per-sport list always was
  const add = useCallback((l) => slipAdd(sport, l), [sport])
  const remove = useCallback((k, s = sport) => slipRemove(s, k), [sport])
  const toggle = useCallback((l) => slipToggle(sport, l), [sport])
  const clear = useCallback(() => slipClear(sport), [sport])
  const addMany = useCallback((ls) => slipAddMany(sport, ls), [sport])
  const setPrice = useCallback((k, price, s = sport) => slipSetPrice(s, k, price), [sport])
  return { legs, all, add, remove, toggle, clear, addMany, setPrice, has: (key) => legs.some((l) => l.key === key) }
}
export const useCalls = (sport) => useSyncExternalStore(callsSubscribe, () => calls.get(sport) || null, () => null)
