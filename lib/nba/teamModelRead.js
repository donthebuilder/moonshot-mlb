// 🏀 BUCKETS' TEAM MODEL, READ (server only): expected points for each game of a day (lib/nba/teamModel.js is
// the arithmetic). Fed by ESPN's club schedules, the same feed the rest of BUCKETS reads: every club's final
// regular-season games of the game's own season and of the one before it (the prior). A club's line is built
// only from games played BEFORE that day, so a finished game shows what the model said going in. Cached an hour
// per season, 15 minutes per day.
import { unstable_cache } from 'next/cache'
import { scoreboardFor, reduceScoreboard, clubResultsFor, reduceTeamSchedule } from './api'
import { NBA_TEAMS } from './teams'
import { easternDate } from '../data'
import { averageOf, clubLine, leagueMean, restBefore, projectGame, pairingTotals, percentileIn, EXPECTED_POINTS_WORDS } from './teamModel'

const cacheOr = (fn, key, revalidate) => unstable_cache(fn, key, { revalidate })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? fn() : Promise.reject(e)))

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

/** { [abbrev]: [{ date, home, us, them }] } -- every club's final regular-season games of one season, oldest first. */
async function resultsPack(season) {
  const per = await pool(NBA_TEAMS, 6, async ([abbrev, id]) => {
    const j = await clubResultsFor(id, season).catch(() => null)
    if (!j) return [abbrev, null]
    const rows = reduceTeamSchedule(j, abbrev).filter((g) => g.state === 'final' && g.seasonType !== 3 && g.us != null && g.them != null)
      .map((g) => ({ date: easternDate(Date.parse(g.start)), home: g.home, us: g.us, them: g.them }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    return [abbrev, rows]
  })
  // a failed pull is not a season: more than a handful of clubs missing throws (a throw is never cached)
  if (per.filter(([, r]) => r == null).length > 3) throw new Error(`club results ${season}: ${per.filter(([, r]) => r == null).length} clubs unread`)
  return Object.fromEntries(per.map(([a, r]) => [a, r || []]))
}
const pack = (season) => cacheOr(() => resultsPack(season), ['nba-club-results-v1', String(season)], 3600)

async function compute(date) {
  const games = reduceScoreboard(await scoreboardFor(date)).filter((g) => g.state !== 'postponed' && g.state !== 'canceled')
  if (!games.length) return { date, words: EXPECTED_POINTS_WORDS, games: [] }
  const year = games.find((g) => g.seasonYear)?.seasonYear
  if (!year) return { date, words: EXPECTED_POINTS_WORDS, games: [], reason: 'The feed names no season for these games.' }
  const [curP, prevP] = await Promise.all([pack(year), pack(year - 1)])
  const before = (rows) => (rows || []).filter((g) => g.date < date)
  // the league mean: this season to date, leaning on last season's until the games pile up
  const prevAll = Object.values(prevP).flat()
  const prevMean = prevAll.length >= 300 ? prevAll.reduce((t, g) => t + g.us, 0) / prevAll.length : null
  const curAll = Object.values(curP).flatMap(before)
  const L = leagueMean(curAll.length, curAll.reduce((t, g) => t + g.us, 0), prevMean)
  if (L == null) return { date, words: EXPECTED_POINTS_WORDS, games: [], reason: 'No finished games on file to build a league average from.' }
  const lines = {}
  for (const [abbrev] of NBA_TEAMS) lines[abbrev] = clubLine(before(curP[abbrev]), prevP[abbrev]?.length >= 20 ? averageOf(prevP[abbrev]) : null, L)
  const dist = pairingTotals(lines, L)
  const r1 = (v) => Math.round(v * 10) / 10
  const side = (abbrev, pts) => {
    const l = lines[abbrev]
    return { abbrev, pts: r1(pts), scores: r1(l.pf), allows: r1(l.pa), n: l.n, basis: l.basis }
  }
  const out = []
  for (const g of games) {
    const a = g.away.abbrev, h = g.home.abbrev
    if (!lines[a] || !lines[h]) continue
    const rest = { away: restBefore(before(curP[a]).map((x) => x.date), date), home: restBefore(before(curP[h]).map((x) => x.date), date) }
    const p = projectGame({ away: lines[a], home: lines[h], L, rest })
    if (!p) continue
    out.push({ id: g.id, seasonType: g.seasonType, state: g.state, basis: p.basis, b2b: p.b2b, rest,
      total: r1(p.total), heat: percentileIn(dist, p.total), away: side(a, p.away), home: side(h, p.home) })
  }
  return { date, words: EXPECTED_POINTS_WORDS, season: year, league: r1(L), games: out,
    spread: dist.length ? { lo: r1(dist[0]), mid: r1(dist[dist.length >> 1]), hi: r1(dist[dist.length - 1]) } : null }
}

/** { date, words, season, league, games: [{ id, total, heat (0-1 in the league's pairings), basis, b2b, away: {abbrev, pts, scores, allows, n, basis}, home }] } */
export const teamModelRows = (date) => cacheOr(() => compute(date), ['nba-teammodel-v1', date], 900)
