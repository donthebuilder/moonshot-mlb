'use client'
// THE ONE SLIP STORE (2026-10-17). One slip per sport, kept in this browser for a day under the key PropCards always used (lib/slip/core.js
// SLIP_KEYS), read by every surface that adds a leg and by the slip bar (components/Slip.js). All storage is in try/catch: a private window
// still gets a slip for the visit, it just does not survive a reload.
import { useCallback, useSyncExternalStore } from 'react'
import { SLIP_KEYS, readLegs, withLeg, withLegs, withoutLeg, toggledLeg } from './core'

const EMPTY = Object.freeze([])
const cache = new Map()      // sport -> legs (replaced, never mutated, so a snapshot is stable)
const subs = new Set()
const emit = () => subs.forEach((f) => f())

function legsOf(sport) {
  if (!SLIP_KEYS[sport]) return EMPTY
  if (!cache.has(sport)) {
    let raw = null
    try { raw = window.localStorage.getItem(SLIP_KEYS[sport]) } catch { /* private mode */ }
    cache.set(sport, readLegs(raw))
  }
  return cache.get(sport)
}
function put(sport, next) {
  if (!SLIP_KEYS[sport]) return
  cache.set(sport, next)
  try { window.localStorage.setItem(SLIP_KEYS[sport], JSON.stringify(next)) } catch { /* private mode */ }
  emit()
}
const subscribe = (f) => {
  subs.add(f)
  const onStorage = (e) => { if (!e.key || Object.values(SLIP_KEYS).includes(e.key)) { cache.clear(); emit() } }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => { subs.delete(f); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage) }
}

export const slipAdd = (sport, leg) => put(sport, withLeg(legsOf(sport), leg))
export const slipAddMany = (sport, legs) => put(sport, withLegs(legsOf(sport), legs))
export const slipRemove = (sport, key) => put(sport, withoutLeg(legsOf(sport), key))
export const slipToggle = (sport, leg) => put(sport, toggledLeg(legsOf(sport), leg))
export const slipClear = (sport) => put(sport, [])

/** The calls tonight's CALLED picks are published under (PropCards publishes while a Props board is on screen; the slip panel reads). */
const calls = new Map()
const callSubs = new Set()
export function publishCalls(sport, payload) { calls.set(sport, payload); callSubs.forEach((f) => f()) }
const callsSubscribe = (f) => { callSubs.add(f); return () => callSubs.delete(f) }

/** { legs, add, remove, toggle, clear, addMany, has } for one sport's slip. Server render and first paint: empty. */
export function useSlip(sport) {
  const legs = useSyncExternalStore(subscribe, () => legsOf(sport), () => EMPTY)
  const add = useCallback((l) => slipAdd(sport, l), [sport])
  const remove = useCallback((k) => slipRemove(sport, k), [sport])
  const toggle = useCallback((l) => slipToggle(sport, l), [sport])
  const clear = useCallback(() => slipClear(sport), [sport])
  const addMany = useCallback((ls) => slipAddMany(sport, ls), [sport])
  return { legs, add, remove, toggle, clear, addMany, has: (key) => legs.some((l) => l.key === key) }
}
export const useCalls = (sport) => useSyncExternalStore(callsSubscribe, () => calls.get(sport) || null, () => null)
