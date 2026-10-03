'use client'
import { writeHash } from './urlState'
import { useEffect, useSyncExternalStore } from 'react'
import { resolveTab } from './routes'

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
// 2026-09-25: LAMP (NHL) is the third product behind this switch.
// 2026-10-02: BUCKETS (NBA) is the fourth -- routable for those allowed to see it (SportRoot gates it)
const VALID = new Set(['mlb', 'nfl', 'nhl', 'nba'])

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
    // A link that NAMES a sport we don't have (#sport=xyz) is not the same as
    // one that names none (audit 00A fix 5): it used to fall through to the
    // last sport this browser used -- testing landed on LAMP. The link asked
    // for something specific; answer the same way on every device: MOONSHOT.
    if (fromHash) return 'mlb'
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
  // BACK RETURNS TO THE LAST PRODUCT (2026-09-27, audit 00A root fix 1). This
  // used to replace the hash on purpose ("back should leave the site"); the
  // standard now is that Back returns where you were, so a switch from the
  // chrome adds a history entry. When the address ALREADY names the sport --
  // Back/Forward landed on it, or a link / notification arrived with it --
  // there is nothing to write, and its player / date / game / team stay:
  // stripping them here is what lost the player from a cross-sport link.
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    if (h.get('sport') === next) { emit(); return }
    h.set('sport', next)
    // 2026-09-24 audit (NAV-3/NAV-5): the tab used to ride across unchanged,
    // so TUDDY Touchdowns -> tap MOONSHOT landed on "NO SUCH TAB touchdowns".
    // Resolve it for the sport we are switching TO (aliases map, e.g.
    // boards<->board, live<->scoreboard); a page the other product doesn't
    // have goes to its Home. A player id is never valid across sports.
    const r = resolveTab(next, h.get('tab'))
    if (r.status === 'ok' || r.status === 'alias') h.set('tab', r.tab)
    else h.delete('tab')
    h.delete('p'); h.delete('player'); h.delete('view')
    // LAMP's own parameters (a game id, a day) mean nothing on the other two.
    h.delete('game'); h.delete('date'); h.delete('team'); h.delete('card'); h.delete('cm'); h.delete('day'); h.delete('week')
    // Board filters (lib/filterHash) are the other product's teams and games.
    h.delete('fteam'); h.delete('fgame')
    writeHash(h, { push: true })
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
