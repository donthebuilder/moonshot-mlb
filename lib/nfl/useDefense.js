'use client'
import { useEffect, useMemo, useState } from 'react'
import { fetchNfl, nflMatchupExtraPaths, nflDisruptionLooksReal, nflRosterPaths } from './dataSource'
import { joinDefenders } from './defStats'
import { tagBook } from './tags'

// THE DEFENSE READERS, CLIENT SIDE (2026-10-10). Each one is a plain GET behind a module-level cache, so ten
// components on one page cost one request:
//   useTurnovers()          /api/nfl/defense                the league's offensive turnover lines (the player tags)
//   useTeamDefense(teams)   /api/nfl/defense?team=ATL,DAL   those clubs' defenders: season sums and a game log
//   useDisruption()         nfl_matchup_extra.json          the bot's defender table (forced fumbles, group percentiles)
//   useTagBook(matchup)     the tag registry (lib/nfl/tags.js) over the matchup file and the turnover lines
// A failed read is `null` and the surface says "not loaded"; nothing here invents a number.
const TTL = 10 * 60 * 1000
const CACHE = new Map()
function once(key, load) {
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.p
  const p = load().catch(() => null)
  CACHE.set(key, { at: Date.now(), p })
  // a failure is not remembered for ten minutes
  p.then((v) => { if (v == null && CACHE.get(key)?.p === p) CACHE.delete(key) })
  return p
}
const getJSON = (url) => once(url, () => fetch(url).then((r) => (r.ok ? r.json() : null)))

function useLoaded(load, deps) {
  const [state, setState] = useState({ data: null, done: false })
  useEffect(() => {
    let alive = true
    setState((s) => (s.done ? { data: s.data, done: false } : s))
    Promise.resolve(load()).then((d) => { if (alive) setState({ data: d ?? null, done: true }) }).catch(() => { if (alive) setState({ data: null, done: true }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

/** The league's offensive turnover lines, or null while loading / unavailable. */
export function useTurnovers(enabled = true) {
  const { data } = useLoaded(() => (enabled ? getJSON('/api/nfl/defense') : null), [enabled])
  return data?.available ? data : null
}

/** Defenders of up to four clubs: { data, done } where data = the route's payload (players keyed by ESPN id). */
export function useTeamDefense(teams) {
  const key = (teams || []).filter(Boolean).map((t) => String(t).toUpperCase()).sort().join(',')
  const { data, done } = useLoaded(() => (key ? getJSON(`/api/nfl/defense?team=${key}`) : null), [key])
  return { data: data?.available ? data : null, done: key ? done : true }
}

/** The bot's defender table: { [gsis]: { name, team, position, pos_group, games, stats, percentiles, grade } } or null. */
export function useDisruption(enabled = true) {
  const { data } = useLoaded(() => (enabled ? once('disruption', () => fetchNfl(nflMatchupExtraPaths(), nflDisruptionLooksReal)) : null), [enabled])
  return data?.disruption || null
}

/** nfl_roster.json's players (gsis_id, espn_id, name, team, position, status_word), or null. */
export function useRoster(enabled = true) {
  const { data } = useLoaded(() => (enabled ? once('roster', () => fetchNfl(nflRosterPaths(), (j) => Array.isArray(j?.players) && j.players.length > 0)) : null), [enabled])
  return data?.players || null
}

/**
 * One club's defenders, joined (lib/nfl/defStats.js joinDefenders): { rows, unplaced, season, games, partial, loading, failed }.
 * `rows` is empty with `failed` true when neither the bot table nor the box scores could be read.
 */
export function useDefenders(team) {
  const roster = useRoster(Boolean(team))
  const disruption = useDisruption(Boolean(team))
  const { data: box, done } = useTeamDefense(team ? [team] : [])
  return useMemo(() => {
    if (!team) return { rows: [], unplaced: 0, loading: false, failed: false }
    const j = joinDefenders({ team, roster: roster || [], disruption: disruption || {}, box: box?.players || {} })
    const loading = !done || (roster == null && disruption == null)
    return {
      ...j, loading, failed: done && !box && !disruption, season: box?.season ?? null, games: box?.team_games?.[team] ?? null,
      partial: Boolean(box?.partial), missing: box?.missing ?? 0, boxLoaded: Boolean(box), botLoaded: Boolean(disruption), boxPlayers: box?.players || {},
    }
  }, [team, roster, disruption, box, done])
}

/** The tag book over the (blended) matchup payload and, once loaded, the season's turnover lines. */
export function useTagBook(matchup, slateSeason = null, { turnovers = true } = {}) {
  const lines = useTurnovers(turnovers)
  return useMemo(() => tagBook({ matchup, turnovers: lines, slateSeason }), [matchup, lines, slateSeason])
}
