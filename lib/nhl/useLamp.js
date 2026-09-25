'use client'
// 🏒 LAMP's readers — one hook per app/api/lamp route, all the same shape:
//   { data, error, loading, refresh, at }
//
// POLLING ONLY WHEN IT BUYS SOMETHING (project rule 26). Scores poll every
// 30 s while a game is live, every 2 min while a game is inside the hour
// before puck drop (so the page flips to live on its own), and not at all on
// a day with nothing on. A hidden tab stops after its current tick and
// re-fetches the moment it is visible again — same discipline as
// lib/nfl/useNflLive.js. Standings and schedule never poll; they refetch on
// a date change and when the tab becomes visible after ten minutes away.
//
// ERRORS ARE A STATE, NOT A BLANK. `error` is the route's own reason
// ('LIVE DATA DELAYED') or the fetch failure; the last good `data` stays on
// screen under a banner rather than vanishing. A blank page during a goal
// rush is the failure this hook exists to prevent.
import { useCallback, useEffect, useRef, useState } from 'react'

const STALE_REFETCH_MS = 10 * 60 * 1000

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' })
  let body = null
  try { body = await res.json() } catch { /* fall through */ }
  if (!res.ok) {
    const err = new Error(body?.error || `${res.status}`)
    err.status = res.status
    err.detail = body?.detail || ''
    throw err
  }
  return body
}

/**
 * Generic reader. `pollMs(data)` returns the interval for the NEXT tick
 * given the latest payload, or 0 for "don't".
 */
function useLampFetch(url, { pollMs = () => 0, enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && url))
  const [at, setAt] = useState(0)
  const alive = useRef(true)
  const timer = useRef(null)
  const latest = useRef(null)
  const atRef = useRef(0)

  const load = useCallback(async () => {
    if (!url || !enabled) return null
    try {
      const j = await getJSON(url)
      if (!alive.current) return null
      latest.current = j
      atRef.current = Date.now()
      setData(j); setError(null); setAt(atRef.current)
      return j
    } catch (e) {
      if (!alive.current) return null
      setError({ message: e.message || 'LIVE DATA DELAYED', detail: e.detail || '', status: e.status || 0 })
      return null
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [url, enabled])

  useEffect(() => {
    alive.current = true
    setLoading(Boolean(enabled && url))
    setData(null); setError(null); latest.current = null; atRef.current = 0
    let cancelled = false
    const schedule = (j) => {
      clearTimeout(timer.current)
      const ms = pollMs(j)
      if (!ms || cancelled) return
      timer.current = setTimeout(async () => {
        if (typeof document !== 'undefined' && document.hidden) { schedule(latest.current); return }
        const next = await load()
        schedule(next || latest.current)
      }, ms)
    }
    load().then((j) => schedule(j))
    const onVis = () => {
      if (typeof document === 'undefined' || document.hidden) return
      // Back after a while, or mid-poll: refresh now rather than wait it out.
      const stale = Date.now() - (atRef.current || 0) > STALE_REFETCH_MS
      if (stale || pollMs(latest.current)) load().then((j) => schedule(j || latest.current))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true; alive.current = false
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, load])

  return { data, error, loading, refresh: load, at }
}

const HOUR = 60 * 60 * 1000
/** 30 s live · 2 min inside the hour before a puck drop · otherwise nothing. */
export function scoresPollMs(day) {
  if (!day?.games?.length) return 0
  if (day.live > 0) return 30000
  const now = Date.now()
  const soon = day.games.some((g) => g.state === 'pre' && g.startUtc && (Date.parse(g.startUtc) - now) < HOUR && (Date.parse(g.startUtc) - now) > -HOUR)
  return soon ? 120000 : 0
}

export function useLampScores(date) {
  const url = date ? `/api/lamp/scores?date=${encodeURIComponent(date)}` : '/api/lamp/scores'
  return useLampFetch(url, { pollMs: scoresPollMs })
}

export function useLampSchedule(date) {
  const url = date ? `/api/lamp/schedule?date=${encodeURIComponent(date)}` : '/api/lamp/schedule'
  return useLampFetch(url)
}

export function useLampStandings() {
  return useLampFetch('/api/lamp/standings')
}

/** A game polls at 30 s only while it is live. */
export function useLampGame(id) {
  const ok = /^\d{10}$/.test(String(id || ''))
  return useLampFetch(ok ? `/api/lamp/game?id=${id}` : null, {
    enabled: ok,
    pollMs: (g) => (g?.state === 'live' ? 30000 : 0),
  })
}

// ── batch 2 ─────────────────────────────────────────────────────────────────
export function useLampTeam(abbrev) {
  const ok = /^[A-Za-z]{3}$/.test(String(abbrev || ''))
  return useLampFetch(ok ? `/api/lamp/team?team=${String(abbrev).toUpperCase()}` : null, { enabled: ok })
}
export function useLampPlayer(id) {
  const ok = /^\d{7}$/.test(String(id || ''))
  return useLampFetch(ok ? `/api/lamp/player?id=${id}` : null, { enabled: ok })
}
export function useLampPlayers() { return useLampFetch('/api/lamp/players') }
export function useLampLeaders() { return useLampFetch('/api/lamp/leaders') }
