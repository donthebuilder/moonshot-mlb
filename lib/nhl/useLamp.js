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
  // THE URL STILL BEING ASKED FOR (2026-09-27, audit 00A finding 1, P0). One
  // `alive` flag served every url, and the effect for the NEW date set it back
  // to true -- so a slow response for the old date landed after the new one
  // and replaced it: URL and header said Fri Sep 25, the board showed Sat Sep
  // 26's games. A response is kept only if it is for the url still current.
  const current = useRef(url)

  const load = useCallback(async () => {
    if (!url || !enabled) return null
    const stale = () => !alive.current || current.current !== url
    try {
      const j = await getJSON(url)
      if (stale()) return null
      latest.current = j
      atRef.current = Date.now()
      setData(j); setError(null); setAt(atRef.current)
      return j
    } catch (e) {
      if (stale()) return null
      setError({ message: e.message || 'LIVE DATA DELAYED', detail: e.detail || '', status: e.status || 0 })
      return null
    } finally {
      if (!stale()) setLoading(false)
    }
  }, [url, enabled])

  useEffect(() => {
    alive.current = true
    current.current = url
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

/** A picked day's scores, or nothing at all when no day is picked (the shell
 *  already holds today's; one fetch per day, not two). */
export function useLampScoresOn(date) {
  return useLampFetch(date ? `/api/lamp/scores?date=${encodeURIComponent(date)}` : null, { pollMs: scoresPollMs })
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
/** Every skater's and goalie's season line, for the table under Leaders. */
export function useLampSeasonStats() { return useLampFetch('/api/lamp/seasonstats') }
/** Power play and penalty kill, all 32 clubs (lamp research step 2). */
export function useLampSpecialTeams() { return useLampFetch('/api/lamp/specialteams') }
/** Every skater's last 5 / last 10 games beside his season rate (Hot sticks). */
export function useLampHotSticks() { return useLampFetch('/api/lamp/hotsticks') }
/** For-fun numerology for a night's dressed skaters (lamp research step 5). */
export function useLampNumerology(date) { return useLampFetch(date ? `/api/lamp/numerology?date=${encodeURIComponent(date)}` : '/api/lamp/numerology') }
/** The Lamp Ledger: one night (date null = the latest graded), or a season window when `days` is set. */
export function useLampLedger({ date = null, days = null, enabled = true } = {}) {
  const url = days ? `/api/lamp/ledger?days=${days}` : date ? `/api/lamp/ledger?date=${encodeURIComponent(date)}` : '/api/lamp/ledger'
  return useLampFetch(url, { enabled })
}
/** Where a player or a club shoots from (lamp research step 3). `sel` = { player } | { team } | null. */
export function useLampShots(sel) {
  const url = sel?.player ? `/api/lamp/shots?player=${encodeURIComponent(sel.player)}` : sel?.team ? `/api/lamp/shots?team=${encodeURIComponent(sel.team)}` : sel?.against ? `/api/lamp/shots?against=${encodeURIComponent(sel.against)}` : null
  return useLampFetch(url, { enabled: Boolean(url) })
}

/** The shot map season's goalies (for the goalie picker, BATCH-3D-V2 1h). */
export function useLampGoalies(season, enabled = true) {
  return useLampFetch(season ? `/api/lamp/goalies?season=${season}` : null, { enabled: Boolean(season && enabled) })
}
/** One goalie's zones beside the league's; { available: false } until its SQL runs. */
export function useLampGoalieZones(goalie, season) {
  const url = goalie && season ? `/api/lamp/goaliezones?goalie=${encodeURIComponent(goalie)}&season=${season}` : null
  return useLampFetch(url, { enabled: Boolean(url) })
}
/** His (or the club's) shot speed from NHL EDGE, for the shot map's season.
 *  Read once when the map opens (BATCH-3D-V2 1g) -- no poll. A club 'against'
 *  view has no single shooter, so it asks for nothing. */
export function useLampShotSpeed(sel, season) {
  const url = !season ? null : sel?.player ? `/api/lamp/shotspeed?player=${encodeURIComponent(sel.player)}&season=${season}`
    : sel?.team ? `/api/lamp/shotspeed?team=${encodeURIComponent(sel.team)}&season=${season}` : null
  return useLampFetch(url, { enabled: Boolean(url) })
}

// ── batch 3: the board and its record ───────────────────────────────────────
/** Tonight's board. Polls every 2 min until every game has locked, then stops. */
export function useLampBoard(date, market = 'GOAL') {
  const q = [date ? `date=${encodeURIComponent(date)}` : null, market && market !== 'GOAL' ? `market=${encodeURIComponent(market)}` : null].filter(Boolean).join('&')
  const url = q ? `/api/lamp/board?${q}` : '/api/lamp/board'
  return useLampFetch(url, { pollMs: (b) => (b?.games?.some((g) => !g.locked && g.game.state === 'pre') ? 120000 : 0) })
}
/** Tonight's GOAL board, read once -- no poll (the player card's header,
 *  2026-09-28: it needs his row, not a live refresh; the Board tab polls). */
export function useLampBoardOnce(date = null) {
  return useLampFetch(date ? `/api/lamp/board?date=${encodeURIComponent(date)}` : '/api/lamp/board')
}
/** The graded record. `pre` includes preseason nights (the route leaves them
 *  out by default); `enabled:false` skips the fetch. */
export function useLampRecord(days = 30, { pre = false, enabled = true } = {}) { return useLampFetch(`/api/lamp/record?days=${days}${pre ? '&pre=1' : ''}`, { enabled }) }
