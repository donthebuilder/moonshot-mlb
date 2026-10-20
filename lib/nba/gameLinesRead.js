// 🏀 BUCKETS' "OUR LINE", READ (server only, 2026-10-19). lib/nba/gameLines.js is the arithmetic; this feeds it.
//
//   ratings     every club's final regular-season games this season and last (ESPN club schedules, the team model's
//               own feed), each game once, solved into opponent-adjusted margins
//   rest        days since each club last played (the second night of a back-to-back)
//   who plays   each club's last ROTATION_GAMES box scores (a compact copy cached a week: a final box never changes)
//               and the injury report (lib/injuries): a rotation player listed Out, Doubtful or on the injured list is
//               missing. The backtest used the box score in this place; the report can miss a late scratch.
//
// INFORMATION ONLY (Donovan 10-19): no CALLED, no record. The model's win share is NOT in what this returns; it is
// written to nba_line_calls at the lock for calibration (lib/nba/gameLinesStore.js) and never printed.
import { unstable_cache } from 'next/cache'
import { scoreboardFor, reduceScoreboard, clubResultsFor, reduceTeamSchedule, reduceBox } from './api'
import { NBA_TEAMS } from './teams'
import { easternDate } from '../data'
import { readInjuries } from '../injuries/read'
import { BLOCKS } from '../injuries/statuses'
import { canonTeam } from '../injuries/teams'
import { restBefore } from './teamModel'
import { solveRatings, projectMargin, missingValue, rotationOf, gameScore, homeWinShare, LINE_PARAMS, GAME_LINES_VERSION, ROTATION_GAMES, ROTATION_MIN_GAMES } from './gameLines'

const DAY = 86400000
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)
const UA = 'DASHNetwork/1.0'
const cacheOr = (fn, key, revalidate) => unstable_cache(fn, key, { revalidate })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? fn() : Promise.reject(e)))

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

/** Every final regular-season game of a season, once: [{ id, date, away, home, as, hs }], oldest first. */
async function seasonGames(season) {
  const per = await pool(NBA_TEAMS, 6, async ([abbrev, id]) => {
    const j = await clubResultsFor(id, season).catch(() => null)
    return j ? reduceTeamSchedule(j, abbrev).filter((g) => g.state === 'final' && g.seasonType !== 3 && g.us != null && g.them != null && g.opp).map((g) => ({ ...g, abbrev })) : null
  })
  // a failed pull is not a season: more than a handful of clubs missing throws (a throw is never cached)
  if (per.filter((r) => r == null).length > 3) throw new Error(`club results ${season}: ${per.filter((r) => r == null).length} clubs unread`)
  const byId = new Map()
  for (const rows of per) for (const g of rows || []) {
    if (byId.has(g.id)) continue
    const date = easternDate(Date.parse(g.start))
    byId.set(g.id, g.home ? { id: g.id, date, away: g.opp, home: g.abbrev, as: g.them, hs: g.us } : { id: g.id, date, away: g.abbrev, home: g.opp, as: g.us, hs: g.them })
  }
  return [...byId.values()].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
}
const seasonPack = (season) => cacheOr(() => seasonGames(season), ['nba-lines-season-v1', String(season)], 3600)

/** One final game's box, compact: { [club]: [{ id, min, gs }] } for the players who played. Cached a week. */
async function compactBox(gameId) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`, { headers: { Accept: 'application/json', 'User-Agent': UA }, cache: 'no-store' })
  if (!r.ok) throw new Error(`nba ${r.status} summary ${gameId}`)
  const out = {}
  for (const p of reduceBox(await r.json())) {
    if (p.dnp || !(p.min > 0)) continue
    ;(out[p.team] ||= []).push({ id: p.id, min: p.min, gs: Math.round(gameScore(p) * 10) / 10 })
  }
  if (Object.keys(out).length !== 2) throw new Error(`summary ${gameId}: no box`)
  return out
}
const boxOf = (gameId) => cacheOr(() => compactBox(gameId), ['nba-lines-box-v1', String(gameId)], 7 * 86400)

const r1 = (v) => Math.round(v * 10) / 10

/**
 * Our line for every game of a day, as of `now`, with what went into it. Games already under way are still computed
 * (from the games before that day), but callers show a started game's LOCKED row, never this.
 * -> { date, version, season, injuries: { ok, asOf }, games: [{ id, state, start, seasonType, away, home, margin, winShare, basis, rest, b2b, out }] }
 * winShare is for the lock's log only: the API route drops it.
 */
async function compute(date) {
  const day = reduceScoreboard(await scoreboardFor(date)).filter((g) => g.state !== 'postponed' && g.state !== 'canceled')
  const base = { date, version: GAME_LINES_VERSION, games: [] }
  if (!day.length) return base
  const year = day.find((g) => g.seasonYear)?.seasonYear
  if (!year) return { ...base, reason: 'The feed names no season for these games.' }
  const [cur, prev] = await Promise.all([seasonPack(year), seasonPack(year - 1)])
  const clubs = NBA_TEAMS.map(([a]) => a)
  const P = LINE_PARAMS
  // last season's end ratings are the prior (the backtest's prevRatings)
  const prior = prev.length >= 300 ? solveRatings(prev.map((g) => ({ ...g, ago: 0 })), clubs, {}, { ...P, priorGames: 1, priorKeep: 0 }, null, 40) : {}
  const t = dayNum(date)
  const before = cur.filter((g) => g.date < date).map((g) => ({ ...g, ago: t - dayNum(g.date) }))
  const ratings = solveRatings(before, clubs, prior, P)
  const basisOf = (abbrev) => {
    const n = before.filter((g) => g.away === abbrev || g.home === abbrev).length
    return n === 0 ? 'last season' : n < 2 * P.priorGames ? 'part last season' : 'this season'
  }
  const inj = await readInjuries('nba').catch(() => ({ ok: false, unavailable: true, entries: [] }))
  const outByClub = new Map()
  for (const e of inj.unavailable ? [] : inj.entries || []) {
    if (!BLOCKS.has(e.status) || !e.espnId) continue
    const club = canonTeam('nba', e.team)
    if (!outByClub.has(club)) outByClub.set(club, new Map())
    outByClub.get(club).set(String(e.espnId), { name: e.name, status: e.status })
  }
  // WHO PLAYS, per club tonight: its last ROTATION_GAMES box scores
  const tonight = [...new Set(day.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const who = new Map()
  await pool(tonight, 4, async (abbrev) => {
    const games = before.filter((g) => g.away === abbrev || g.home === abbrev).slice(-ROTATION_GAMES)
    if (games.length < ROTATION_MIN_GAMES || inj.unavailable) { who.set(abbrev, null); return }
    const boxes = await Promise.all(games.map((g) => boxOf(g.id).then((b) => b[abbrev] || null).catch(() => null)))
    if (boxes.some((b) => !b)) { who.set(abbrev, null); return }   // a box we could not read: no number, never a guess
    const { rotation, rate } = rotationOf(boxes)
    const listed = outByClub.get(canonTeam('nba', abbrev)) || new Map()
    const playing = new Set(rotation.map((r) => r.id).filter((id) => !listed.has(id)))
    const out = rotation.filter((r) => listed.has(r.id)).map((r) => ({ id: r.id, name: listed.get(r.id).name, status: listed.get(r.id).status, value: r1(rate(r.id) * r.min) }))
      .sort((a, b) => b.value - a.value)
    who.set(abbrev, { miss: missingValue(rotation, playing, rate), out })
  })
  const games = []
  for (const g of day) {
    const a = g.away.abbrev, h = g.home.abbrev
    if (ratings[a] == null || ratings[h] == null) continue
    const rest = { away: restBefore(before.filter((x) => x.away === a || x.home === a).map((x) => x.date), date), home: restBefore(before.filter((x) => x.away === h || x.home === h).map((x) => x.date), date) }
    const wa = who.get(a), wh = who.get(h)
    const margin = projectMargin(ratings[h], ratings[a], { b2bHome: rest.home === 1, b2bAway: rest.away === 1, missHome: wh?.miss || 0, missAway: wa?.miss || 0 }, P)
    const rank = { 'last season': 0, 'part last season': 1, 'this season': 2 }
    const ba = basisOf(a), bh = basisOf(h)
    games.push({
      id: g.id, state: g.state, start: g.start, seasonType: g.seasonType, away: a, home: h,
      margin: r1(margin), winShare: homeWinShare(margin, P),
      basis: rank[ba] <= rank[bh] ? ba : bh, rest, b2b: { away: rest.away === 1, home: rest.home === 1 },
      ratings: { away: r1(ratings[a]), home: r1(ratings[h]) },
      out: { away: wa ? wa.out : null, home: wh ? wh.out : null },   // null = who plays not counted (early season, no report, a box unread)
      miss: { away: wa ? r1(wa.miss) : null, home: wh ? r1(wh.miss) : null },
    })
  }
  return { ...base, season: year, injuries: { ok: !inj.unavailable, asOf: inj.asOf || null, stale: Boolean(inj.stale) }, games }
}

/** Cached 10 minutes per day (the injury report itself is read at most every 20). */
export const ourLines = (date) => cacheOr(() => compute(date), ['nba-our-lines-v1', date], 600)
/** Uncached, for the lock: the freshest read there is. */
export const ourLinesNow = (date) => compute(date)
