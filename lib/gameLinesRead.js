// "OUR LINE", READ, FOR MLB / NFL / NHL (server only, 2026-10-20; BUCKETS has its own, lib/nba/gameLinesRead.js, which
// also counts who plays). lib/gameLines.js is the arithmetic; this feeds it from ESPN's public site API:
//   ratings   every club's final regular-season games this season and last (club schedules), each game once
//   rest      days since each club last played (NHL: the back-to-back)
//   home      the home edge, off at a neutral site
// Nothing about players: no starting pitcher, quarterback or goalie. The page says so. INFORMATION ONLY: no CALLED, no
// record. The win share is in this read only for the lock's log (lib/gameLinesStore.js); the API route drops it.
import { unstable_cache } from 'next/cache'
import { easternDate } from './data'
import { restBefore } from './nba/teamModel'
import { solveRatings, projectMargin, homeWinShare, SPORT_LINES } from './gameLines'

export const LINE_SPORTS = Object.keys(SPORT_LINES)   // mlb, nfl, nhl
const PATH = { mlb: 'baseball/mlb', nfl: 'football/nfl', nhl: 'hockey/nhl' }
const BASE = (sport) => `https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}`
const UA = 'DASHNetwork/1.0'   // ESPN answers 403 to a User-Agent carrying a URL
const DAY = 86400000
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)
const r1 = (v) => Math.round(v * 10) / 10 || 0   // never "-0"
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const STATE = { STATUS_SCHEDULED: 'pre', STATUS_FINAL: 'final', STATUS_POSTPONED: 'postponed', STATUS_CANCELED: 'canceled' }

const cacheOr = (fn, key, revalidate) => unstable_cache(fn, key, { revalidate })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? fn() : Promise.reject(e)))
async function espn(url, revalidate) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, next: { revalidate } })
  if (!r.ok) { const e = new Error(`espn ${r.status} ${url.replace(/^https:\/\/[^/]+/, '')}`); e.status = r.status; throw e }
  return r.json()
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

/** One day's games: [{ id, start, state, seasonYear, seasonType, neutral, away, home }]. */
export async function dayGames(sport, date) {
  const j = await espn(`${BASE(sport)}/scoreboard?dates=${date.replace(/-/g, '')}`, 60)
  return (j?.events || []).map((e) => {
    const c = e.competitions?.[0] || {}
    const side = (h) => (c.competitors || []).find((x) => x.homeAway === h)
    const name = e.status?.type?.name
    return { id: String(e.id), start: e.date, state: STATE[name] || (e.status?.type?.completed ? 'final' : name === 'STATUS_SCHEDULED' ? 'pre' : 'live'),
      seasonYear: num(e.season?.year), seasonType: num(e.season?.type), neutral: Boolean(c.neutralSite),
      away: String(side('away')?.team?.abbreviation || ''), home: String(side('home')?.team?.abbreviation || ''),
      awayScore: num(side('away')?.score), homeScore: num(side('home')?.score) }
  }).filter((g) => g.away && g.home)
}

/** Every final regular-season game of a season, once: [{ id, date, away, home, as, hs, neutral }], oldest first. */
async function seasonGames(sport, season) {
  const teams = (await espn(`${BASE(sport)}/teams`, 86400))?.sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || []
  if (teams.length < 20) throw new Error(`${sport} teams: ${teams.length}`)
  const per = await pool(teams, 6, (t) => espn(`${BASE(sport)}/teams/${t.id}/schedule?season=${season}&seasontype=2`, 3600).catch(() => null))
  // a failed pull is not a season: more than a handful of clubs missing throws (a throw is never cached)
  if (per.filter((j) => j == null).length > 3) throw new Error(`${sport} ${season}: ${per.filter((j) => j == null).length} club schedules unread`)
  const byId = new Map()
  for (const j of per) for (const e of j?.events || []) {
    const c = e.competitions?.[0]; if (!c || c.status?.type?.name !== 'STATUS_FINAL' || byId.has(String(e.id))) continue
    const a = c.competitors?.find((x) => x.homeAway === 'away'), h = c.competitors?.find((x) => x.homeAway === 'home')
    const as = num(a?.score?.value ?? a?.score?.displayValue), hs = num(h?.score?.value ?? h?.score?.displayValue)
    if (as == null || hs == null || !a?.team?.abbreviation || !h?.team?.abbreviation) continue
    byId.set(String(e.id), { id: String(e.id), date: easternDate(Date.parse(e.date)), away: a.team.abbreviation, home: h.team.abbreviation, as, hs, neutral: Boolean(c.neutralSite) })
  }
  return [...byId.values()].sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1))
}
const seasonPack = (sport, season) => cacheOr(() => seasonGames(sport, season), ['lines-season-v1', sport, String(season)], 3600)

/**
 * Our line for every game of a day: { sport, date, version, unit, games: [{ id, state, start, seasonType, away, home,
 * margin, winShare, basis, rest, short, neutral, ratings }] }. A club with no rating has no line (left out).
 */
async function compute(sport, date) {
  const S = SPORT_LINES[sport]
  const base = { sport, date, version: S.version, unit: S.unit, games: [] }
  const day = (await dayGames(sport, date)).filter((g) => g.state !== 'postponed' && g.state !== 'canceled')
  if (!day.length) return base
  const year = day.find((g) => g.seasonYear)?.seasonYear
  if (!year) return { ...base, reason: 'The feed names no season for these games.' }
  const [cur, prev] = await Promise.all([seasonPack(sport, year), seasonPack(sport, year - 1)])
  const P = S.params
  const clubs = [...new Set([...cur, ...prev, ...day].flatMap((g) => [g.away, g.home]))]
  const prior = prev.length >= 100 ? solveRatings(prev.map((g) => ({ ...g, ago: 0 })), clubs, {}, { ...P, priorGames: 1, priorKeep: 0 }, null, 40) : {}
  const t = dayNum(date)
  const before = cur.filter((g) => g.date < date).map((g) => ({ ...g, ago: t - dayNum(g.date) }))
  const r = solveRatings(before, clubs, prior, P)
  const played = (c) => before.filter((g) => g.away === c || g.home === c)
  const basisOf = (c) => { const n = played(c).length; return n === 0 ? 'last season' : n < 2 * P.priorGames ? 'part last season' : 'this season' }
  const rank = { 'last season': 0, 'part last season': 1, 'this season': 2 }
  const isShort = (x) => S.short > 0 && P.backToBack > 0 && x != null && x <= S.short
  const games = []
  for (const g of day) {
    if (r[g.away] == null || r[g.home] == null || (!prev.length && !before.length)) continue
    const rest = { away: restBefore(played(g.away).map((x) => x.date), date), home: restBefore(played(g.home).map((x) => x.date), date) }
    const margin = projectMargin(r[g.home], r[g.away], { b2bHome: isShort(rest.home), b2bAway: isShort(rest.away) }, g.neutral ? { ...P, home: 0 } : P)
    const ba = basisOf(g.away), bh = basisOf(g.home)
    games.push({ id: g.id, state: g.state, start: g.start, seasonType: g.seasonType, away: g.away, home: g.home, neutral: g.neutral,
      margin: r1(margin), winShare: homeWinShare(margin, P), basis: rank[ba] <= rank[bh] ? ba : bh, rest,
      short: { away: isShort(rest.away), home: isShort(rest.home) }, ratings: { away: r1(r[g.away]), home: r1(r[g.home]) } })
  }
  return { ...base, season: year, games }
}

/** Cached 10 minutes per sport and day. */
export const ourGameLines = (sport, date) => cacheOr(() => compute(sport, date), ['our-lines-v1', sport, date], 600)
/** Uncached, for the lock. */
export const ourGameLinesNow = (sport, date) => compute(sport, date)
