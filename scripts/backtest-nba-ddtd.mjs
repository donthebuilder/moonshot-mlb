#!/usr/bin/env node
// BACKTEST: BUCKETS double-double / triple-double v1 (own rates + minutes) against v2 (the same rates scaled by the
// opponent, lib/nba/ddtd.js oppMultiplier), on a finished season of REAL games (ESPN game logs and league stats;
// nothing made up). The real scoring code is used (lib/nba/model.js scoreMarket on candidates built exactly as
// lib/nba/board.js builds them), so what is measured is what ships.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/backtest-nba-ddtd.mjs [season=2026] [players=170] [gamma=1]
// For every game a sampled player played in `season`: his legs use only games BEFORE it (last 82 real games, this
// season then last; minutes = their mean). Nights = ET days; every sampled player who played that day is a candidate.
// The opponent numbers come two ways, said in the output: PRIOR = the previous season's final allowed-a-game (no
// leakage, but stale), SAME = this season's final (leaks the future a little). Hit = the box's count of tens.
// HONEST LIMITS: the candidates are the sampled rotation players, not the whole league, so "the top third of the night"
// is the sample's; the CALLED rule (one a club a game, second needs the board) is the shipped one.
import { reduceGamelog } from '../lib/nba/api.js'
import { seasonStats, seasonTeams } from '../lib/nba/stats.js'
import { scoreMarket, legsFor, DDTD } from '../lib/nba/model.js'
import { ddtdFromLog, ddtdLegs, withOppAdjust, leagueAllowed, realGames, reachOf, tensIn, REACH_MIN, WINDOW, OPP_CLAMP, OPP_K } from '../lib/nba/ddtd.js'

const SEASON = Number(process.argv[2] || 2026)
const PLAYERS = Number(process.argv[3] || 170)
const GAMMA = Number(process.argv[4] || 1)
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba'
const get = async (u) => { for (let i = 0; i < 3; i++) { const r = await fetch(u, { headers: UA }); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 400 * (i + 1))) } return null }
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } })); return out }

const S = await seasonStats(SEASON)
const P = { teams: await seasonTeams(SEASON - 1) }
const sample = [...S.athletes.values()].filter((a) => a.gp >= 40 && a.min >= 18).sort((a, b) => b.min - a.min)
  .filter((a) => { const v = [a.pts, a.reb, a.ast].filter(Number.isFinite).sort((x, y) => y - x); return v[1] >= REACH_MIN }).slice(0, PLAYERS)
console.log(`${SEASON}: ${sample.length} sampled players (rotation, second-best of pts/reb/ast >= ${REACH_MIN}); opponent clamp ${OPP_CLAMP.join('-')}, K ${OPP_K}, gamma ${GAMMA}`)
const logs = await pool(sample, 6, async (a) => {
  const [cur, prev] = await Promise.all([get(`${WEB}/athletes/${a.id}/gamelog?season=${SEASON}`), get(`${WEB}/athletes/${a.id}/gamelog?season=${SEASON - 1}`)])
  return { a, cur: reduceGamelog(cur || {}), prev: reduceGamelog(prev || {}) }
})

// candidates per night
const leaguePrior = leagueAllowed(P.teams), leagueSame = leagueAllowed(S.teams)
const nights = new Map()
for (const L of logs.filter(Boolean)) {
  const reg = L.cur.filter((g) => g.seasonType === 2 && g.date && g.min > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const priorSeason = realGames(L.prev)   // newest first
  const seen = []
  for (const g of reg) {
    const prior = [...seen.slice().reverse(), ...priorSeason].slice(0, WINDOW)   // newest first
    seen.push(g)
    if (prior.length < 20 || !g.opp) continue
    const n = prior.length, mean = (k) => prior.reduce((t, x) => t + (x[k] || 0), 0) / n
    const base = { ok: true, gp: n, ptsPg: mean('pts'), rebPg: mean('reb'), astPg: mean('ast'), minPg: mean('min') }
    if ((reachOf(base) ?? 0) < REACH_MIN) continue
    const legs = ddtdLegs(base, ddtdFromLog(prior))
    if (legs.ddRate == null) continue
    const day = String(g.date).slice(0, 10)
    const row = { gameId: `${day}|${g.id}`, playerId: L.a.id, name: L.a.name, team: `vs${g.opp}`, opp: g.opp, starter: true, base: legs, tens: tensIn(g), played: g.min >= 10 }
    if (!nights.has(day)) nights.set(day, [])
    nights.get(day).push(row)
  }
}

const VARIANTS = { PRIOR: [P.teams, leaguePrior], SAME: [S.teams, leagueSame] }
const tally = () => ({ n: 0, hit: 0 })
const T = {}
const bump = (key, hit) => { (T[key] ||= tally()).n += 1; if (hit) T[key].hit += 1 }
const MARKETS = [['dd', 2], ['td', 3]]
for (const [day, rows] of [...nights.entries()].sort()) {
  if (rows.length < 12) continue
  for (const [m, need] of MARKETS) {
    const eligible = rows.filter((r) => r.played)
    for (const r of eligible) bump(`${m} ALL eligible`, r.tens >= need)
    const score = (label, legsOf, ver) => {
      const cands = rows.map((r) => ({ ...r, legs: legsOf(r) }))
      const def = { needsLog: true, ...DDTD[m][ver] }
      const out = scoreMarket(m, cands, def)
      const by = new Map(out.map((r) => [`${r.gameId}|${r.playerId}`, r]))
      const graded = out.filter((r) => r.score != null && by.get(`${r.gameId}|${r.playerId}`) && cands.find((c) => c.playerId === r.playerId && c.gameId === r.gameId).played)
      const hit = (r) => cands.find((c) => c.playerId === r.playerId && c.gameId === r.gameId).tens >= need
      for (const r of graded.filter((x) => x.status === 'called')) bump(`${m} ${label} CALLED`, hit(r))
      for (const r of graded.filter((x) => x.status === 'called' || x.status === 'board')) bump(`${m} ${label} CALLED+BOARD`, hit(r))
      for (const k of [3, 5]) for (const r of [...graded].sort((a, b) => b.score - a.score).slice(0, k)) bump(`${m} ${label} night top ${k}`, hit(r))
    }
    score('v1', (r) => r.base, 'v1')
    for (const [name, [teams, league]] of Object.entries(VARIANTS)) {
      score(`v2 ${name}`, (r) => withOppAdjust(r.base, teams.get(r.opp), league, { gamma: GAMMA }), 'v2')
    }
  }
}
const pct = (t) => (t.n ? `${(100 * t.hit / t.n).toFixed(1)}% (${t.hit}/${t.n})` : 'n/a')
console.log(`nights with 12+ candidates: ${[...nights.values()].filter((r) => r.length >= 12).length}`)
for (const k of Object.keys(T).sort()) console.log(k.padEnd(34), pct(T[k]))
