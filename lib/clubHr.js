'use client'
import { useEffect, useState } from 'react'
import { teamAbbrs, seasonYear } from './gamelogs'
import { clubTable } from './teamHr'

// The league table the TEAM MODEL reads (lib/teamHr.js): every club's season
// home runs and plate appearances, one StatsAPI call for all thirty (the same
// endpoint family lib/leagueRates.js already reads). Cached for six hours;
// season rates move slowly. Null until it arrives, or when it comes back
// incomplete -- the callers then print nothing rather than a number built on a
// guess.
const URL_ = (yr) => `https://statsapi.mlb.com/api/v1/teams/stats?season=${yr}&group=hitting&stats=season`
  + '&sportIds=1&fields=stats,splits,team,id,stat,homeRuns,plateAppearances,gamesPlayed'
const TTL = 6 * 60 * 60 * 1000

let _cache = null
let _at = 0
let _inflight = null

export function loadClubHr() {
  if (_cache && Date.now() - _at < TTL) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = Promise.all([
    fetch(URL_(seasonYear())).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    teamAbbrs().catch(() => null),
  ]).then(([j, abbrs]) => {
    const t = clubTable(j?.stats?.[0]?.splits || [], abbrs || {})
    if (t) { _cache = t; _at = Date.now() }
    return t || _cache
  }).finally(() => { _inflight = null })
  return _inflight
}

/** The club table, or null while it loads. */
export function useClubHr() {
  const [t, setT] = useState(_cache)
  useEffect(() => {
    let alive = true
    loadClubHr().then((x) => { if (alive && x) setT(x) })
    return () => { alive = false }
  }, [])
  return t
}
