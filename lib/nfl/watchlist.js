'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const KEY = 'tuddy_watchlist_v1'
const EVENT = 'tuddy-watchlist-change'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

function write(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); window.dispatchEvent(new Event(EVENT)) } catch {}
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
  const store = read(); const key = slateKey(data); const rows = store[key] || []
  const index = rows.findIndex((row) => String(row.player_id) === String(player.player_id))
  let pinned
  if (index >= 0) { rows.splice(index, 1); pinned = false } else { rows.push(pinFromFreshSlate(data, player)); pinned = true }
  if (rows.length) store[key] = rows; else delete store[key]
  write(store)
  return pinned
}

export function useNflWatchlist(data) {
  const key = slateKey(data)
  const [store, setStore] = useState({})
  useEffect(() => {
    const sync = () => setStore(read())
    sync(); window.addEventListener(EVENT, sync); window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const pins = useMemo(() => store[key] || [], [store, key])
  const isPinned = useCallback((playerId) => pins.some((row) => String(row.player_id) === String(playerId)), [pins])
  const toggle = useCallback((player) => toggleWatch(data, player), [data])
  return { pins, isPinned, toggle }
}

