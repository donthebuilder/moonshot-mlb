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

// ── 🚨 THE RUNAWAY UPLOAD (2026-08-30) ───────────────────────────────────────
//
// Vercel paused the whole account. Fast Origin Transfer: 30.19 GB against a
// 10 GB month, 99.4% of it INBOUND, ~0 for four weeks and then two spikes of
// 14 GB and 16 GB on Aug 29 and Aug 30 — the first two full days after the
// front-door pass turned account sync on network-wide.
//
// The loop, exactly:
//
//   1. `my_picks_v1` grows to 45 slate-days of picks plus 120 ledger nights.
//      That is comfortably past the route's 128KB cap.
//   2. push() sends it. The route reads the whole body, measures it, answers
//      413. THE BODY IS ALREADY ON THE WIRE — a rejection costs full price.
//   3. `if (!res.ok) return` — so setMeta's `pushed` fingerprint is never
//      updated, and it still holds the value from the last SUCCESSFUL push.
//   4. scan() runs 45 seconds later, compares the current fingerprint against
//      that stale one, sees a difference, and pushes the same doomed blob
//      again. Forever. Every tab. Every device. ~1.3 GB a day, each.
//
// Three things were wrong and all three are fixed below:
//
//   · A CLIENT THAT SENDS WHAT THE SERVER HAS ALREADY SAID IT WILL REFUSE.
//     MAX_SYNC_BYTES mirrors the route's cap and push() measures BEFORE it
//     opens a socket. Nothing over the line ever leaves the browser again.
//   · A FAILURE WITH NO MEMORY. A 4xx is a permanent verdict about this
//     value — retrying it unchanged cannot ever succeed. It is now recorded
//     and not retried until the value itself changes. 5xx and offline are
//     transient and back off instead of hammering.
//   · A BLOB WITH NO CEILING ON ITS WAY OUT. Date-keyed stores now drop their
//     OLDEST nights until what is left fits, and only for the copy that goes
//     to the account — the device keeps every night it has, which rule 1 of
//     this file requires. An account that holds your last few weeks is worth
//     having; an account that holds nothing because the payload was 40 bytes
//     too big is not.
//
// The cap is the route's own MAX_VALUE_BYTES. If it moves there, move it here
// — they are two halves of one contract and a client that guesses low just
// silently stops syncing.
const MAX_SYNC_BYTES = 128 * 1024

// How long a transient failure (5xx, offline) parks a key. Doubling, capped —
// a server having a bad minute must not be met with a tighter loop.
const BACKOFF_MIN_MS = 60000
const BACKOFF_MAX_MS = 30 * 60000

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

export function registerSyncedKey(key, { strategy = 'newerWins', event = null, dateMap = false } = {}) {
  REGISTRY.set(key, { strategy: STRATEGIES[strategy] ? strategy : 'newerWins', event, dateMap })
}

/**
 * The copy of a value that goes to the ACCOUNT, which is not always the whole
 * of the copy on the device.
 *
 * Only date-keyed stores can be shrunk, and only by dropping whole nights
 * oldest-first, because that is the one trim that cannot corrupt a value —
 * mergeDateMap already treats a missing night as "the other side's night" and
 * unions it back. Every other shape is all-or-nothing: a half-sent watchlist
 * is worse than an unsent one.
 *
 * Returns { value, raw, bytes, dropped } or null when nothing can be made to
 * fit, which the caller records as a permanent refusal rather than a retry.
 */
function forWire(key, value) {
  const raw = JSON.stringify(value)
  const bytes = byteLength(raw)
  if (bytes <= MAX_SYNC_BYTES) return { value, raw, bytes, dropped: 0 }

  const entry = REGISTRY.get(key)
  // my_picks_v1 and nfl_my_picks_v1 are { slates: {...}, ledger: {...} };
  // watch_ledger_v1 is a bare date map. Both shapes are handled, and anything
  // that is neither is refused rather than guessed at.
  if (!entry?.dateMap || !isObj(value)) return null

  const isNested = isObj(value.slates) || isObj(value.ledger)
  const buckets = isNested
    ? ['slates', 'ledger'].filter((k) => isObj(value[k]))
    : [null]
  if (!buckets.length) return null

  // Every dated night in the value, oldest first, tagged with its bucket.
  const nights = []
  buckets.forEach((b) => {
    const map = b ? value[b] : value
    Object.keys(map).forEach((d) => nights.push({ bucket: b, date: d }))
  })
  nights.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const clone = isNested
    ? { ...value, ...Object.fromEntries(buckets.map((b) => [b, { ...value[b] }])) }
    : { ...value }
  let dropped = 0
  for (const n of nights) {
    // Never send the store down to nothing. If the newest night alone is over
    // the cap the value is unsyncable and saying so beats shipping an empty
    // account over the top of a real one.
    if (dropped >= nights.length - 1) return null
    if (n.bucket) delete clone[n.bucket][n.date]
    else delete clone[n.date]
    dropped += 1
    const nextRaw = JSON.stringify(clone)
    const nextBytes = byteLength(nextRaw)
    if (nextBytes <= MAX_SYNC_BYTES) return { value: clone, raw: nextRaw, bytes: nextBytes, dropped }
  }
  return null
}

/** UTF-8 bytes, the same unit Buffer.byteLength gives the route. */
function byteLength(str) {
  try { return new TextEncoder().encode(str).length } catch { return str.length * 2 }
}

// The keys the site syncs today. Everything else in localStorage — theme,
// palette, the nav's saved position, quiet mode — is deliberately NOT here:
// those describe this device, and following you onto another one would be a
// bug, not a feature.
registerSyncedKey('dash_follow_v1', { strategy: 'mergeStamped', event: 'dash-follow-change' })
registerSyncedKey('mlb_watchlist_v1', { strategy: 'newerWins' })
registerSyncedKey('tuddy_watchlist_v1', { strategy: 'newerWins', event: 'tuddy-watchlist-change' })
registerSyncedKey('my_picks_v1', { strategy: 'mergeDateMap', dateMap: true })
registerSyncedKey('nfl_my_picks_v1', { strategy: 'mergeDateMap', dateMap: true })
registerSyncedKey('watch_ledger_v1', { strategy: 'mergeDateMap', dateMap: true })
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

let account = { ready: false, signedIn: false, configured: false, who: null }
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

  account = { ready: true, signedIn: Boolean(payload?.signedIn), configured: Boolean(payload?.configured), who: payload?.who || null }
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
    // ONLY PUSH WHAT THIS DEVICE HAS NOT ALREADY PUSHED.
    //
    // "merged differs from remote" alone is a loop as soon as the upload is
    // ever trimmed to fit (see forWire): the account holds the short copy, the
    // device holds the long one, the merge is the long one, and it differs
    // from remote on every single poll — forever, at up to the cap each time.
    // The fingerprint of the last successful push is the thing that actually
    // answers "is there something new to say", and it is what scan() has
    // always used.
    if (mergedRaw !== JSON.stringify(remote.value) && meta()[key]?.pushed !== fingerprint(mergedRaw)) {
      await push(key, merged)
    }
  }
  return true
}

function writeLocal(key, value, at) {
  const raw = JSON.stringify(value)
  try { localStorage.setItem(key, raw) } catch { return }
  setMeta(key, { at: at || Date.now(), pushed: fingerprint(raw) })
  announce(key)
}

/**
 * Give up on this exact value, permanently.
 *
 * Stamping the fingerprint of the value that FAILED is the whole fix: scan()
 * compares against it and stops, and the moment the device changes the value
 * the fingerprint differs again and the next push goes out on its own. No
 * flag to clear, no state to get stuck in — the retry resumes exactly when
 * there is something new to say.
 */
function refuse(key, localRaw, why) {
  setMeta(key, { pushed: fingerprint(localRaw), refused: why, refusedAt: Date.now(), backoff: 0 })
}

/** Park a key for a while after a transient failure, doubling each time. */
function backOff(key) {
  const prev = Number(meta()[key]?.backoff) || 0
  const next = Math.min(BACKOFF_MAX_MS, prev ? prev * 2 : BACKOFF_MIN_MS)
  setMeta(key, { backoff: next, backoffUntil: Date.now() + next })
}

async function push(key, value) {
  if (!account.signedIn) return
  const localRaw = JSON.stringify(value)
  const at = Date.now()

  // MEASURE BEFORE OPENING A SOCKET. The route reads the entire body before it
  // can answer 413, so an oversized push costs full bandwidth to be told no —
  // which is how one browser tab moved a gigabyte a day. See the note at the
  // top of this file.
  const wire = forWire(key, value)
  if (!wire) {
    refuse(key, localRaw, 'too-large')
    return
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key, value: wire.value, updatedAt: new Date(at).toISOString() }),
    })
    if (!res.ok) {
      // A 4xx is a verdict about THIS VALUE and repeating it cannot change the
      // answer. A 5xx is the server having a moment, and gets a widening
      // pause rather than a tighter loop.
      if (res.status >= 400 && res.status < 500) refuse(key, localRaw, `http-${res.status}`)
      else backOff(key)
      return
    }
    const body = await res.json()
    if (!body?.signedIn) { account = { ...account, signedIn: false, who: null }; emitAccount(); return }
    // The server returns whatever ended up stored. If another device won the
    // race, that is the copy this device should be holding.
    //
    // Compared against the WIRE copy, not the device copy: when this push was
    // trimmed to fit, the two differ by the nights that were left at home, and
    // treating that as "the server won" would delete this device's own
    // history to match a deliberately shorter upload.
    const storedRaw = JSON.stringify(body.value)
    if (storedRaw !== wire.raw) {
      writeLocal(key, body.value, new Date(body.updatedAt || at).getTime())
      return
    }
    // Stamp the DEVICE copy's fingerprint. scan() reads localStorage, so
    // stamping the trimmed copy would leave it looking dirty forever — the
    // same shape of bug this whole change exists to kill.
    setMeta(key, { at, pushed: fingerprint(localRaw), refused: null, backoff: 0, backoffUntil: 0 })
  } catch {
    // Offline. Back off rather than retry every tick — a laptop closed on a
    // plane should not wake up having queued a thousand attempts.
    backOff(key)
  }
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
  const now = Date.now()
  for (const key of REGISTRY.keys()) {
    let raw
    try { raw = localStorage.getItem(key) } catch { continue }
    if (raw === null) continue
    if (stamps[key]?.pushed === fingerprint(raw)) continue
    // A key parked by a transient failure waits its turn. The fingerprint
    // check above still governs everything else, so a key whose value changes
    // during the pause is not lost — it goes out when the pause ends.
    const until = Number(stamps[key]?.backoffUntil) || 0
    if (until > now) continue
    let value
    try { value = JSON.parse(raw) } catch { continue }
    setMeta(key, { at: now })
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
  // A HIDDEN TAB SYNCS NOTHING. The interval fired every 45 seconds whether or
  // not anybody was looking, so a browser left open on a background tab for a
  // week kept a poll and a push running the whole time. visibilitychange below
  // already catches up the moment the tab comes back, which is the only moment
  // being caught up matters.
  const poll = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    scan()
    pull()
  }, POLL_MS)
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
