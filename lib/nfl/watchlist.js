'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { follow, unfollow } from '../dash/follow'
import { markDirty } from '../dash/sync'

const KEY = 'tuddy_watchlist_v1'
const EVENT = 'tuddy-watchlist-change'

// ── THE WEEK BUCKET IS GONE (2026-08-28) ─────────────────────────────────────
//
// Donovan: "the days arent keeping track." This is where football's half of
// that came from. Pins were stored under `slateKey(data)` — season:mode:week —
// so the list was not persisting badly, it was persisting into a bucket the
// site stopped reading the moment the week rolled. Preseason → Week 1 emptied
// it. Week 1 → Week 2 emptied it again.
//
// Pins now live in ONE list, and the slate details on each pin (game, kickoff,
// opponent) are refreshed from whatever slate is loaded rather than being the
// thing that files it. Old week-bucketed stores are migrated on first read —
// union of every bucket, newest week's copy of a player winning — so nobody
// loses the list they had.
//
// Starring also FOLLOWS the player (lib/dash/follow.js), which is the durable,
// account-synced half of the same intent: the pin is about this slate, the
// follow is about the man.

const LIST = 'pins'

// Reads the store and migrates any legacy week buckets into the flat list.
function read() {
  let raw
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return { [LIST]: [] } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { [LIST]: [] }
  if (Array.isArray(raw[LIST])) return { [LIST]: raw[LIST] }

  // Legacy: { 'season:mode:week': [rows] }. Later keys win a duplicate player,
  // because a later week's pin carries the fresher team/opponent.
  const merged = new Map()
  Object.keys(raw).sort().forEach((bucket) => {
    if (!Array.isArray(raw[bucket])) return
    raw[bucket].forEach((row) => { if (row?.player_id) merged.set(String(row.player_id), row) })
  })
  return { [LIST]: [...merged.values()] }
}

function write(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
    window.dispatchEvent(new Event(EVENT))
  } catch {}
  markDirty()
}

export function slateKey(data) {
  return [data?.season || 'nfl', data?.mode || 'week', data?.week ?? data?.label ?? 'slate'].join(':')
}

function pinFromFreshSlate(data, player) {
  const game = (data?.games || []).find((row) => row.away === player.team || row.home === player.team)
  return {
    player_id: String(player.player_id), name: player.name, team: player.team,
    opp: player.opp, position: player.position, game_id: game?.game_id || null,
    away: game?.away || null, home: game?.home || null, kickoff: game?.kickoff || null,
  }
}

export function toggleWatch(data, player) {
  if (!player?.player_id) return false
  const store = read()
  const rows = store[LIST] || []
  const index = rows.findIndex((row) => String(row.player_id) === String(player.player_id))
  let pinned
  if (index >= 0) {
    rows.splice(index, 1)
    pinned = false
    // Un-pinning is about this slate. The follow is about the man, and only
    // the Following list itself removes him — see lib/dash/follow.js.
  } else {
    rows.push(pinFromFreshSlate(data, player))
    pinned = true
    follow('nfl', { id: player.player_id, name: player.name, team: player.team, position: player.position })
  }
  store[LIST] = rows
  write(store)
  return pinned
}

/** Drop a pin AND stop following — the Following list's own remove action. */
export function dropWatch(playerId) {
  const store = read()
  store[LIST] = (store[LIST] || []).filter((row) => String(row.player_id) !== String(playerId))
  write(store)
  unfollow('nfl', playerId)
}

export function useNflWatchlist(data) {
  const [store, setStore] = useState({})
  useEffect(() => {
    const sync = () => setStore(read())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    window.addEventListener('dash-follow-change', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('dash-follow-change', sync)
    }
  }, [])
  // ── #25: THE REBUILD WAS DOCUMENTED AND NEVER RAN ────────────────────────
  //
  // Dak Prescott's card read "QB · vs NYG" in the header and "NO @ DAL · Fri
  // 5:00 PM" in the footer of the same card. The header comes from the fresh
  // slate row; the footer came from the pin. The note at the top of this file
  // says the slate details on a pin "are refreshed from whatever slate is
  // loaded rather than being the thing that files it" -- true of the intent,
  // false of the code: pinFromFreshSlate() only ever ran at PIN time, and this
  // hook handed the stored row straight back. A pin made in preseason kept its
  // preseason opponent, kickoff and game id forever.
  //
  // Rebuilt here, where the slate is in hand. A pin whose player is not on the
  // loaded slate keeps what it had and is marked `stale` so the UI can say so
  // rather than printing last week's game as though it were this week's.
  const pins = useMemo(() => {
    const rows = store[LIST] || []
    const players = data?.players
    if (!Array.isArray(players) || !players.length) return rows
    const byId = new Map(players.map((p) => [String(p.player_id), p]))
    return rows.map((row) => {
      const player = byId.get(String(row.player_id))
      if (!player) return { ...row, stale: true }
      return { ...pinFromFreshSlate(data, player), stale: false }
    })
  }, [store, data])
  const isPinned = useCallback((playerId) => pins.some((row) => String(row.player_id) === String(playerId)), [pins])
  const toggle = useCallback((player) => toggleWatch(data, player), [data])
  return { pins, isPinned, toggle }
}

