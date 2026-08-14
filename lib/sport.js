'use client'
import { useEffect, useSyncExternalStore } from 'react'

// 🏈⚾ SPORT — which half of MOONSHOT you're looking at.
//
// The header has carried an NFL pill since 2026-08-08, wired to a `NFL_URL`
// that was going to point at a SECOND deployed site. That plan is off: the
// asset here is the eighty components in /components, and forking them means
// maintaining two copies of every fix for the rest of the season. NFL lives
// in this app, behind this switch.
//
// What the switch actually swaps is the whole dashboard — header, tabs, data
// source, palette. What it does NOT swap is the primitives: DenseTable,
// Explain, PaletteButton, MobileCSS and the ui.js kit are shared, because
// they're sport-agnostic and every improvement to them should land on both
// sides at once.
//
// Persisted to localStorage so the choice survives a reload, and mirrored
// into the URL hash so a link can carry it. #sport=nfl opens the NFL side
// directly, which is what a Discord post needs.

const KEY = 'moonshot_sport_v1'
const VALID = new Set(['mlb', 'nfl'])

let current = 'mlb'
let hydrated = false
const listeners = new Set()

// SNAPSHOT THE HASH AT MODULE LOAD, not when the effect runs.
//
// Dashboard has an effect that rebuilds the whole hash from scratch on mount
// (tab + player id, nothing else). Child effects run before parent effects, so
// by the time SportRoot's hook looked at window.location.hash it was already
// empty and #sport=nfl silently did nothing — every shared NFL link opened on
// baseball. Reading it here, at import time, puts us ahead of every component.
const INITIAL_HASH = typeof window !== 'undefined' ? String(window.location.hash || '') : ''

/**
 * The hash as it was when the page loaded, parsed.
 *
 * Anything that needs to read a deep-link parameter has to use THIS, not
 * window.location.hash, because Dashboard rewrites the live hash from its own
 * state during mount. The NFL dashboard lost its `tab` parameter exactly that
 * way: MLB renders first, its effect rebuilds the hash keeping only `sport`,
 * then the switch flips and NflDashboard mounts to find `tab` already gone.
 */
export function initialHashParams() {
  try {
    return new URLSearchParams(INITIAL_HASH.replace(/^#/, ''))
  } catch {
    return new URLSearchParams()
  }
}

function readInitial() {
  if (typeof window === 'undefined') return 'mlb'
  try {
    const h = new URLSearchParams((INITIAL_HASH || String(window.location.hash || '')).replace(/^#/, ''))
    const fromHash = h.get('sport')
    if (fromHash && VALID.has(fromHash)) return fromHash
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && VALID.has(saved)) return saved
  } catch { /* ignore */ }
  return 'mlb'
}

function emit() { listeners.forEach((l) => l()) }

export function setSport(next) {
  if (!VALID.has(next) || next === current) return
  current = next
  hydrated = true
  try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  // Rewrite the hash without adding a history entry — the back button should
  // leave the site, not toggle sports, which is what pushState would do.
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    h.set('sport', next)
    window.history.replaceState(null, '', `#${h.toString()}`)
  } catch { /* ignore */ }
  emit()
}

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

const getSnapshot = () => current
const getServerSnapshot = () => 'mlb'

export function useSport() {
  const sport = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // HYDRATE AFTER MOUNT, NOT INSIDE subscribe().
  //
  // The first cut read localStorage/hash from inside subscribe() and fired a
  // queued emit. It never rendered NFL: useSyncExternalStore had already taken
  // its snapshot for that commit, and the notification raced the subscription
  // it was supposed to wake. Doing it in an effect is the boring, correct
  // order — server renders 'mlb', the client mounts, then the stored choice
  // applies and the store notifies normally.
  useEffect(() => {
    if (hydrated) return
    hydrated = true
    const initial = readInitial()
    if (initial !== current) { current = initial; emit() }
  }, [])

  return sport
}
