#!/usr/bin/env node
// BACKTEST of the game-line model (lib/nba/gameLines.js's arithmetic, any sport) on a finished season of REAL games and
// REAL lines (nothing made up). MLB / NFL / NHL; BUCKETS has its own (scripts/backtest-nba-gamelines.mjs, + who plays).
//   node --import ./scripts/_esm-resolve.mjs scripts/backtest-gamelines.mjs --sport nfl|nhl|mlb [--cache <file>]
// Results: ESPN club schedules (regular season, finals). Lines: ESPN's odds feed per game (its first-listed pregame
// provider; an in-game "Live Odds" line is never used): open and close spread (MLB run line / NHL puck line), price,
// moneyline. Ratings use only games BEFORE each day. Constants tuned on games before the sport's split, scored after.
// The bar: the book's close. MLB and NHL spreads are nearly always 1.5, so there the moneyline (who wins) is the test.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { easternDate } from '../lib/data.js'
import { solveRatings, homeWinShare, noVig, payout, atsResult, LINE_PARAMS } from '../lib/nba/gameLines.js'
import { restBefore } from '../lib/nba/teamModel.js'

const flag = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SPORT = flag('--sport', 'nfl'), CACHE = flag('--cache', null)
// season = ESPN's season year; short = days of rest that count as a short turn-around (NHL: back-to-back; NFL: a Thursday)
const CFG = {
  nfl: { path: 'football/nfl', league: 'nfl', season: 2025, fitBefore: '2025-11-15', unit: 'points', short: 4, halfLife: [30, 60, 120, 1e6], priorGames: [1, 2, 4, 8], home: [0, 1, 2, 3], shortRest: [0, 1, 2], sd: [10, 17] },
  nhl: { path: 'hockey/nhl', league: 'nhl', season: 2026, fitBefore: '2026-01-15', unit: 'goals', short: 1, halfLife: [20, 40, 80, 1e6], priorGames: [5, 10, 20, 40], home: [0, 0.15, 0.3, 0.45], shortRest: [0, 0.15, 0.3], sd: [1.5, 3.5] },
  mlb: { path: 'baseball/mlb', league: 'mlb', season: 2025, fitBefore: '2025-07-01', unit: 'runs', short: 0, halfLife: [20, 40, 80, 1e6], priorGames: [10, 20, 40, 80], home: [0, 0.15, 0.3, 0.45], shortRest: [0], sd: [2.5, 6] },
}[SPORT]
if (!CFG) { console.error('--sport nfl|nhl|mlb'); process.exit(1) }
const SEASON = Number(flag('--season', CFG.season)), FIT_BEFORE = flag('--fit-before', CFG.fitBefore)
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 4; i++) { const r = await fetch(u, { headers: UA }).catch(() => null); if (r?.ok) return r.json(); if (r?.status === 404) return null; await new Promise((s) => setTimeout(s, 500 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
const DAY = 86400000, dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)

async function seasonGames(season, teams) {
  const byId = new Map()
  await pool(teams, 6, async (t) => {
    const j = await get(`https://site.api.espn.com/apis/site/v2/sports/${CFG.path}/teams/${t.id}/schedule?season=${season}&seasontype=2`)
    for (const e of j?.events || []) {
      const c = e.competitions?.[0]; if (!c || c.status?.type?.name !== 'STATUS_FINAL') continue
      const away = c.competitors.find((x) => x.homeAway === 'away'), home = c.competitors.find((x) => x.homeAway === 'home')
      const as = Number(away?.score?.value ?? away?.score?.displayValue), hs = Number(home?.score?.value ?? home?.score?.displayValue)
      if (!Number.isFinite(as) || !Number.isFinite(hs)) continue
      byId.set(String(e.id), { id: String(e.id), date: easternDate(Date.parse(e.date)), away: away.team.abbreviation, home: home.team.abbreviation, as, hs, neutral: Boolean(c.neutralSite) })
    }
  })
  return [...byId.values()].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
}
const am = (v) => { const s = String(v ?? '').trim().toUpperCase(); if (s === 'EVEN' || s === 'EV') return 100; const n = Number(s.replace(/^\+/, '')); return Number.isFinite(n) && s !== '' ? n : null }
function readLine(j) {
  const it = (j?.items || []).filter((x) => !/live/i.test(x.provider?.name || '')).sort((a, b) => (a.provider?.priority ?? 99) - (b.provider?.priority ?? 99))[0]
  if (!it) return null
  const side = (o, k) => ({ spread: am(o?.[k]?.pointSpread?.american), spreadOdds: am(o?.[k]?.spread?.american), ml: am(o?.[k]?.moneyLine?.american) })
  const H = it.homeTeamOdds, A = it.awayTeamOdds
  const pack = (k) => { const h = side(H, k), a = side(A, k); return { spreadHome: h.spread ?? (a.spread != null ? -a.spread : null), spreadOddsHome: h.spreadOdds, spreadOddsAway: a.spreadOdds, mlHome: h.ml, mlAway: a.ml } }
  const close = pack('close')
  if (close.spreadHome == null && Number.isFinite(it.spread)) close.spreadHome = it.spread
  if (close.mlHome == null) close.mlHome = am(H?.moneyLine); if (close.mlAway == null) close.mlAway = am(A?.moneyLine)
  if (close.spreadOddsHome == null) close.spreadOddsHome = am(H?.spreadOdds); if (close.spreadOddsAway == null) close.spreadOddsAway = am(A?.spreadOdds)
  return { provider: it.provider?.name || null, open: pack('open'), close }
}

let data
if (CACHE && existsSync(CACHE)) data = JSON.parse(readFileSync(CACHE, 'utf8'))
else {
  const teams = (await get(`https://site.api.espn.com/apis/site/v2/sports/${CFG.path}/teams`)).sports[0].leagues[0].teams.map((t) => t.team)
  const cur = await seasonGames(SEASON, teams), prev = await seasonGames(SEASON - 1, teams)
  let done = 0
  await pool(cur, 8, async (g) => {
    const j = await get(`https://sports.core.api.espn.com/v2/sports/${CFG.path.split('/')[0]}/leagues/${CFG.league}/events/${g.id}/competitions/${g.id}/odds`).catch(() => null)
    g.line = readLine(j); if (++done % 300 === 0) process.stderr.write(`  lines ${done}/${cur.length}\n`)
  })
  data = { cur, prev }
  if (CACHE) writeFileSync(CACHE, JSON.stringify(data))
}
const { cur, prev } = data
const clubs = [...new Set([...cur, ...prev].flatMap((g) => [g.away, g.home]))].sort()
const hasML = (g) => g.line?.close?.mlHome != null && g.line?.close?.mlAway != null && noVig(g.line.close.mlHome, g.line.close.mlAway)
console.log(`${SPORT.toUpperCase()} season ${SEASON}: ${cur.length} final regular-season games, ${cur.filter((g) => g.line?.close?.spreadHome != null).length} with a closing spread, ${cur.filter(hasML).length} with both closing moneylines (${[...new Set(cur.map((g) => g.line?.provider).filter(Boolean))].join(' / ')}); prior season ${prev.length}`)

function buildRows(p) {
  const prior = solveRatings(prev.map((g) => ({ ...g, ago: 0 })), clubs, {}, { ...p, priorGames: 1, priorKeep: 0 }, null, 40)
  const rows = [], dates = new Map()
  let i = 0, warm = null
  while (i < cur.length) {
    let j = i; while (j < cur.length && cur[j].date === cur[i].date) j++
    const date = cur[i].date, t = dayNum(date)
    const r = solveRatings(cur.slice(0, i).map((g) => ({ ...g, ago: t - dayNum(g.date) })), clubs, prior, p, warm); warm = r
    for (const g of cur.slice(i, j)) {
      const rest = { away: restBefore(dates.get(g.away), date), home: restBefore(dates.get(g.home), date) }
      const sh = (x) => x != null && CFG.short > 0 && x <= CFG.short
      const m = r[g.home] - r[g.away] + (g.neutral ? 0 : p.home) - (sh(rest.home) ? p.backToBack : 0) + (sh(rest.away) ? p.backToBack : 0)
      rows.push({ ...g, m, rest })
    }
    for (const g of cur.slice(i, j)) for (const c of [g.away, g.home]) { if (!dates.has(c)) dates.set(c, []); dates.get(c).push(date) }
    i = j
  }
  return rows
}
const margin = (r) => r.hs - r.as
const mae = (s, f) => s.reduce((t, r) => t + Math.abs(f(r) - margin(r)), 0) / s.length
const rmse = (s, f) => Math.sqrt(s.reduce((t, r) => t + (f(r) - margin(r)) ** 2, 0) / s.length)
const ll = (s, f) => s.reduce((t, r) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, f(r))); return t - (margin(r) > 0 ? Math.log(q) : Math.log(1 - q)) }, 0) / s.length
const su = (s, f) => s.filter((r) => (f(r) > 0.5) === (margin(r) > 0)).length / s.length
const decided = (r) => margin(r) !== 0   // NFL ties are left out of the winner tests

// tune on the fit games (margin RMSE), then the curve's spread by log loss
let best = null
for (const halfLife of CFG.halfLife) for (const priorGames of CFG.priorGames) for (const priorKeep of [0.3, 0.5, 0.7, 0.9]) for (const home of CFG.home) {
  const base = buildRows({ ...LINE_PARAMS, halfLife, priorGames, priorKeep, home, backToBack: 0 })
  for (const backToBack of CFG.shortRest) {
    const rows = backToBack ? base.map((r) => ({ ...r, m: r.m - (r.rest.home != null && r.rest.home <= CFG.short ? backToBack : 0) + (r.rest.away != null && r.rest.away <= CFG.short ? backToBack : 0) })) : base
    const s = rmse(rows.filter((r) => r.date < FIT_BEFORE), (r) => r.m)
    if (!best || s < best.s) best = { p: { ...LINE_PARAMS, halfLife, priorGames, priorKeep, home, backToBack }, s, rows }
  }
}
const fit = best.rows.filter((r) => r.date < FIT_BEFORE && decided(r))
let bsd = null
for (let sd = CFG.sd[0]; sd <= CFG.sd[1]; sd += (CFG.sd[1] - CFG.sd[0]) / 40) { const v = ll(fit, (r) => homeWinShare(r.m, { winSd: sd })); if (!bsd || v < bsd.v) bsd = { sd, v } }
const P = { ...best.p, winSd: Math.round(bsd.sd * 100) / 100 }
const test = best.rows.filter((r) => r.date >= FIT_BEFORE)
console.log(`fit ${best.rows.length - test.length} games before ${FIT_BEFORE}, HELD OUT ${test.length}`)
console.log(`tuned: ${JSON.stringify({ halfLife: P.halfLife, priorGames: P.priorGames, priorKeep: P.priorKeep, home: P.home, shortRest: P.backToBack, winSd: P.winSd })} (fit margin RMSE ${best.s.toFixed(2)} ${CFG.unit})`)

const T = test.filter((r) => r.line?.close?.spreadHome != null && r.line?.open?.spreadHome != null)
const close = (r) => -r.line.close.spreadHome
console.log(`\nHELD OUT, MARGIN (${CFG.unit}), ${T.length} games with an open + close spread:`)
console.log(`  model MAE ${mae(T, (r) => r.m).toFixed(2)}${SPORT === 'nfl' ? `   book close MAE ${mae(T, close).toFixed(2)}   book open MAE ${mae(T, (r) => -r.line.open.spreadHome).toFixed(2)}` : '   (book spread is a 1.5 run/puck line, not a margin guess)'}`)
const M = test.filter((r) => hasML(r) && decided(r))
const pm = (r) => homeWinShare(r.m, P), mk = (r) => noVig(r.line.close.mlHome, r.line.close.mlAway).home
console.log(`\nHELD OUT, WINNER, ${M.length} games with both closing moneylines (shares logged, never printed):`)
console.log(`  model      picks the winner ${(100 * su(M, pm)).toFixed(1)}%  log loss ${ll(M, pm).toFixed(4)}`)
console.log(`  book close picks the winner ${(100 * su(M, mk)).toFixed(1)}%  log loss ${ll(M, mk).toFixed(4)}  (cut taken out)`)
console.log(`  home wins ${(100 * M.filter((r) => margin(r) > 0).length / M.length).toFixed(1)}%`)
function ats(set, which, edge) {
  let w = 0, l = 0, pu = 0, u = 0
  for (const r of set) {
    const ln = r.line[which]; if (ln?.spreadHome == null) continue
    // the model's side against this spread: its expected cover margin (MLB/NHL: the same margin vs the 1.5)
    const e = r.m + ln.spreadHome; if (Math.abs(e) < edge) continue
    const side = e > 0 ? 'home' : 'away', res = atsResult(margin(r), ln.spreadHome), price = (side === 'home' ? ln.spreadOddsHome : ln.spreadOddsAway) ?? -110
    if (res === 'push') pu++; else if (res === side) { w++; u += payout(price) } else { l++; u -= 1 }
  }
  return { w, l, pu, u }
}
const edges = SPORT === 'nfl' ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1]
console.log(`\nHELD OUT, SPREAD vs the CLOSE (the side the model likes):`)
for (const e of edges) { const s = ats(T, 'close', e), n = s.w + s.l; if (n) console.log(`  >= ${e} off: ${s.w}-${s.l}-${s.pu}  ${(100 * s.w / n).toFixed(1)}%  ${s.u >= 0 ? '+' : ''}${s.u.toFixed(1)} units on ${n}`) }
console.log(`\nHELD OUT, MONEYLINE at the close (1 unit when the model's share beats the cut-free book share by >= t):`)
for (const t of [0.02, 0.05, 0.08]) {
  let n = 0, w = 0, u = 0
  for (const r of M) { const d = pm(r) - mk(r); if (Math.abs(d) < t) continue; const home = d > 0, won = home === (margin(r) > 0); n++; if (won) { w++; u += payout(home ? r.line.close.mlHome : r.line.close.mlAway) } else u -= 1 }
  if (n) console.log(`  t=${t}: ${w} of ${n} won  ${u >= 0 ? '+' : ''}${u.toFixed(1)} units (ROI ${(100 * u / n).toFixed(1)}%)`)
}
console.log(`\nCONSTANTS ${SPORT}: ${JSON.stringify({ halfLife: P.halfLife, priorGames: P.priorGames, priorKeep: P.priorKeep, home: P.home, backToBack: P.backToBack, winSd: P.winSd })}`)
