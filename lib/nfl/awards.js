// 🏅 TUDDY'S AWARD RACES, LIVE (2026-10-20). Server only. The model is lib/nfl/awardModel.js (fitted on the AP's 2012-2025
// votes); this file feeds it this season's numbers and writes the shared award-race file (lib/awards.js) the Home panel draws.
//   players  nflverse's weekly player stats (the feed hist_nfl is built from): this season's and last season's
//   rookies  nflverse's players file (rookie_season), which also carries his ESPN id for the face
//   clubs    nflverse's game results: record and points allowed so far, leaning on last season's for CLUB_PRIOR games
// Each race: his line this season (defence: shrunk toward last season's by the measured blend), the fitted weights, and the
// temperature measured at this week of past seasons. Top 10 + the rest of the pool as one line, so the shares sum to 1.
// A race with nothing honest to show yet says so (`waiting`) and lists nobody.
import { unstable_cache } from 'next/cache'
import { AWARDS_MODEL_VERSION, AWARD_DEFS, AWARD_FITS, POS_KEYS, blendLine, measuredAt, clubRecords, parseCsv, positionZ, rawFeatures, seasonLines, softmax, temperatureAtWeek, zScore } from './awardModel'

const NV = 'https://github.com/nflverse/nflverse-data/releases/download'
const WEEKLY = (s) => `${NV}/stats_player/stats_player_week_${s}.csv`
const PLAYERS = `${NV}/players/players.csv`
const GAMES = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
// the rookie races open once the median club has played this many games: the first week their read was measured at
export const ROOKIE_OPENS = 3
const SHOWN = 10
const ORDER = ['mvp', 'opoy', 'dpoy', 'oroy', 'droy']

// the files run to megabytes: never into Next's fetch cache (2 MB a item); the whole build is cached instead (readAwardRaces)
async function csv(url, { optional = false } = {}) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'DASHNetwork/1.0' } })
  if (!r.ok) { if (optional && r.status === 404) return []; throw new Error(`nflverse ${r.status} ${url.split('/').pop()}`) }
  return parseCsv(await r.text())
}
const r4 = (x) => Math.round(x * 10000) / 10000
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }
// season totals for the table (the model reads per-game numbers; a reader reads totals)
const tot = (l, k) => (l ? Math.round((l[k] || 0) * l.gp) : null)

/** One finished race: shares over the pool, the top SHOWN with their season totals, the rest as one number. */
function race(key, scored, extra) {
  const order = scored.sort((a, b) => b.share - a.share)
  const top = order.slice(0, SHOWN)
  const def = AWARD_DEFS[key]
  return {
    key, label: def.label, title: def.title, status: 'ok', pool: order.length,
    rows: top.map((r) => ({
      id: r.id, name: r.name, team: r.team, pos: r.pos, espnId: r.espnId || undefined, rookie: r.rookie || undefined, gp: r.gp,
      ...(def.side === 'off'
        ? { yds: tot(r.shown, 'passYds') + tot(r.shown, 'rushYds') + tot(r.shown, 'recYds'), td: tot(r.shown, 'passTd') + tot(r.shown, 'rushTd') + tot(r.shown, 'recTd'), int: tot(r.shown, 'int') }
        : { sck: r.shown ? Math.round(r.shown.sacks * r.shown.gp * 10) / 10 : null, dInt: tot(r.shown, 'defInt'), tfl: tot(r.shown, 'tfl'), ff: tot(r.shown, 'ff') }),
      share: r4(r.share),
    })),
    rest: r4(order.slice(SHOWN).reduce((t, r) => t + r.share, 0)),
    ...extra,
  }
}

export async function buildAwardRaces(season) {
  const [cur, prev, players, games] = await Promise.all([csv(WEEKLY(season), { optional: true }), csv(WEEKLY(season - 1)), csv(PLAYERS), csv(GAMES)])
  const curL = seasonLines(cur), prevL = seasonLines(prev)
  const rookieOf = new Map(), espnOf = new Map()
  for (const p of players) { if (p.gsis_id) { rookieOf.set(p.gsis_id, Number(p.rookie_season) === season); if (p.espn_id) espnOf.set(p.gsis_id, p.espn_id) } }
  const prevClubs = clubRecords(games, season - 1)
  const clubs = clubRecords(games, season, 99, prevClubs)
  const medGames = median(Object.values(clubs).map((c) => c.games))
  const opening = medGames === 0

  const races = []
  for (const key of ORDER) {
    const def = AWARD_DEFS[key], fit = AWARD_FITS[key]
    const waiting = (why) => races.push({ key, label: def.label, title: def.title, status: 'waiting', why, rows: [], measured: measuredAt(key, medGames) })
    if (def.rookies && medGames < ROOKIE_OPENS) {
      waiting(`Rookies have ${medGames === 0 ? 'no NFL games' : medGames < 2 ? 'a game' : 'two games'} yet. This race opens after ${ROOKIE_OPENS} games a club.`)
      continue
    }
    // who is in it: everyone who has played this season (opening night: last season's players, on last season's lines)
    const ids = opening ? [...prevL.keys()] : [...curL.keys()]
    const rows = []
    for (const id of ids) {
      const rookie = rookieOf.get(id) === true
      if (def.rookies && !rookie) continue
      const c = curL.get(id) || null, p = rookie ? null : prevL.get(id) || null
      const team = c?.team || p?.team
      const club = clubs[team]
      const line = blendLine(c, p, club?.games || 0, fit.k)
      if (!line || !def.pool(line)) continue
      rows.push({ id, name: line.name, group: line.group, f: rawFeatures(line, club), x: { id, name: line.name, team, pos: line.pos, rookie, gp: c?.gp || 0, espnId: espnOf.get(id), shown: c || p } })
    }
    if (rows.length < 10) { waiting('Too few players qualify yet.'); continue }
    const z = zScore(positionZ(rows, POS_KEYS), def.feats)
    const T = temperatureAtWeek(medGames, fit.TW, fit.T)
    const sh = softmax(z, fit.w, T)
    races.push(race(key, z.map((r, i) => ({ ...r.x, share: sh[i] })), { T: Math.round(T * 100) / 100, measured: measuredAt(key, medGames) }))
  }

  const played = Object.values(clubs).reduce((t, c) => t + c.games, 0) / 2
  return {
    schema: 1, sport: 'nfl', season, seasonLabel: String(season), as_of: new Date().toISOString(), model_version: AWARDS_MODEL_VERSION,
    games_played: Math.round(played), median_club_games: medGames,
    method: `Fitted on how AP voters split each award, 2012-25: his numbers against that season's league and his own position, and his club's record. Spread as wide as past seasons were at this week. Data: nflverse.`,
    note: opening
      ? 'No games yet: last season\'s lines, spread wide for it.'
      : `${Math.round(played)} games played. Defence leans on last season's lines for his first few games.`,
    races,
  }
}

/** Cached six hours per season and day, as Super Bowl odds is (nflverse refreshes its stats once a night in season). */
export function readAwardRaces(season, day) {
  return unstable_cache(() => buildAwardRaces(season), ['nfl-award-races-v1', String(season), String(day)], { revalidate: 21600 })()
}

