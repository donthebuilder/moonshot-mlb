// 🏆 TUDDY'S SUPER BOWL ODDS (2026-10-20, Donovan: futures for every sport, "models being ran" like MLB's October odds). Server only.
// BUCKETS' title odds (lib/nba/titleSim.js) for football, in the same file contract (lib/championship.js), so the shared panel
// (ChampionshipFold -> PennantRace) draws it with no sport branch:
//   1. every club's rating is TUDDY's game model (lib/gameLines.js nfl-lines-v1, "our line" on the Slate): its scoring margin a game,
//      opponent-adjusted, this season leaning on last season's until the games pile up; a game's margin is home rating - road
//      rating + home field (none at a neutral site). The touchdown model (lib/nfl/teamTdModel.js) counts touchdowns, not who wins,
//      so it is not the engine here.
//   2. THE MISS, MEASURED on last season: every game replayed with the ratings as they stood the day before (last season leaning on
//      the season before it, exactly as the line does now) -> the real margin minus the projected one. Its spread is the miss; the
//      share of tied games over the last two seasons sets the small band that ends level.
//   3. every remaining regular-season game on the league's schedule: margin = the line + a normal miss; inside the band, a tie.
//   4. the league's format: four division winners seeded 1-4 by record and three wild cards 5-7 a conference (ties on record: a
//      coin flip, the league's tiebreakers are not modelled); the 1 seed has the bye; single games, the higher seed at home; the
//      Super Bowl at a neutral site.
// 10,000 seasons. Shares 0-1. It knows final scores and nothing else: no quarterback, no injuries, no weather, no rest.
import { unstable_cache } from 'next/cache'
import { easternDate } from '../data'
import { solveRatings, projectMargin, SPORT_LINES } from '../gameLines'
import { NFL_TEAMS } from './teams'
import { invPhi, meanSd, phi, pool, rng, shareOf } from '../titleSimCore'

export const TITLE_MODEL_VERSION = 'nfl-title-v1'
export const TITLE_SIMS = 10000
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const STANDINGS = 'https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?level=3'
const UA = 'DASHNetwork/1.0'   // ESPN answers 403 to a User-Agent carrying a URL
const TUDDY = { WSH: 'WAS', LAR: 'LA' }   // ESPN's club codes that differ from TUDDY's
const NAME = Object.fromEntries(NFL_TEAMS)
const DAY = 86400000
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

async function espn(url, revalidate) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, next: { revalidate } })
  if (!r.ok) throw new Error(`espn ${r.status} ${url.replace(/^https:\/\/[^/]+/, '')}`)
  return r.json()
}

/** The league's conferences and divisions (the standings feed): [{ code, conf: 'AFC', div: 'AFC East' }], ESPN codes. */
async function leagueClubs() {
  const j = await espn(STANDINGS, 86400)
  const out = []
  for (const c of j?.children || []) for (const d of c.children || []) for (const e of d.standings?.entries || []) {
    const code = String(e.team?.abbreviation || '').toUpperCase()
    if (code) out.push({ code, conf: c.abbreviation, div: d.name })
  }
  if (out.length !== 32 || new Set(out.map((x) => x.div)).size !== 8) throw new Error(`standings: ${out.length} clubs`)
  return out
}

/** Every regular-season game of a season once: [{ id, date, home, away, hs, as, state, neutral }], oldest first. */
async function seasonGames(clubs, season) {
  const per = await pool(clubs, 6, (c) => espn(`${BASE}/teams/${c}/schedule?season=${season}&seasontype=2`, 3600).catch(() => null))
  if (per.filter((j) => j == null).length > 3) throw new Error(`${season}: ${per.filter((j) => j == null).length} club schedules unread`)
  const byId = new Map()
  for (const j of per) for (const e of j?.events || []) {
    const c = e.competitions?.[0]; if (!c || byId.has(String(e.id))) continue
    const a = c.competitors?.find((x) => x.homeAway === 'away'), h = c.competitors?.find((x) => x.homeAway === 'home')
    if (!a?.team?.abbreviation || !h?.team?.abbreviation) continue
    const name = c.status?.type?.name
    const state = name === 'STATUS_FINAL' ? 'final' : name === 'STATUS_CANCELED' ? 'canceled' : 'open'
    const score = (x) => num(x?.score?.value ?? x?.score?.displayValue ?? x?.score)
    byId.set(String(e.id), { id: String(e.id), date: easternDate(Date.parse(e.date)), away: a.team.abbreviation, home: h.team.abbreviation,
      as: state === 'final' ? score(a) : null, hs: state === 'final' ? score(h) : null, state, neutral: Boolean(c.neutralSite) })
  }
  return [...byId.values()].sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1))
}

const finals = (games) => games.filter((g) => g.state === 'final' && g.hs != null && g.as != null)

/** Build the Super Bowl odds file for one season (the year it kicks off: 2026). */
export async function buildTitleOdds(season, now = new Date()) {
  const league = await leagueClubs()
  const clubs = league.map((x) => x.code)
  const [cur, prev, prev2] = await Promise.all([seasonGames(clubs, season), seasonGames(clubs, season - 1), seasonGames(clubs, season - 2)])
  const S = SPORT_LINES.nfl, P = S.params
  const fullSeason = (gs) => solveRatings(finals(gs).map((g) => ({ ...g, ago: 0 })), clubs, {}, { ...P, priorGames: 1, priorKeep: 0 }, null, 40)
  const margin = (r, g) => projectMargin(r[g.home], r[g.away], {}, g.neutral ? { ...P, home: 0 } : P)

  // THE MISS, MEASURED: last season replayed, each game day with the ratings as they stood the day before
  const prevF = finals(prev)
  if (prevF.length < 200 || finals(prev2).length < 200) throw new Error('too few games last season to measure the miss')
  const prior2 = fullSeason(prev2)
  const misses = []; let start = null
  for (const d of [...new Set(prevF.map((g) => g.date))]) {
    const t = dayNum(d)
    const r = solveRatings(prevF.filter((g) => g.date < d).map((g) => ({ ...g, ago: t - dayNum(g.date) })), clubs, prior2, P, start)
    start = r
    for (const g of prevF.filter((x) => x.date === d)) misses.push((g.hs - g.as) - margin(r, g))
  }
  const { mu, sd } = meanSd(misses)
  const twoSeasons = [...prevF, ...finals(prev2)]
  const tieRate = twoSeasons.filter((g) => g.hs === g.as).length / twoSeasons.length
  const band = tieRate > 0 ? sd * invPhi((1 + tieRate) / 2) : 0

  // today's ratings, exactly as the Slate's line reads them
  const today = easternDate(now.getTime()), t = dayNum(today)
  const curF = finals(cur)
  const R0 = solveRatings(curF.map((g) => ({ ...g, ago: t - dayNum(g.date) })), clubs, fullSeason(prev), P)
  const W0 = {}, L0 = {}, T0 = {}
  for (const c of clubs) { W0[c] = 0; L0[c] = 0; T0[c] = 0 }
  for (const g of curF) {
    if (g.hs === g.as) { T0[g.home]++; T0[g.away]++ } else { const [w, l] = g.hs > g.as ? [g.home, g.away] : [g.away, g.home]; W0[w]++; L0[l]++ }
  }
  const left = cur.filter((g) => g.state === 'open' && R0[g.home] != null && R0[g.away] != null).map((g) => {
    const m = margin(R0, g)
    const win = 1 - phi((band - m) / sd), tie = band > 0 ? phi((band - m) / sd) - phi((-band - m) / sd) : 0
    return [g.home, g.away, win, tie]
  })

  const conf = Object.fromEntries(league.map((x) => [x.code, x.conf]))
  const div = Object.fromEntries(league.map((x) => [x.code, x.div]))
  const z = () => Object.fromEntries(clubs.map((c) => [c, 0]))
  const tally = { make_playoffs: z(), top_seed: z(), win_division: z(), win_round1: z(), win_round2: z(), win_round3: z(), win_champion: z(), wins: z() }
  const seedCount = Object.fromEntries(clubs.map((c) => [c, {}]))
  const R = rng(20261020)
  const PG = new Map()
  // a playoff game: no ties; the home club wins with phi(margin / miss); neutral for the Super Bowl
  const game = (h, a, neutral = false) => {
    const k = `${h}|${a}|${neutral}`
    if (!PG.has(k)) PG.set(k, phi(margin(R0, { home: h, away: a, neutral }) / sd))
    return R() < PG.get(k) ? h : a
  }
  for (let s = 0; s < TITLE_SIMS; s++) {
    const W = { ...W0 }, T = { ...T0 }
    for (const [h, a, win, tie] of left) { const u = R(); if (u < win) W[h]++; else if (u < win + tie) { T[h]++; T[a]++ } else W[a]++ }
    const rec = Object.fromEntries(clubs.map((c) => [c, W[c] + 0.5 * T[c] + R() * 0.4]))   // a tie on record: a coin flip
    const champs = {}
    for (const cf of ['AFC', 'NFC']) {
      const o = clubs.filter((c) => conf[c] === cf).sort((x, y) => rec[y] - rec[x])
      const winners = [...new Set(o.map((c) => div[c]))].map((d) => o.find((c) => div[c] === d)).sort((x, y) => rec[y] - rec[x])
      const seeds = [...winners, ...o.filter((c) => !winners.includes(c)).slice(0, 3)]
      seeds.forEach((c, i) => { seedCount[c][i + 1] = (seedCount[c][i + 1] || 0) + 1; tally.make_playoffs[c]++ })
      winners.forEach((c) => tally.win_division[c]++)
      tally.top_seed[seeds[0]]++
      const seedOf = (c) => seeds.indexOf(c)
      const host = (x, y) => (seedOf(x) < seedOf(y) ? [x, y] : [y, x])
      const r1 = [seeds[0], ...[[1, 6], [2, 5], [3, 4]].map(([i, j]) => game(seeds[i], seeds[j]))]   // the 1 seed's bye counts as advancing
      r1.forEach((c) => tally.win_round1[c]++)
      const rest = r1.slice(1).sort((x, y) => seedOf(x) - seedOf(y))
      const r2 = [game(...host(seeds[0], rest[2])), game(...host(rest[0], rest[1]))]
      r2.forEach((c) => tally.win_round2[c]++)
      champs[cf] = game(...host(r2[0], r2[1]))
      tally.win_round3[champs[cf]]++
    }
    tally.win_champion[game(champs.AFC, champs.NFC, true)]++
    for (const c of clubs) tally.wins[c] += W[c]
  }
  const sh = (n) => shareOf(n, TITLE_SIMS)
  const teams = league.map(({ code, conf: cf, div: dv }) => {
    const abbr = TUDDY[code] || code
    return {
      team_id: abbr, abbr, name: NAME[abbr] || abbr, conference: cf, division: dv,
      wins: W0[code], losses: L0[code], ties: T0[code],
      strength: Math.round(R0[code] * 10) / 10,   // points a game better than an average club, on a neutral field
      proj_wins: Math.round((tally.wins[code] / TITLE_SIMS) * 10) / 10,
      make_playoffs: sh(tally.make_playoffs[code]), win_division: sh(tally.win_division[code]), top_seed: sh(tally.top_seed[code]),
      seeds: Object.fromEntries(Object.entries(seedCount[code]).map(([k, v]) => [k, sh(v)])),
      win_round1: sh(tally.win_round1[code]), win_round2: sh(tally.win_round2[code]), win_round3: sh(tally.win_round3[code]),
      win_round4: sh(tally.win_champion[code]), win_champion: sh(tally.win_champion[code]),
    }
  }).sort((a, b) => b.win_champion - a.win_champion || b.proj_wins - a.proj_wins)
  return {
    schema: 1, season, as_of: now.toISOString(), sims: TITLE_SIMS, model_version: TITLE_MODEL_VERSION,
    method: `Every remaining regular-season game played ${TITLE_SIMS.toLocaleString('en-US')} times from TUDDY's game model (each club's scoring margin against the schedule it played, this season leaning on last season's until the games pile up, ${P.home} points for home field), each result missing the projected margin by as much as real games did last season (${sd.toFixed(1)} points, measured on ${misses.length} games); then seven seeds a conference, a bye for the 1 seed, single-game rounds and a neutral Super Bowl.`,
    note: `${curF.length} games played. Final scores only: no quarterbacks, injuries, weather or rest. Ties on record are a coin flip, not the league's tiebreakers.`,
    model: S.version, miss_mean: Math.round(mu * 10) / 10, miss_sd: Math.round(sd * 10) / 10, tie_rate: Math.round(tieRate * 1000) / 1000,
    games_measured: misses.length, games_left: left.length,
    teams,
  }
}

/** The season that should be current on an ET day: from March on, the season that kicks off that September. */
export function seasonFor(day) {
  const [y, m] = day.split('-').map(Number)
  return m >= 3 ? y : y - 1
}

/** Cached six hours per season and day: the table moves with results, once a game day at most. */
export function readTitleOdds(season, day) {
  return unstable_cache(() => buildTitleOdds(season), ['nfl-title-odds-v1', String(season), String(day)], { revalidate: 21600 })()
}
