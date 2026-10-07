#!/usr/bin/env node
// BACKTEST of BUCKETS' projected points (lib/nba/expectedPoints.js) against the naive baseline, on a
// finished season of REAL games (ESPN game logs and club results; nothing made up).
//   node --import ./scripts/_esm-resolve.mjs scripts/backtest-nba-xpts.mjs [season=2026] [split=2026-02-01] [players=220]
// For every game a player played: the projection uses only games BEFORE it (his last games, his season-to-date
// totals, the opponent's points allowed per game and the league mean before that day). The baseline is his
// season-to-date points per game before the game. Constants are tuned on games before `split`, then scored on
// games on or after it (held out). Games with < 10 prior games or < 5 recent are left out of both.
import { reduceGamelog } from '../lib/nba/api.js'
import { projectPoints, seasonAverage } from '../lib/nba/expectedPoints.js'
import { easternDate } from '../lib/data.js'

const SEASON = Number(process.argv[2] || 2026)
const SPLIT = process.argv[3] || '2026-02-01'
const PLAYERS = Number(process.argv[4] || 220)
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 3; i++) { const r = await fetch(u, { headers: UA }); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 400 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } })); return out }
const NOT_SEASON = /all-star|cup\s*-\s*(championship|final)/i

// ── clubs and their results (points scored / allowed, by ET day) ──
const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams')).sports[0].leagues[0].teams.map((t) => t.team)
const results = new Map()   // abbrev -> [{ date, allowed, scored }]
await pool(teams, 6, async (t) => {
  const j = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/schedule?season=${SEASON}&seasontype=2`)
  const rows = []
  for (const e of j.events || []) {
    const c = e.competitions?.[0]; if (!c || c.status?.type?.name !== 'STATUS_FINAL') continue
    const me = c.competitors.find((x) => x.team.abbreviation === t.abbreviation), op = c.competitors.find((x) => x !== me)
    const us = Number(me?.score?.value ?? me?.score?.displayValue), them = Number(op?.score?.value ?? op?.score?.displayValue)
    if (Number.isFinite(us) && Number.isFinite(them)) rows.push({ date: easternDate(Date.parse(e.date)), allowed: them, scored: us })
  }
  results.set(t.abbreviation, rows.sort((a, b) => (a.date < b.date ? -1 : 1)))
})
const allowedBefore = (abbrev, date) => { const g = (results.get(abbrev) || []).filter((r) => r.date < date); return g.length >= 10 ? g.reduce((t, r) => t + r.allowed, 0) / g.length : null }
const leagueBefore = (date) => { let s = 0, n = 0; for (const rows of results.values()) for (const r of rows) if (r.date < date) { s += r.scored; n += 1 } return n >= 300 ? s / n : null }
const leagueCache = new Map(); const league = (d) => { if (!leagueCache.has(d)) leagueCache.set(d, leagueBefore(d)); return leagueCache.get(d) }

// ── players: rotation scorers from the league's season table, then each game log ──
const ids = []
for (let page = 1; ids.length < PLAYERS && page <= 8; page++) {
  const j = await get(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&season=${SEASON}&seasontype=2&limit=50&page=${page}`)
  for (const a of j.athletes || []) ids.push(String(a.athlete.id))
  if (page >= (j.pagination?.pages || 1)) break
}
const logs = (await pool(ids.slice(0, PLAYERS), 8, async (id) => reduceGamelog(await get(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=${SEASON}`))
  .filter((g) => g.seasonType === 2 && !NOT_SEASON.test(g.note || '') && g.date && g.min > 0 && g.pts != null).map((g) => ({ ...g, day: easternDate(Date.parse(g.date)) })).sort((a, b) => (a.day < b.day ? -1 : 1)))).filter(Boolean)
console.log(`players with a log: ${logs.length}; clubs with results: ${results.size}`)

// ── build the evaluation rows (pre-game information only) ──
const rows = []
for (const log of logs) {
  for (let i = 10; i < log.length; i++) {
    const g = log[i], prior = log.slice(0, i)
    const base = seasonAverage(prior)
    if (base == null) continue
    const recentAll = prior.slice().reverse()
    rows.push({ day: g.day, actual: g.pts, base, recentAll, season: { min: prior.reduce((t, x) => t + x.min, 0), pts: prior.reduce((t, x) => t + x.pts, 0) },
      allowed: allowedBefore(g.opp, g.day), league: league(g.day) })
  }
}
const run = (set, opts, useOpp = true) => {
  let ae = 0, se = 0, n = 0, bias = 0
  for (const r of set) {
    const p = projectPoints({ recent: r.recentAll, season: r.season, opp: useOpp && r.allowed != null && r.league != null ? { allowed: r.allowed, league: r.league } : null }, opts)
    if (!p.ok) continue
    const e = p.xpts - r.actual; ae += Math.abs(e); se += e * e; bias += e; n++
  }
  return { n, mae: ae / n, rmse: Math.sqrt(se / n), bias: bias / n }
}
const trainSet = rows.filter((r) => r.day < SPLIT), testSet = rows.filter((r) => r.day >= SPLIT)
const baseScore = (set) => { let ae = 0, se = 0, bias = 0; for (const r of set) { const e = r.base - r.actual; ae += Math.abs(e); se += e * e; bias += e } return { n: set.length, mae: ae / set.length, rmse: Math.sqrt(se / set.length), bias: bias / set.length } }
console.log(`evaluation rows: ${rows.length} (train < ${SPLIT}: ${trainSet.length}; held out: ${testSet.length}); held-out nights: ${new Set(testSet.map((r) => r.day)).size}`)

// tune on TRAIN only
let best = null
for (const n of [5, 8, 10, 15, 20]) for (const k of [100, 300, 600, 1200, 3000]) for (const beta of [0, 0.25, 0.5, 0.75, 1]) {
  const s = run(trainSet, { n, k, beta }); if (!best || s.mae < best.s.mae) best = { n, k, beta, s }
}
console.log(`tuned on train: n=${best.n} k=${best.k} beta=${best.beta} (train MAE ${best.s.mae.toFixed(3)})`)
const fmt = (s) => `n=${s.n} MAE ${s.mae.toFixed(3)} RMSE ${s.rmse.toFixed(3)} bias ${s.bias >= 0 ? '+' : ''}${s.bias.toFixed(3)}`
const B = baseScore(testSet)
console.log('\nHELD-OUT (games on or after the split):')
console.log(`  naive season average          ${fmt(B)}`)
const shipped = run(testSet, {}, true), noOpp = run(testSet, {}, false), tuned = run(testSet, { n: best.n, k: best.k, beta: best.beta })
console.log(`  shipped constants (lib)       ${fmt(shipped)}`)
console.log(`  shipped, no opponent factor   ${fmt(noOpp)}`)
console.log(`  tuned-on-train constants      ${fmt(tuned)}`)
const imp = (a, b) => `${(100 * (1 - a / b)).toFixed(1)}%`
console.log(`  MAE better than baseline by ${imp(shipped.mae, B.mae)}, RMSE ${imp(shipped.rmse, B.rmse)}; opponent factor adds ${imp(shipped.mae, noOpp.mae)} of MAE`)
// paired: how often the projection is closer than the baseline, and by game-night chunks
let closer = 0, tie = 0, m = 0
for (const r of testSet) { const p = projectPoints({ recent: r.recentAll, season: r.season, opp: r.allowed != null && r.league != null ? { allowed: r.allowed, league: r.league } : null }); if (!p.ok) continue; m++; const a = Math.abs(p.xpts - r.actual), b = Math.abs(r.base - r.actual); if (a < b) closer++; else if (a === b) tie++ }
console.log(`  closer than the baseline on ${closer} of ${m} held-out games (${(100 * closer / m).toFixed(1)}%), ties ${tie}`)
// by-month stability
const byM = new Map(); for (const r of testSet) { const k = r.day.slice(0, 7); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(r) }
for (const [k, s] of [...byM].sort()) console.log(`    ${k}: baseline MAE ${baseScore(s).mae.toFixed(3)}  projection MAE ${run(s, {}).mae.toFixed(3)}  (n=${s.length})`)
