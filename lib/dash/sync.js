'use client'

// ☁️ DASH SYNC — the saved side of the site stops being a browser thing.
//
// Every list this site keeps for you — the watchlist, My Picks, the watchlist
// ledger, your notes — has been written to localStorage since the day it was
// built, and every one of those files says the same sentence somewhere near
// the top: "there is no server here." That was true. Franchise brought one
// (Supabase, 202608250001) and the account it created is valid on every page
// of the network, not just /fantasy. So the sentence is now a choice, and this
// file is the other choice.
//
// THE RULES, in the order they matter:
//
//   1. LOCAL FIRST, ALWAYS. localStorage stays the source of truth the UI
//      reads. Nothing here blocks a render, and every existing reader keeps
//      working untouched. Signed out — which is most people, most of the time
//      — this file pulls once, learns nothing is configured, and gets out of
//      the way. That is the whole failure mode.
//   2. THE CLOUD IS A MIRROR, NOT A MASTER. A pull merges into local; it never
//      replaces it wholesale. This matters because the first sign-in on a
//      device that already has a season of picks must not wipe them, and the
//      first sign-in on a fresh phone must not wipe the account.
//   3. MERGE, THEN WRITE. Each key declares how two copies combine (see
//      STRATEGIES). Sets union, date-keyed stores union by date, everything
//      else takes the newer stamp. A list is never shrunk by a race.
//   4. REMOVALS NEED TOMBSTONES. Union merging resurrects deletions — unstar a
//      player on your phone and the laptop's stale copy hands him back. The
//      follow list (lib/dash/follow.js) stores removals as dated tombstones so
//      "gone" is a fact with a clock on it, not an absence.
//
// WHAT IT DOES NOT DO: real time. There is no socket and no subscription. Two
// devices open at once converge within a poll, not instantly, and that is
// deliberate — a watchlist is not a chat.

import { useEffect, useState } from 'react'

const META_KEY = 'dash_sync_meta_v1'
const ENDPOINT = '/api/dash/state'
const POLL_MS = 45000
const PUSH_DEBOUNCE_MS = 1200

// ── strategies ───────────────────────────────────────────────────────────────

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

// Newer stamp wins outright. For anything whose whole value is one snapshot
// (tonight's pinned rows, a settings blob) — losing a race here costs an
// ordering, not history.
const newerWins = (local, cloud, localAt, cloudAt) => (cloudAt > localAt ? cloud : local)

// Date-keyed stores: { slates: {...}, ledger: {...} } and { 'YYYY-MM-DD': {...} }.
// A night either side has is a night the merge keeps. Where both have the same
// night, the newer stamp decides that night alone — so a phone's Tuesday and a
// laptop's Wednesday both survive, which is the entire point.
function mergeDateMap(local, cloud, localAt, cloudAt) {
  if (!isObj(local)) return cloud
  if (!isObj(cloud)) return local
  const out = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(cloud)])
  for (const k of keys) {
    const l = local[k]
    const c = cloud[k]
    if (l === undefined) { out[k] = c; continue }
    if (c === undefined) { out[k] = l; continue }
    out[k] = isObj(l) && isObj(c)
      ? mergeDateMap(l, c, localAt, cloudAt)
      : (cloudAt > localAt ? c : l)
  }
  return out
}

// Entry maps with their own per-entry clock: { id: { ..., at } }. Used by the
// follow list, where `at` also carries tombstones (see follow.js). The newest
// statement about an id wins, whichever device made it.
function mergeStamped(local, cloud) {
  if (!isObj(local)) return cloud
  if (!isObj(cloud)) return local
  const out = { ...local }
  for (const [id, entry] of Object.entries(cloud)) {
    const mine = out[id]
    const mineAt = Number(mine?.at) || 0
    const theirsAt = Number(entry?.at) || 0
    if (!mine || theirsAt > mineAt) out[id] = entry
  }
  return out
}

const STRATEGIES = { newerWins, mergeDateMap, mergeStamped }

// ── the registry ─────────────────────────────────────────────────────────────
//
// Adding a synced feature is one line here. No migration, no API change — the
// server side of this is a key/value table that deliberately knows nothing
// about what these mean (see 202608280012_dash_user_state.sql).

const REGISTRY = new Map()

export function registerSyncedKey(key, { strategy = 'newerWins', event = null } = {}) {
  REGISTRY.set(key, { strategy: STRATEGIES[strategy] ? strategy : 'newerWins', event })
}

// The keys the site syncs today. Everything else in localStorage — theme,
// palette, the nav's saved position, quiet mode — is deliberately NOT here:
// those describe this device, and following you onto another one would be a
// bug, not a feature.
registerSyncedKey('dash_follow_v1', { strategy: 'mergeStamped', event: 'dash-follow-change' })
registerSyncedKey('mlb_watchlist_v1', { strategy: 'newerWins' })
registerSyncedKey('tuddy_watchlist_v1', { strategy: 'newerWins', event: 'tuddy-watchlist-change' })
registerSyncedKey('my_picks_v1', { strategy: 'mergeDateMap' })
registerSyncedKey('nfl_my_picks_v1', { strategy: 'mergeDateMap' })
registerSyncedKey('watch_ledger_v1', { strategy: 'mergeDateMap' })
registerSyncedKey('moonshot_player_notes_v1', { strategy: 'newerWins' })
// Which alerts you want (lib/dash/alerts.js). The master on/off is NOT synced
// — it stays `wire_notif` on the device, because notification permission is
// per-browser and a phone that has never been asked must not be told it is
// already armed.
registerSyncedKey('dash_alerts_v1', { strategy: 'newerWins', event: 'dash-alerts-change' })

// ── local plumbing ───────────────────────────────────────────────────────────

const readJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch { return fallback }
}

const meta = () => readJSON(META_KEY, {}) || {}

const setMeta = (key, patch) => {
  try {
    const all = meta()
    all[key] = { ...(all[key] || {}), ...patch }
    localStorage.setItem(META_KEY, JSON.stringify(all))
  } catch { /* quota or private mode — sync degrades, the site doesn't */ }
}

// A local edit's clock. localStorage has no mtime, so the fingerprint below is
// how a change is noticed at all: if the stored string differs from the one we
// last pushed, something edited it and the edit is newer than the cloud copy.
const fingerprint = (raw) => {
  let h = 5381
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) + h + raw.charCodeAt(i)) | 0
  return `${raw.length}:${h}`
}

function announce(key) {
  const entry = REGISTRY.get(key)
  try {
    if (entry?.event) window.dispatchEvent(new Event(entry.event))
    window.dispatchEvent(new CustomEvent('dash-sync-applied', { detail: { key } }))
  } catch { /* ignore */ }
}

// ── account ──────────────────────────────────────────────────────────────────

let account = { ready: false, signedIn: false, configured: false }
const accountListeners = new Set()
const emitAccount = () => accountListeners.forEach((fn) => fn(account))

export function getAccount() { return account }

/** Account state for UI copy — "saving to your account" vs "saved on this device". */
export function useDashAccount() {
  const [value, setValue] = useState(account)
  useEffect(() => {
    accountListeners.add(setValue)
    setValue(account)
    return () => { accountListeners.delete(setValue) }
  }, [])
  return value
}

// ── pull / push ──────────────────────────────────────────────────────────────

async function pull() {
  let payload
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return false
    payload = await res.json()
  } catch { return false }

  account = { ready: true, signedIn: Boolean(payload?.signedIn), configured: Boolean(payload?.configured) }
  emitAccount()
  if (!account.signedIn) return false

  const cloud = payload.state || {}
  for (const [key, entry] of REGISTRY.entries()) {
    const remote = cloud[key]
    const localRaw = (() => { try { return localStorage.getItem(key) } catch { return null } })()
    const localValue = localRaw === null ? undefined : (() => { try { return JSON.parse(localRaw) } catch { return undefined } })()

    if (remote === undefined) {
      // Nothing in the account yet. If this device has something, it becomes
      // the account's first copy — this is what "sign in on the device you've
      // been using" is supposed to do.
      if (localValue !== undefined) await push(key, localValue)
      continue
    }
    if (localValue === undefined) {
      writeLocal(key, remote.value, remote.updatedAt)
      continue
    }

    const localAt = Number(meta()[key]?.at) || 0
    const cloudAt = new Date(remote.updatedAt || 0).getTime() || 0
    const merged = STRATEGIES[entry.strategy](localValue, remote.value, localAt, cloudAt)
    const mergedRaw = JSON.stringify(merged)

    if (mergedRaw !== localRaw) writeLocal(key, merged, Math.max(localAt, cloudAt))
    if (mergedRaw !== JSON.stringify(remote.value)) await push(key, merged)
  }
  return true
}

function writeLocal(key, value, at) {
  const raw = JSON.stringify(value)
  try { localStorage.setItem(key, raw) } catch { return }
  setMeta(key, { at: at || Date.now(), pushed: fingerprint(raw) })
  announce(key)
}

async function push(key, value) {
  if (!account.signedIn) return
  const raw = JSON.stringify(value)
  const at = Date.now()
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key, value, updatedAt: new Date(at).toISOString() }),
    })
    if (!res.ok) return
    const body = await res.json()
    if (!body?.signedIn) { account = { ...account, signedIn: false }; emitAccount(); return }
    // The server returns whatever ended up stored. If another device won the
    // race, that is the copy this device should be holding.
    const storedRaw = JSON.stringify(body.value)
    if (storedRaw !== raw) {
      writeLocal(key, body.value, new Date(body.updatedAt || at).getTime())
      return
    }
    setMeta(key, { at, pushed: fingerprint(raw) })
  } catch { /* offline — the next poll retries, nothing is lost locally */ }
}

// ── change detection ─────────────────────────────────────────────────────────
//
// The site writes localStorage from ~thirty places and none of them were
// written to notify anybody. Rather than thread a callback through all of
// them, this compares a cheap fingerprint of each registered key against the
// last one pushed. markDirty() below is the fast path for the two hot spots
// (starring a player, saving a pick) so those feel instant instead of waiting
// on a tick.

let pushTimer = null

function scan() {
  if (!account.signedIn) return
  const stamps = meta()
  for (const key of REGISTRY.keys()) {
    let raw
    try { raw = localStorage.getItem(key) } catch { continue }
    if (raw === null) continue
    if (stamps[key]?.pushed === fingerprint(raw)) continue
    let value
    try { value = JSON.parse(raw) } catch { continue }
    setMeta(key, { at: Date.now() })
    push(key, value)
  }
}

/** Call right after writing a synced key so the push doesn't wait for a tick. */
export function markDirty() {
  if (!account.signedIn) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(scan, PUSH_DEBOUNCE_MS)
}

let started = false

/** Mounted once, by components/DashSync.js in the root layout. */
export function startSync() {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  pull()
  const poll = setInterval(() => { scan(); pull() }, POLL_MS)
  const onVisible = () => { if (document.visibilityState === 'visible') { scan(); pull() } }
  const onStorage = () => scan()

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', scan)

  return () => {
    clearInterval(poll)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pagehide', scan)
    started = false
  }
}
