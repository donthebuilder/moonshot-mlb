#!/usr/bin/env node
// BACKTEST of BUCKETS' team model (lib/nba/teamModel.js): expected points for a game, on a finished season of
// REAL games (ESPN club schedules; nothing made up).
//   node --import ./scripts/_esm-resolve.mjs scripts/backtest-nba-teammodel.mjs [season=2026] [fitBefore=2026-01-15] [--cache <file>]
// For every regular-season game of SEASON: each club's line uses only its games BEFORE that day (and last
// season's club line as the prior), plus the league mean, the home court and the back-to-back. Formulation and
// constants are tuned on games before `fitBefore` and scored on the games on or after it (HELD OUT).
// Baseline: the plain club points a game to date (needs 10 earlier games for both clubs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { easternDate } from '../lib/data.js'
import { averageOf, clubLine, leagueMean, restBefore, projectGame, PARAMS } from '../lib/nba/teamModel.js'

const SEASON = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 2026)
const FIT_BEFORE = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '2026-01-15'
const ci = process.argv.indexOf('--cache'); const CACHE = ci > 0 ? process.argv[ci + 1] : null
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 3; i++) { const r = await fetch(u, { headers: UA }); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 400 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }

async function seasonGames(season, teams) {
  const byId = new Map()
  await pool(teams, 6, async (t) => {
    const j = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/schedule?season=${season}&seasontype=2`)
    for (const e of j.events || []) {
      const c = e.competitions?.[0]; if (!c || c.status?.type?.name !== 'STATUS_FINAL') continue
      const away = c.competitors.find((x) => x.homeAway === 'away'), home = c.competitors.find((x) => x.homeAway === 'home')
      const as = Number(away?.score?.value ?? away?.score?.displayValue), hs = Number(home?.score?.value ?? home?.score?.displayValue)
      if (!Number.isFinite(as) || !Number.isFinite(hs)) continue
      byId.set(String(e.id), { id: String(e.id), date: easternDate(Date.parse(e.date)), away: away.team.abbreviation, home: home.team.abbreviation, as, hs })
    }
  })
  return [...byId.values()].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
}

let data
if (CACHE && existsSync(CACHE)) data = JSON.parse(readFileSync(CACHE, 'utf8'))
else {
  const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams')).sports[0].leagues[0].teams.map((t) => t.team)
  data = { cur: await seasonGames(SEASON, teams), prev: await seasonGames(SEASON - 1, teams) }
  if (CACHE) writeFileSync(CACHE, JSON.stringify(data))
}
const { cur, prev } = data
console.log(`season ${SEASON - 1}-${String(SEASON).slice(2)}: ${cur.length} final regular-season games; prior season ${SEASON - 2}-${String(SEASON - 1).slice(2)}: ${prev.length}`)

// last season's line per club, and the league mean
const prevRes = new Map()
for (const g of prev) { for (const [c, us, them] of [[g.away, g.as, g.hs], [g.home, g.hs, g.as]]) { if (!prevRes.has(c)) prevRes.set(c, []); prevRes.get(c).push({ us, them }) } }
const prior = new Map([...prevRes].map(([c, r]) => [c, averageOf(r)]))
const prevLeague = prev.reduce((t, g) => t + g.as + g.hs, 0) / (prev.length * 2)

// the evaluation rows: for each game, both clubs' PRE-GAME results (cumulative) and rest
const rows = []
{
  const res = new Map(), dates = new Map(); let sum = 0, tg = 0
  let i = 0
  while (i < cur.length) {
    let j = i; while (j < cur.length && cur[j].date === cur[i].date) j++
    const day = cur.slice(i, j), date = cur[i].date
    for (const g of day) {
      const ra = res.get(g.away) || [], rh = res.get(g.home) || []
      rows.push({ id: g.id, date, away: g.away, home: g.home, as: g.as, hs: g.hs, ra: ra.slice(), rh: rh.slice(), sum, tg,
        rest: { away: restBefore(dates.get(g.away), date), home: restBefore(dates.get(g.home), date) } })
    }
    for (const g of day) {
      for (const [c, us, them] of [[g.away, g.as, g.hs], [g.home, g.hs, g.as]]) {
        if (!res.has(c)) { res.set(c, []); dates.set(c, []) }
        res.get(c).push({ us, them }); dates.get(c).push(date); sum += us; tg += 1
      }
    }
    i = j
  }
}
const train = rows.filter((r) => r.date < FIT_BEFORE), test = rows.filter((r) => r.date >= FIT_BEFORE)
console.log(`games: ${rows.length}  fit (before ${FIT_BEFORE}): ${train.length}  HELD OUT: ${test.length}`)

const predict = (r, p) => {
  const L = leagueMean(r.tg, r.sum, prevLeague, p)
  const a = clubLine(r.ra, prior.get(r.away) || null, L, p), h = clubLine(r.rh, prior.get(r.home) || null, L, p)
  return projectGame({ away: a, home: h, L, rest: r.rest }, p)
}
const score = (set, fn) => {
  let n = 0, ae = 0, se = 0, bias = 0, tn = 0, tae = 0, tse = 0
  for (const r of set) {
    const g = fn(r); if (!g) continue
    for (const [pred, act] of [[g.away, r.as], [g.home, r.hs]]) { const e = pred - act; ae += Math.abs(e); se += e * e; bias += e; n++ }
    const te = g.total - (r.as + r.hs); tae += Math.abs(te); tse += te * te; tn++
  }
  return { n, mae: ae / n, rmse: Math.sqrt(se / n), bias: bias / n, tn, tmae: tae / tn, trmse: Math.sqrt(tse / tn) }
}
const fmt = (s) => `club points n=${s.n} MAE ${s.mae.toFixed(3)} RMSE ${s.rmse.toFixed(3)} bias ${s.bias >= 0 ? '+' : ''}${s.bias.toFixed(3)} | game total n=${s.tn} MAE ${s.tmae.toFixed(3)} RMSE ${s.trmse.toFixed(3)}`

// ── tune on TRAIN only ──
let best = null
for (const form of ['additive', 'multiplicative']) for (const shrinkGames of [4, 8, 12, 20, 30]) for (const priorKeep of [0, 0.3, 0.6, 0.8, 1])
  for (const defWeight of [0.6, 0.8, 1]) for (const home of [0, 0.5, 1, 1.5, 2]) for (const backToBack of [0, 1, 2]) for (const leagueShrinkGames of [30, 200, 600]) {
    const p = { ...PARAMS, form, shrinkGames, priorKeep, defWeight, home, backToBack, leagueShrinkGames }
    const s = score(train, (r) => predict(r, p)); if (!best || s.rmse < best.s.rmse) best = { p, s }
  }
console.log('\ntuned on train (RMSE of club points):', JSON.stringify({ form: best.p.form, shrinkGames: best.p.shrinkGames, priorKeep: best.p.priorKeep, defWeight: best.p.defWeight, home: best.p.home, backToBack: best.p.backToBack, leagueShrinkGames: best.p.leagueShrinkGames }))
console.log('  train', fmt(best.s))
// the formulations side by side, each with its own best constants on train (so the form is a fair choice)
for (const form of ['additive', 'multiplicative']) {
  let b = null
  for (const shrinkGames of [4, 8, 12, 20, 30]) for (const priorKeep of [0, 0.3, 0.6, 0.8, 1]) for (const defWeight of [0.6, 0.8, 1]) for (const home of [0, 0.5, 1, 1.5, 2]) for (const backToBack of [0, 1, 2]) for (const leagueShrinkGames of [30, 200, 600]) {
    const p = { ...PARAMS, form, shrinkGames, priorKeep, defWeight, home, backToBack, leagueShrinkGames }; const s = score(train, (r) => predict(r, p)); if (!b || s.rmse < b.s.rmse) b = { p, s }
  }
  console.log(`  best ${form.padEnd(14)} train RMSE ${b.s.rmse.toFixed(3)}  HELD OUT ${fmt(score(test, (r) => predict(r, b.p)))}`)
}

// ── HELD OUT against the plain club points a game ──
const SHIPPED = { ...PARAMS }
console.log(`\nshipped constants: ${JSON.stringify({ form: SHIPPED.form, shrinkGames: SHIPPED.shrinkGames, priorKeep: SHIPPED.priorKeep, defWeight: SHIPPED.defWeight, home: SHIPPED.home, backToBack: SHIPPED.backToBack })}`)
const plain = (r) => { // each club's points a game to date, 10 games needed; the opponent is not looked at
  if (r.ra.length < 10 || r.rh.length < 10) return null
  const a = averageOf(r.ra), h = averageOf(r.rh); return { away: a.pf, home: h.pf, total: a.pf + h.pf }
}
const both = test.filter((r) => plain(r))
const B = score(both, plain), M = score(both, (r) => predict(r, SHIPPED))
const imp = (a, b) => `${(100 * (1 - a / b)).toFixed(1)}%`
console.log(`\nHELD OUT, both clubs with >= 10 earlier games (${both.length} games):`)
console.log('  plain club points/game   ', fmt(B))
console.log('  team model (shipped)     ', fmt(M))
console.log(`  model better than the baseline: club-points MAE ${imp(M.mae, B.mae)}, RMSE ${imp(M.rmse, B.rmse)}; game-total MAE ${imp(M.tmae, B.tmae)}, RMSE ${imp(M.trmse, B.trmse)}`)
// the pieces, one off at a time
for (const [name, q] of [['no opponent (defWeight 0)', { defWeight: 0 }], ['no home court', { home: 0 }], ['no back-to-back', { backToBack: 0 }], ['no prior (league only)', { priorKeep: 0 }]]) console.log(`  without ${name.padEnd(26)}`, fmt(score(both, (r) => predict(r, { ...SHIPPED, ...q }))))
let closer = 0, m = 0; for (const r of both) { const p = predict(r, SHIPPED), b = plain(r); const e1 = Math.abs(p.total - r.as - r.hs), e2 = Math.abs(b.total - r.as - r.hs); m++; if (e1 < e2) closer++ }
console.log(`  closer than the baseline on the game total in ${closer} of ${m} held-out games (${(100 * closer / m).toFixed(1)}%)`)

// ── the early season: the games the baseline can't do ──
const early = test.concat(train).filter((r) => r.ra.length < 10 || r.rh.length < 10)
const lastSeason = (r) => { const a = prior.get(r.away), h = prior.get(r.home); return a && h ? { away: a.pf, home: h.pf, total: a.pf + h.pf } : null }
const e2 = early.filter((r) => lastSeason(r))
console.log(`\nEARLY SEASON (either club under 10 games, ${e2.length} games, all fit/held-out together since the baseline needs no fit):`)
console.log('  last season club points/game', fmt(score(e2, lastSeason)))
console.log('  team model (shipped)         ', fmt(score(e2, (r) => predict(r, SHIPPED))))
const lg = (r) => { const L = leagueMean(r.tg, r.sum, prevLeague); return { away: L, home: L, total: 2 * L } }
console.log('  league average only          ', fmt(score(e2, lg)))
const opener = rows.filter((r) => r.ra.length === 0 && r.rh.length === 0)
console.log(`  season openers (no game yet either club, n=${opener.length}): model ${fmt(score(opener, (r) => predict(r, SHIPPED)))}`)
console.log(`                                                       last season ${fmt(score(opener, lastSeason))}`)

// ── by month, held out ──
const byM = new Map(); for (const r of both) { const k = r.date.slice(0, 7); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(r) }
for (const [k, s] of [...byM].sort()) console.log(`    ${k}: baseline total MAE ${score(s, plain).tmae.toFixed(3)}  model ${score(s, (r) => predict(r, SHIPPED)).tmae.toFixed(3)}  (n=${s.length})`)
