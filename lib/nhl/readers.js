// LAMP's league reads, one function each, shared by the JSON routes the tabs
// fetch (app/api/lamp/*) and the crawlable server pages (app/nhl/*) -- one
// read, two faces, so a page and its tab can't disagree. Moved out of the
// route files 2026-09-26; the routes' JSON is unchanged.
import { skaterLeaders, goalieLeaders, standingsNow, standingsSeasons, rosterFor } from './api'
import { reduceLeaders, reduceStandings, reduceStandingsSeasons, reduceRoster, seasonLabel } from './reduce'
import { previousSeasonId } from './season'
import { whichSeason } from './whichSeason'
import { NHL_TEAMS } from './teams'

const SKATER_CATS = ['goals', 'assists', 'points', 'plusMinus', 'toi', 'penaltyMins', 'faceoffLeaders']
const GOALIE_CATS = ['wins', 'savePctg', 'goalsAgainstAverage', 'shutouts']
const LIMIT = 10

async function leadersFor(season) {
  const [s, g] = await Promise.all([skaterLeaders(season, 2, SKATER_CATS, LIMIT), goalieLeaders(season, 2, GOALIE_CATS, LIMIT)])
  return { skaters: reduceLeaders(s), goalies: reduceLeaders(g) }
}

/**
 * Skater and goalie leaders for the ACTIVE season, regular season, ten deep.
 * A 404 for the active season (no games yet) falls back to last season and
 * says so with `stale`.
 */
export async function readLeaders() {
  const season = await whichSeason()
  if (!season.id) throw new Error('no season from standings-season')
  let used = season.id; let stale = season.stale; let data
  try {
    data = await leadersFor(used)
  } catch (e) {
    if (e?.status !== 404 || season.stale) throw e
    used = previousSeasonId(season.id); stale = true
    data = await leadersFor(used)
  }
  return { ...data, season: used, seasonLabel: seasonLabel(used), stale, current: season.current, opens: season.opens }
}

/** standings/now, labelled with the season the rows belong to and the one
 *  that should be current (preseason: last season's final table). */
export async function readStandings() {
  const [raw, seasons] = await Promise.all([standingsNow(), standingsSeasons().catch(() => null)])
  const table = reduceStandings(raw)
  const { current } = seasons ? reduceStandingsSeasons(seasons) : { current: null }
  const stale = Boolean(current && table.seasonId && table.seasonId < current.id)
  return { ...table, current, stale }
}

/** Every player on every current roster; clubs whose call failed are named
 *  in `missing` rather than failing the list. */
export async function readRosters() {
  const missing = []
  const lists = await Promise.all(NHL_TEAMS.map(([abbrev]) =>
    rosterFor(abbrev).then((p) => reduceRoster(p, abbrev)).catch((e) => { console.error(`[lamp] roster ${abbrev}: ${e?.message}`); missing.push(abbrev); return [] })))
  if (missing.length === NHL_TEAMS.length) throw new Error('every roster call failed')
  const players = lists.flat().map((r) => ({ id: r.id, name: r.name, pos: r.pos, group: r.group, number: r.number, team: r.team, headshot: r.headshot }))
  players.sort((a, b) => a.name.localeCompare(b.name))
  return { players, missing, teams: NHL_TEAMS.length - missing.length }
}
