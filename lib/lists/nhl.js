// 🏒 LAMP LIST POSTS (BATCH-LIST-POSTS step 3, 2026-09-27). Server safe;
// every number is the NHL's own (api.nhle.com/stats + api-web), computed.
//
// IRON MAN (weekly, Mondays): the longest ACTIVE consecutive-games streaks.
//   This season's games so far (per-game rows: he played every game his club
//   has), then season by season backward: one summary call per season gives
//   every skater's games played and club(s); a skater stays in while he played
//   every one of his club's games (one club that season -- a traded season
//   ends the walk). The deepest survivors have the longest streaks; players
//   who drop out at a level get an exact partial run for that season (api-web
//   game log against the club's completed games), computed only for the
//   levels that decide the top five. 15 seasons at most.
// A POINT IN EVERY GAME SO FAR: skaters with a point in every game this
//   season, while 3+ games in and the list has 2+ names (it ends when nobody
//   is left -- that is the story).
// A GOAL IN N STRAIGHT: active goal streaks of 4+ games.
// PLAYED EVERY GAME at the season's end is MOONSHOT's list, sport by sport
// (not built here until April).

import { verified } from './shape'

const STATS = 'https://api.nhle.com/stats/rest/en'
const WEB = 'https://api-web.nhle.com/v1'
const get = (u) => fetch(u, { cache: 'no-store', redirect: 'follow', headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const cay = (s) => encodeURIComponent(s)
export const CAP = 15   // one summary call a season: cheap enough to reach a Burns-length streak
const DONE = new Set(['OFF', 'FINAL'])

/** "20262027" for a date's hockey season (a new season from September). */
export function seasonIdFor(day) {
  const y = Number(day.slice(0, 4)); const m = Number(day.slice(5, 7))
  const start = m >= 9 ? y : y - 1
  return `${start}${start + 1}`
}
const prevSeason = (id) => `${Number(id.slice(0, 4)) - 1}${Number(id.slice(0, 4))}`

let _tri = null
async function triById() {
  if (_tri) return _tri
  const j = await get(`${STATS}/team`)
  if (!j?.data) return null
  _tri = new Map(j.data.map((t) => [Number(t.id), t.triCode]))
  return _tri
}

/** Map(triCode -> team games played) for a season. */
export async function teamGames(seasonId) {
  const [t, tri] = await Promise.all([get(`${STATS}/team/summary?limit=-1&cayenneExp=${cay(`seasonId=${seasonId} and gameTypeId=2`)}`), triById()])
  if (!t?.data || !tri) return null
  return new Map(t.data.map((r) => [tri.get(Number(r.teamId)), Number(r.gamesPlayed)]).filter(([k]) => k))
}

/** Pure: skaters who played every game of their one club -> Map(pid -> { name, team, gp }). */
export function everyGameSkaters(rows, teamGp) {
  const out = new Map()
  for (const r of rows || []) {
    const teams = String(r.teamAbbrevs || '').split(',').map((x) => x.trim()).filter(Boolean)
    if (teams.length !== 1) continue
    const gp = Number(r.gamesPlayed)
    if (gp > 0 && gp === teamGp.get(teams[0])) out.set(Number(r.playerId), { name: r.skaterFullName, team: teams[0], gp })
  }
  return out
}

async function seasonEveryGame(seasonId) {
  const [s, tg] = await Promise.all([get(`${STATS}/skater/summary?isAggregate=false&isGame=false&limit=-1&cayenneExp=${cay(`seasonId=${seasonId} and gameTypeId=2`)}`), teamGames(seasonId)])
  if (!s?.data || !tg) return null
  return { every: everyGameSkaters(s.data, tg), teamGp: tg }
}

/** Pure: per-game rows -> per player { name, team, games: [{ gameId, date, goals, points }] } and per team the game ids in order. */
export function byPlayerGames(rows) {
  const players = new Map(); const teamGamesSeen = new Map()
  for (const r of rows || []) {
    const pid = Number(r.playerId)
    const p = players.get(pid) || { name: r.skaterFullName, team: r.teamAbbrev, teams: new Set(), games: [] }
    p.games.push({ gameId: Number(r.gameId), date: r.gameDate, goals: Number(r.goals) || 0, points: Number(r.points) || 0 })
    p.teams.add(r.teamAbbrev); p.team = r.teamAbbrev
    players.set(pid, p)
    const t = teamGamesSeen.get(r.teamAbbrev) || new Map()
    t.set(Number(r.gameId), r.gameDate); teamGamesSeen.set(r.teamAbbrev, t)
  }
  for (const p of players.values()) p.games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId)
  const teams = new Map([...teamGamesSeen].map(([t, m]) => [t, [...m].sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]).map(([id]) => id)]))
  return { players, teams }
}

/** Pure: games from the end of `expected` (ids in order) he played, until the first he didn't. */
export function runFromEnd(expected, played) {
  let n = 0
  for (let i = expected.length - 1; i >= 0; i -= 1) { if (!played.has(expected[i])) return { run: n, whole: false }; n += 1 }
  return { run: n, whole: true }
}

async function thisSeasonGames(seasonId) {
  const j = await get(`${STATS}/skater/summary?isAggregate=false&isGame=true&limit=-1&cayenneExp=${cay(`seasonId=${seasonId} and gameTypeId=2`)}`)
  return j?.data ? byPlayerGames(j.data) : null
}

/**
 * A past season's run for one skater, from the end of that season back to his
 * last missed game: api-web game log against the completed games of the club
 * he finished the season with (read off the log itself). A season split by a
 * trade only counts the last stint and says so (atLeast).
 */
async function partialRun(pid, seasonId) {
  const gl = await get(`${WEB}/player/${pid}/game-log/${seasonId}/2`)
  const log = (gl?.gameLog || []).slice().sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)) || a.gameId - b.gameId)
  if (!log.length) return { run: 0, atLeast: false }
  const team = log[log.length - 1].teamAbbrev
  const stintStart = [...log].reverse().find((g, i, arr) => i + 1 === arr.length || arr[i + 1].teamAbbrev !== team)?.gameDate || log[0].gameDate
  const cs = await get(`${WEB}/club-schedule-season/${team}/${seasonId}`)
  if (!cs?.games) return null
  const expected = cs.games.filter((g) => g.gameType === 2 && DONE.has(g.gameState) && String(g.gameDate) >= String(stintStart))
    .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)) || a.id - b.id).map((g) => Number(g.id))
  const { run, whole } = runFromEnd(expected, new Set(log.map((g) => Number(g.gameId))))
  return { run, atLeast: whole && new Set(log.map((g) => g.teamAbbrev)).size > 1 }
}

/**
 * The longest active consecutive-games streaks (top `top`). Streaks carry
 * across clubs between seasons (they do in the NHL); a season split by a
 * trade isn't an every-game season in the summary, so the walk ends there
 * with that season's last stint counted.
 * @returns [{ id, name, team, total, seasons, atLeast }]
 */
export async function ironMen(day, { top = 5 } = {}) {
  const cur = seasonIdFor(day)
  const now = await thisSeasonGames(cur)
  let survivors = null   // Map(pid -> row); null = not started (last season is the first level)
  if (now?.players?.size) {
    survivors = new Map()
    for (const [pid, p] of now.players) {
      if (p.teams.size !== 1) continue
      const { run, whole } = runFromEnd(now.teams.get(p.team) || [], new Set(p.games.map((g) => g.gameId)))
      if (whole && run > 0) survivors.set(pid, { id: String(pid), name: p.name, team: p.team, total: run, seasons: [`${cur}:${run}`] })
    }
  }
  const below = []   // dropped at each level, exact partial runs, deepest level last
  let season = prevSeason(cur)
  for (let d = 0; d < CAP; d += 1) {
    const s = await seasonEveryGame(season)
    if (!s) break
    const pool = survivors || new Map([...s.every].map(([pid, v]) => [pid, { id: String(pid), name: v.name, team: v.team, total: 0, seasons: [] }]))
    const next = new Map(); const dropped = []
    for (const [pid, v] of pool) {
      const full = s.every.get(pid)
      if (full) next.set(pid, { ...v, total: v.total + full.gp, seasons: [...v.seasons, `${season}:${full.gp}`] })
      else dropped.push(v)
    }
    // Everyone dropped here ranks below every survivor; their partial runs
    // matter only while survivors can't fill the top on their own.
    if (next.size < top && dropped.length && survivors) {
      const level = []
      for (let i = 0; i < dropped.length; i += 6) {
        const got = await Promise.all(dropped.slice(i, i + 6).map(async (v) => {
          const pr = await partialRun(Number(v.id), season)
          return pr == null ? null : { ...v, total: v.total + pr.run, atLeast: pr.atLeast, seasons: [...v.seasons, `${season}:${pr.run}${pr.atLeast ? '+' : ''}`] }
        }))
        level.push(...got.filter(Boolean))
      }
      below.push(level.sort((a, b) => b.total - a.total))
    }
    survivors = next
    season = prevSeason(season)
    if (!survivors.size) break
  }
  // Still unbroken at the cap: "at least".
  const deep = [...(survivors || new Map()).values()].map((v) => ({ ...v, atLeast: true })).sort((a, b) => b.total - a.total)
  return [...deep, ...below.reverse().flat()].slice(0, top)
}

/** IRON MAN list: { sport:'nhl', kind, title, rows, ... } */
export async function ironManList(day) {
  const men = await ironMen(day)
  const rows = men.map((m) => ({ id: m.id, name: m.name, team: m.team, fact: `${m.atLeast ? 'at least ' : ''}${m.total.toLocaleString('en-US')} games in a row`, check: { total: m.total } }))
  return { sport: 'nhl', kind: 'iron_man', ranked: true, title: 'IRON MAN -- the longest active games-played streaks in the NHL:', rows, footnote: null, source: 'NHL stats API (season + per-game summaries) + api-web game logs / club schedules', asOf: new Date().toISOString() }
}

/** A point in every game so far (3+ games in). */
export async function pointEveryGameList(day) {
  const now = await thisSeasonGames(seasonIdFor(day))
  if (!now) return null
  const rows = []
  for (const [pid, p] of now.players) {
    const exp = now.teams.get(p.team) || []
    if (p.teams.size !== 1 || p.games.length !== exp.length || exp.length < 3) continue
    if (p.games.every((g) => g.points >= 1)) rows.push({ id: String(pid), name: p.name, team: p.team, fact: `${p.games.reduce((a, g) => a + g.points, 0)} pts in ${p.games.length} GP`, check: { gp: p.games.length } })
  }
  rows.sort((a, b) => b.check.gp - a.check.gp || parseInt(b.fact, 10) - parseInt(a.fact, 10))
  return { sport: 'nhl', kind: 'point_every_game', ranked: true, title: 'A point in every game so far this season:', rows, footnote: null, source: 'NHL stats API per-game skater summary', asOf: new Date().toISOString() }
}

/** Active goal streaks of 4+ games. */
export async function goalStreakList(day) {
  const now = await thisSeasonGames(seasonIdFor(day))
  if (!now) return null
  const rows = []
  for (const [pid, p] of now.players) {
    let n = 0
    for (let i = p.games.length - 1; i >= 0 && p.games[i].goals >= 1; i -= 1) n += 1
    if (n >= 4) rows.push({ id: String(pid), name: p.name, team: p.team, fact: `a goal in ${n} straight`, check: { streak: n } })
  }
  rows.sort((a, b) => b.check.streak - a.check.streak)
  return { sport: 'nhl', kind: 'goal_streak', ranked: true, title: 'Active goal streaks, 4+ games:', rows, footnote: null, source: 'NHL stats API per-game skater summary', asOf: new Date().toISOString() }
}

/** Has this hockey season's regular season played a game yet? */
export async function nhlSeasonStarted(day) {
  const now = await thisSeasonGames(seasonIdFor(day))
  return Boolean(now?.players?.size)
}

/** Post-time re-check: the list rebuilt from the source; a row stays only if it still says the same. */
export async function recheckNhlList(list, day) {
  if (!list?.rows?.length) return null
  const BUILD = { iron_man: ironManList, point_every_game: pointEveryGameList, goal_streak: goalStreakList }
  const again = await BUILD[list.kind]?.(day)
  const same = new Map((again?.rows || []).map((r) => [r.id, r.fact]))
  return verified(list, new Set(list.rows.filter((r) => same.get(r.id) === r.fact).map((r) => r.id)))
}
