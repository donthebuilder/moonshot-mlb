// HEAD TO HEAD, THE SERVER READ (2026-10-13). GET /api/h2h calls this. Server only. Stores nothing and adds no cron: a
// request reads the leagues' public schedule feeds (the same family the team pages read) and the route's edge cache holds
// the answer for hours, since a finished game never changes.
//
//   readPair(sport, a, b)   every finished meeting of two clubs, this season and the two before it
//   readClub(sport, a)      one club's finished games of the latest season that has any, against everyone (for the team page)
//
// A season whose feed does not answer is NAMED in `seasons` (ok: false), never silently left out of a record.
import { makeGame, seasonsFor } from './core'
import { SEASONS_BACK } from './config'
import { reduceMlb, reduceNhl, reduceEspn, nflCodeOf, NFL_TO_ESPN } from './feeds'
import { nbaTeam, nbaAbbrevOf } from '../nba/teams'
import { teamKey } from '../mlbTeams'

const UA = { 'User-Agent': 'DASHNetwork/1.0', Accept: 'application/json' }
const HOUR = 3600
const MLB = 'https://statsapi.mlb.com/api/v1'
const NHL = 'https://api-web.nhle.com/v1'
const ESPN = { nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl', nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba' }

async function getJSON(url, revalidate) {
  try {
    const r = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(20000) })
    return r.ok ? await r.json() : null
  } catch (e) { console.error(`[h2h] ${url.slice(0, 100)}: ${e?.message}`); return null }
}

let _mlbIds = null
async function mlbCodeOf() {
  if (!_mlbIds) {
    const j = await getJSON(`${MLB}/teams?sportId=1`, 24 * HOUR)
    const by = {}
    for (const t of j?.teams || []) { const k = teamKey(t.abbreviation); if (k) by[t.id] = k }
    if (Object.keys(by).length) _mlbIds = by
    else return { codeOf: () => null, idOf: () => null }
  }
  const byCode = Object.fromEntries(Object.entries(_mlbIds).map(([id, c]) => [c, Number(id)]))
  return { codeOf: (id) => _mlbIds[id] || null, idOf: (c) => byCode[c] || null }
}

const nbaCodeOf = (t) => nbaAbbrevOf(t?.id)
// ESPN's address of a club and the way its team object is turned back into the site's code, per sport
const ESPN_PATH = { nfl: (code) => NFL_TO_ESPN[code] || code, nba: (code) => nbaTeam(code)?.id }
const ESPN_CODE = { nfl: nflCodeOf, nba: nbaCodeOf }

/** One club's finished games for one season from its sport's feed (null = the feed did not answer). `opp` narrows MLB's feed to a pair. */
async function seasonGames(sport, code, season, { opp = null, post = true } = {}) {
  if (sport === 'mlb') {
    const { codeOf, idOf } = await mlbCodeOf()
    const id = idOf(code); if (!id) return null
    const oppId = opp ? idOf(opp) : null
    const j = await getJSON(`${MLB}/schedule?sportId=1&teamId=${id}${oppId ? `&opponentId=${oppId}` : ''}&season=${season.feed}&gameType=R,F,D,L,W`, HOUR)
    return j ? reduceMlb(j, season, codeOf) : null
  }
  if (sport === 'nhl') {
    const j = await getJSON(`${NHL}/club-schedule-season/${code}/${season.feed}`, HOUR)
    return j ? reduceNhl(j, season) : null
  }
  const path = ESPN_PATH[sport](code); if (!path) return null
  const types = post ? [2, 3] : [2]
  const parts = await Promise.all(types.map((t) => getJSON(`${ESPN[sport]}/teams/${path}/schedule?season=${season.feed}&seasontype=${t}`, HOUR)))
  if (parts[0] == null) return null   // the regular season is the one that must answer; a missing postseason is an empty one
  return parts.flatMap((j) => (j ? reduceEspn(j, season, ESPN_CODE[sport]) : []))
}

const clean = (games) => games.map((g) => makeGame(g)).filter(Boolean).map(({ id, season, seasonKey, date, type, home, away, hs, as, ot }) => ({ id, season, seasonKey, date, type, home, away, hs, as, ot }))

export async function readPair(sport, a, b, today = new Date().toISOString().slice(0, 10)) {
  const seasons = seasonsFor(sport, today, SEASONS_BACK)
  const reads = await Promise.all(seasons.map((s) => seasonGames(sport, a, s, { opp: b })))
  const games = clean(reads.flatMap((r) => r || []))
  return {
    sport, mode: 'pair', a, b,
    seasons: seasons.map((s, i) => ({ label: s.label, key: s.key, ok: reads[i] != null, n: games.filter((g) => g.seasonKey === s.key && ((g.home === a && g.away === b) || (g.home === b && g.away === a))).length })),
    games: games.filter((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)),
  }
}

export async function readClub(sport, a, today = new Date().toISOString().slice(0, 10)) {
  const seasons = seasonsFor(sport, today, 2)
  const used = []
  let games = []; let stale = false
  for (let i = 0; i < seasons.length; i += 1) {
    const r = await seasonGames(sport, a, seasons[i], { post: false })
    const g = r ? clean(r).filter((x) => x.type === 'R') : []   // a club's record against everyone is its regular season
    used.push({ label: seasons[i].label, key: seasons[i].key, ok: r != null, n: g.length })
    if (g.length) { games = g; stale = i > 0; break }
  }
  return { sport, mode: 'club', a, seasons: used, stale, games }
}
