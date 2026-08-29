'use client'

// ⭐ FOLLOWING — the list that outlives the night.
//
// 2026-08-28, Donovan: "watch list data after as the days arent keeping
// track." That is not a bug in the watchlist; it is the watchlist working as
// designed, and the design was half an idea.
//
// The MLB star is GAME-SCOPED on purpose. components/Dashboard.js prunes it
// against tonight's published board every load, and the comment there explains
// why in detail (2026-08-11: a name starred last night rendered carrying last
// night's opponent, starter and line, and worse, its composite
// `${player_id}-${game_pk}` key could never match tonight's row for the same
// hitter). The NFL star had the same shape a different way: lib/nfl/watchlist
// buckets pins under `season:mode:week`, so every Tuesday the list looked
// empty. Both are correct about TONIGHT and both throw away the only thing a
// person actually meant by starring a name — that they want to keep seeing
// him.
//
// So there are two lists now, and they answer different questions:
//
//   · THE STAR (unchanged) — "who am I watching on this slate." Game-scoped,
//     pruned nightly, carries the row. Nothing about it changes here.
//   · FOLLOWING (this file) — "whose name do I want back tomorrow." A player
//     and nothing else: no game, no line, no date. Never pruned by a slate,
//     synced to your account (lib/dash/sync.js), and re-lit as a star
//     automatically whenever a followed man turns up on tonight's board.
//
// Starring follows. Un-starring on the slate does NOT unfollow — those are
// different intents, and conflating them is how the first version lost names.
// Unfollow is its own action, on the Following list itself.
//
// TOMBSTONES, because this syncs. Two devices merging by union resurrect every
// deletion: unfollow on the phone, and the laptop's stale copy hands him back
// on its next push. So a removal is stored as a dated fact — `removed: true`
// with its own `at` — and the newest statement about a player wins. Tombstones
// are pruned after they can no longer lose a merge (TOMBSTONE_TTL below).

import { useCallback, useEffect, useMemo, useState } from 'react'

import { markDirty } from './sync'

const KEY = 'dash_follow_v1'
const EVENT = 'dash-follow-change'
const CAP = 300
// A tombstone only has to outlive the staleness of another device's copy. Any
// device that has not synced in ninety days is going to lose to the account's
// copy on its next pull anyway.
const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000

export const followKey = (sport, playerId) => `${sport === 'nfl' ? 'nfl' : 'mlb'}:${playerId}`

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch { return {} }
}

function write(store) {
  const now = Date.now()
  const entries = Object.entries(store)
    .filter(([, row]) => !(row?.removed && now - (Number(row.at) || 0) > TOMBSTONE_TTL))
    .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
    .slice(0, CAP)
  const out = {}
  entries.forEach(([k, v]) => { out[k] = v })
  try { localStorage.setItem(KEY, JSON.stringify(out)) } catch { /* quota */ }
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* ignore */ }
  markDirty()
  return out
}

/**
 * A followed player, reduced to what survives a slate.
 *
 * Deliberately NOT storing the row: opponent, starter, line and score are all
 * facts about one night, and a stored copy of them is exactly the stale card
 * the 08-11 prune was written to stop. Everything a followed name needs to
 * render is looked up against tonight's board when tonight's board exists.
 */
function entryFrom(sport, player) {
  return {
    sport: sport === 'nfl' ? 'nfl' : 'mlb',
    id: String(player.id),
    name: player.name || '',
    team: player.team || '',
    position: player.position || '',
    at: Date.now(),
  }
}

export function isFollowed(store, sport, playerId) {
  const row = store[followKey(sport, playerId)]
  return Boolean(row && !row.removed)
}

export function follow(sport, player) {
  if (!player?.id) return read()
  const store = read()
  store[followKey(sport, player.id)] = entryFrom(sport, player)
  return write(store)
}

export function unfollow(sport, playerId) {
  if (!playerId) return read()
  const store = read()
  const key = followKey(sport, playerId)
  const existing = store[key]
  if (!existing) return store
  store[key] = { ...existing, removed: true, at: Date.now() }
  return write(store)
}

export function toggleFollow(sport, player) {
  const on = isFollowed(read(), sport, player?.id)
  if (on) { unfollow(sport, player?.id); return false }
  follow(sport, player)
  return true
}

/** Live rows, newest first, tombstones excluded. */
export function followedRows(store, sport = null) {
  return Object.values(store)
    .filter((row) => row && !row.removed && (!sport || row.sport === sport))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
}

export function useFollowing(sport = null) {
  const [store, setStore] = useState({})
  useEffect(() => {
    const sync = () => setStore(read())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const rows = useMemo(() => followedRows(store, sport), [store, sport])
  const ids = useMemo(() => new Set(rows.map((row) => String(row.id))), [rows])
  const following = useCallback((playerId) => ids.has(String(playerId)), [ids])
  const toggle = useCallback((player) => toggleFollow(sport || player?.sport || 'mlb', player), [sport])
  const drop = useCallback((playerId) => unfollow(sport || 'mlb', playerId), [sport])

  return { rows, ids, following, toggle, unfollow: drop, count: rows.length }
}
