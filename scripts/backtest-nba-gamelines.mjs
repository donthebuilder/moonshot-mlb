#!/usr/bin/env node
// BACKTEST of BUCKETS' game-line model (lib/nba/gameLines.js): a projected margin -> the spread side and the
// moneyline side, on a finished season of REAL games and REAL lines (nothing made up).
//   node --import ./scripts/_esm-resolve.mjs scripts/backtest-nba-gamelines.mjs [season=2026] [fitBefore=2026-01-15] [--cache <file>] [--box <file>]
// v0 = ratings only. v1 = + WHO PLAYS: each club's rotation (minutes a game over its last 10, a game sat = 0) times
// each player's game score a minute (season to date, shrunk to last season's), minus the players in tonight's box
// score. The box score stands in for the injury report at the lock: it is the BEST CASE (a late scratch the report
// missed is in it), so v1's numbers are an upper bound on what the live model can do.
// Results: ESPN club schedules (regular season, finals). Lines: ESPN's odds feed for each game (DraftKings, the
// provider it lists first): the OPENING and CLOSING spread, spread price and moneyline. A game with no line on file
// is left out of the line tests, never filled in. Each club's rating uses only games BEFORE that day.
// Constants are tuned on games before `fitBefore` and every line test is scored on the games on or after it (HELD OUT).
// The benchmark is the book: the closing spread is the best public guess there is, so "as good as the close" is the
// bar, and a spread record is only interesting past 52.4% (the -110 break-even) on enough games.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { easternDate } from '../lib/data.js'
import { solveRatings, projectMargin, homeWinShare, noVig, payout, atsResult, missingValue, shrunkRate, LINE_PARAMS } from '../lib/nba/gameLines.js'
import { restBefore } from '../lib/nba/teamModel.js'

const arg = (i, d) => (process.argv[i] && !process.argv[i].startsWith('--') ? process.argv[i] : d)
const SEASON = Number(arg(2, 2026)), FIT_BEFORE = arg(3, '2026-01-15')
const ci = process.argv.indexOf('--cache'); const CACHE = ci > 0 ? process.argv[ci + 1] : null
const bi = process.argv.indexOf('--box'); const BOXFILE = bi > 0 ? process.argv[bi + 1] : null
// --live: only what the site can read at the lock -- a player's rate from the club's last 10 box scores (no season-long
// numbers, no last-season prior), and no full-strength re-solve of past games
const LIVE = process.argv.includes('--live')
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 4; i++) { const r = await fetch(u, { headers: UA }).catch(() => null); if (r?.ok) return r.json(); if (r?.status === 404) return null; await new Promise((s) => setTimeout(s, 500 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
const DAY = 86400000, dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)

async function seasonGames(season, teams) {
  const byId = new Map()
  await pool(teams, 6, async (t) => {
    const j = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/schedule?season=${season}&seasontype=2`)
    for (const e of j?.events || []) {
      const c = e.competitions?.[0]; if (!c || c.status?.type?.name !== 'STATUS_FINAL') continue
      const away = c.competitors.find((x) => x.homeAway === 'away'), home = c.competitors.find((x) => x.homeAway === 'home')
      const as = Number(away?.score?.value ?? away?.score?.displayValue), hs = Number(home?.score?.value ?? home?.score?.displayValue)
      if (!Number.isFinite(as) || !Number.isFinite(hs)) continue
      byId.set(String(e.id), { id: String(e.id), date: easternDate(Date.parse(e.date)), away: away.team.abbreviation, home: home.team.abbreviation, as, hs })
    }
  })
  return [...byId.values()].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
}

// "-5.5" / "+190" / "EVEN" -> number, else null
const am = (v) => { const s = String(v ?? '').trim().toUpperCase(); if (s === 'EVEN' || s === 'EV') return 100; const n = Number(s.replace(/^\+/, '')); return Number.isFinite(n) && s !== '' ? n : null }
function readLine(j) {
  // an in-game ("Live Odds") line is not a pregame line: never used
  const it = (j?.items || []).filter((x) => !/live/i.test(x.provider?.name || '')).slice().sort((a, b) => (a.provider?.priority ?? 99) - (b.provider?.priority ?? 99))[0]
  if (!it) return null
  const side = (o, k) => ({
    spread: am(o?.[k]?.pointSpread?.american), spreadOdds: am(o?.[k]?.spread?.american), ml: am(o?.[k]?.moneyLine?.american),
  })
  const H = it.homeTeamOdds, A = it.awayTeamOdds
  const pack = (k) => { const h = side(H, k), a = side(A, k); return { spreadHome: h.spread ?? (a.spread != null ? -a.spread : null), spreadOddsHome: h.spreadOdds, spreadOddsAway: a.spreadOdds, mlHome: h.ml, mlAway: a.ml } }
  const close = pack('close')
  // the plain fields are the last line ESPN kept; they stand in for a close the feed did not split out
  if (close.spreadHome == null && Number.isFinite(it.spread)) close.spreadHome = it.spread
  if (close.mlHome == null) close.mlHome = am(H?.moneyLine); if (close.mlAway == null) close.mlAway = am(A?.moneyLine)
  if (close.spreadOddsHome == null) close.spreadOddsHome = am(H?.spreadOdds); if (close.spreadOddsAway == null) close.spreadOddsAway = am(A?.spreadOdds)
  return { provider: it.provider?.name || null, open: pack('open'), close }
}

let data
if (CACHE && existsSync(CACHE)) data = JSON.parse(readFileSync(CACHE, 'utf8'))
else {
  const teams = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams')).sports[0].leagues[0].teams.map((t) => t.team)
  const cur = await seasonGames(SEASON, teams), prev = await seasonGames(SEASON - 1, teams)
  let done = 0
  await pool(cur, 8, async (g) => {
    const j = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${g.id}/competitions/${g.id}/odds`).catch(() => null)
    g.line = readLine(j); if (++done % 200 === 0) process.stderr.write(`  lines ${done}/${cur.length}\n`)
  })
  data = { cur, prev }
  if (CACHE) writeFileSync(CACHE, JSON.stringify(data))
}
const { cur, prev } = data
for (const g of cur) if (/live/i.test(g.line?.provider || '')) g.line = null   // a cache written before the in-game filter
const clubs = [...new Set(cur.flatMap((g) => [g.away, g.home]))].sort()
const withClose = cur.filter((g) => g.line?.close?.spreadHome != null)
console.log(`season ${SEASON - 1}-${String(SEASON).slice(2)}: ${cur.length} final regular-season games, ${withClose.length} with a closing spread on file (${cur.filter((g) => g.line?.close?.mlHome != null && g.line?.close?.mlAway != null).length} with both moneylines), provider ${[...new Set(cur.map((g) => g.line?.provider).filter(Boolean))].join('/')}; prior season ${prev.length} games`)

// last season's end ratings (no prior of their own, all games equal weight): the prior for this one
const prevRatings = (p) => solveRatings(prev.map((g) => ({ ...g, ago: 0 })), clubs, {}, { ...p, priorGames: 1, priorKeep: 0 }, null, 40)

// ── WHO PLAYS: box scores (cached), then each game's missing game score for both clubs, from pregame numbers only ──
async function fetchBox(g) {
  const j = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${g.id}`).catch(() => null)
  const out = {}
  for (const t of j?.boxscore?.players || []) {
    const s = t.statistics?.[0]; if (!s) continue
    const ix = Object.fromEntries(s.keys.map((x, i) => [x, i]))
    out[t.team.abbreviation] = (s.athletes || []).filter((a) => a.stats?.length).map((a) => {
      const v = (key) => Number(a.stats[ix[key]]) || 0
      const pair = (key) => String(a.stats[ix[key]] || '0-0').split('-').map(Number)
      const [fgm, fga] = pair('fieldGoalsMade-fieldGoalsAttempted'), [ftm, fta] = pair('freeThrowsMade-freeThrowsAttempted')
      // Hollinger's game score
      const gs = v('points') + 0.4 * fgm - 0.7 * fga - 0.4 * (fta - ftm) + 0.7 * v('offensiveRebounds') + 0.3 * v('defensiveRebounds') + v('steals') + 0.7 * v('assists') + 0.7 * v('blocks') - 0.4 * v('fouls') - v('turnovers')
      return [a.athlete.id, v('minutes'), Math.round(gs * 10) / 10]
    }).filter((x) => x[1] > 0)
  }
  return Object.keys(out).length === 2 ? out : null
}
let BOX = BOXFILE && existsSync(BOXFILE) ? JSON.parse(readFileSync(BOXFILE, 'utf8')) : null
if (BOXFILE && !BOX) {
  BOX = {}
  await pool([...cur, ...prev], 8, async (g) => { const b = await fetchBox(g); if (b) BOX[g.id] = b })
  writeFileSync(BOXFILE, JSON.stringify(BOX))
}
const RATE_K = 300, ROT_GAMES = 10, ROT_MIN_GAMES = 3
if (BOX) {
  const prevTot = new Map()
  for (const g of prev) for (const side of Object.values(BOX[g.id] || {})) for (const [id, min, gs] of side) { const t = prevTot.get(id) || { min: 0, gs: 0 }; t.min += min; t.gs += gs; prevTot.set(id, t) }
  // a player new to the league starts at a bench rate: the 20th percentile of last season's 500+ minute players
  const rates = [...prevTot.values()].filter((t) => t.min >= 500).map((t) => t.gs / t.min).sort((a, b) => a - b)
  const repl = rates[Math.floor(rates.length * 0.2)]
  const priorRate = (id) => { const t = prevTot.get(id); return t ? shrunkRate(t.gs, t.min, repl, RATE_K) : repl }
  const curTot = new Map(), teamLast = new Map()
  const seasonRate = (id) => { const t = curTot.get(id); return t ? shrunkRate(t.gs, t.min, priorRate(id), RATE_K) : priorRate(id) }
  let i = 0, known = 0
  while (i < cur.length) {
    let j = i; while (j < cur.length && cur[j].date === cur[i].date) j++
    const day = cur.slice(i, j)
    for (const g of day) {
      const b = BOX[g.id]
      for (const [side, abbr] of [['missAway', g.away], ['missHome', g.home]]) {
        const last = teamLast.get(abbr) || []
        if (!b?.[abbr] || last.length < ROT_MIN_GAMES) { g[side] = null; continue }
        const mins = new Map(), gss = new Map(); for (const gm of last) for (const [id, min, gs] of gm) { mins.set(id, (mins.get(id) || 0) + min); gss.set(id, (gss.get(id) || 0) + gs) }
        const rotation = [...mins].map(([id, m]) => ({ id, min: m / last.length }))
        const rate = LIVE ? (id) => shrunkRate(gss.get(id) || 0, mins.get(id) || 0, repl, RATE_K) : seasonRate
        g[side] = missingValue(rotation, new Set(b[abbr].map((x) => x[0])), rate)
      }
      if (g.missAway != null && g.missHome != null) known++
    }
    // after the day: its games join the numbers
    for (const g of day) for (const [abbr, side] of Object.entries(BOX[g.id] || {})) {
      for (const [id, min, gs] of side) { const t = curTot.get(id) || { min: 0, gs: 0 }; t.min += min; t.gs += gs; curTot.set(id, t) }
      const last = teamLast.get(abbr) || []; last.push(side); if (last.length > ROT_GAMES) last.shift(); teamLast.set(abbr, last)
    }
    i = j
  }
  const ms = cur.flatMap((g) => [g.missAway, g.missHome]).filter((v) => v != null).sort((a, b) => a - b)
  console.log(`WHO PLAYS: ${Object.keys(BOX).length} box scores; ${known} games with both clubs' missing value; missing game score a club-game median ${ms[ms.length >> 1].toFixed(1)}, 90th pct ${ms[Math.floor(ms.length * 0.9)].toFixed(1)} (bench rate ${repl.toFixed(3)} a minute)`)
}

// pregame rows: each game with the games before its day, and both clubs' rest
function buildRows(p) {
  const prior = prevRatings(p)
  const rows = [], dates = new Map()
  let i = 0, warm = null
  while (i < cur.length) {
    let j = i; while (j < cur.length && cur[j].date === cur[i].date) j++
    const date = cur[i].date, t = dayNum(date)
    const before = cur.slice(0, i).map((g) => ({ ...g, ago: t - dayNum(g.date), adj: p.value * ((g.missHome || 0) - (g.missAway || 0)) }))
    const r = solveRatings(before, clubs, prior, p, warm); warm = r
    for (const g of cur.slice(i, j)) {
      const rest = { away: restBefore(dates.get(g.away), date), home: restBefore(dates.get(g.home), date) }
      const m = projectMargin(r[g.home], r[g.away], { b2bHome: rest.home === 1, b2bAway: rest.away === 1, missHome: g.missHome || 0, missAway: g.missAway || 0 }, p)
      rows.push({ ...g, m, rest, n: before.length })
    }
    for (const g of cur.slice(i, j)) for (const c of [g.away, g.home]) { if (!dates.has(c)) dates.set(c, []); dates.get(c).push(date) }
    i = j
  }
  return rows
}

const margin = (r) => r.hs - r.as
const mae = (set, f) => set.reduce((t, r) => t + Math.abs(f(r) - margin(r)), 0) / set.length
const rmse = (set, f) => Math.sqrt(set.reduce((t, r) => t + (f(r) - margin(r)) ** 2, 0) / set.length)
const logloss = (set, f) => set.reduce((t, r) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, f(r))); return t - (margin(r) > 0 ? Math.log(q) : Math.log(1 - q)) }, 0) / set.length
const brier = (set, f) => set.reduce((t, r) => t + (f(r) - (margin(r) > 0 ? 1 : 0)) ** 2, 0) / set.length

// ── tune on TRAIN only (margin RMSE), then WIN_SD by log loss on train ──
// stage 1: the rating constants, with the back-to-back and WHO PLAYS laid on top of each solve (neither moves the
// ratings then); stage 2 (v1): the same with past margins put back to full strength first (fullStrength), which does.
const VALUES = BOX ? [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.75, 1] : [0]
const cacheRows = new Map()
function tune(values) {
  let best = null
  for (const halfLife of [20, 40, 80, 1e6]) for (const priorGames of [3, 6, 10, 20]) for (const priorKeep of [0.3, 0.5, 0.7, 0.9]) for (const home of [1.5, 2.5, 3.5]) {
    const key = JSON.stringify([halfLife, priorGames, priorKeep, home])
    if (!cacheRows.has(key)) cacheRows.set(key, buildRows({ ...LINE_PARAMS, halfLife, priorGames, priorKeep, home, backToBack: 0, value: 0, fullStrength: false }))
    for (const backToBack of [0, 1.5, 3]) for (const value of values) {
      const p = { ...LINE_PARAMS, halfLife, priorGames, priorKeep, home, backToBack, value, fullStrength: false }
      const rows = cacheRows.get(key).map((r) => ({ ...r, m: r.m - (r.rest.home === 1 ? backToBack : 0) + (r.rest.away === 1 ? backToBack : 0) + value * ((r.missAway || 0) - (r.missHome || 0)) }))
      const s = rmse(rows.filter((r) => r.date < FIT_BEFORE && r.m != null), (r) => r.m)
      if (!best || s < best.s) best = { p, s, rows }
    }
  }
  if (values.length > 1 && !LIVE) for (const value of values.filter((v) => v > 0)) {
    const p = { ...best.p, value, fullStrength: true }
    const rows = buildRows(p); const s = rmse(rows.filter((r) => r.date < FIT_BEFORE && r.m != null), (r) => r.m)
    if (s < best.s) best = { p, s, rows }
  }
  const train = best.rows.filter((r) => r.date < FIT_BEFORE)
  let bsd = null
  for (let sd = 9; sd <= 16; sd += 0.25) { const ll = logloss(train, (r) => homeWinShare(r.m, { ...best.p, winSd: sd })); if (!bsd || ll < bsd.ll) bsd = { sd, ll } }
  return { P: { ...best.p, winSd: bsd.sd }, rows: best.rows, s: best.s }
}

function report(label, { P, rows, s }) {
const train = rows.filter((r) => r.date < FIT_BEFORE), test = rows.filter((r) => r.date >= FIT_BEFORE)
console.log(`\n================ ${label} ================`)
console.log(`games: ${rows.length}  fit (before ${FIT_BEFORE}): ${train.length}  HELD OUT: ${test.length}`)
console.log(`tuned on fit games: ${JSON.stringify({ halfLife: P.halfLife, priorGames: P.priorGames, priorKeep: P.priorKeep, home: P.home, backToBack: P.backToBack, value: P.value, fullStrength: P.fullStrength, winSd: P.winSd })}  (fit margin RMSE ${s.toFixed(2)})`)
const summary = {}
// ── HELD OUT: the margin, against the book ──
const T = test.filter((r) => r.line?.close?.spreadHome != null && r.line?.open?.spreadHome != null)
const bookClose = (r) => -r.line.close.spreadHome, bookOpen = (r) => -r.line.open.spreadHome
console.log(`\nHELD OUT, MARGIN (home points minus road points), ${T.length} games with an open and a close spread:`)
console.log(`  model        MAE ${mae(T, (r) => r.m).toFixed(2)}  RMSE ${rmse(T, (r) => r.m).toFixed(2)}`)
console.log(`  book open    MAE ${mae(T, bookOpen).toFixed(2)}  RMSE ${rmse(T, bookOpen).toFixed(2)}`)
console.log(`  book close   MAE ${mae(T, bookClose).toFixed(2)}  RMSE ${rmse(T, bookClose).toFixed(2)}`)
summary['margin MAE (close ' + mae(T, bookClose).toFixed(2) + ')'] = mae(T, (r) => r.m).toFixed(2)
console.log(`  home court only (${P.home} pts) MAE ${mae(T, () => P.home).toFixed(2)}`)
console.log(`  model vs close: the two differ by ${mae(T, (r) => r.m - bookClose(r) + margin(r)).toFixed(2)} pts a game on average`)

// ── HELD OUT: who wins ──
const M = test.filter((r) => r.line?.close?.mlHome != null && r.line?.close?.mlAway != null && noVig(r.line.close.mlHome, r.line.close.mlAway))
const mkt = (r) => noVig(r.line.close.mlHome, r.line.close.mlAway).home
const pm = (r) => homeWinShare(r.m, P)
const su = (set, f) => set.filter((r) => (f(r) > 0.5) === (margin(r) > 0)).length / set.length
console.log(`\nHELD OUT, WINNER, ${M.length} games with both closing moneylines (shares logged, never printed on the site):`)
console.log(`  model       picks the winner ${(100 * su(M, pm)).toFixed(1)}%  log loss ${logloss(M, pm).toFixed(4)}  Brier ${brier(M, pm).toFixed(4)}`)
summary['picks the winner (close ' + (100 * su(M, mkt)).toFixed(1) + '%)'] = (100 * su(M, pm)).toFixed(1) + '%'
summary['log loss (close ' + logloss(M, mkt).toFixed(4) + ')'] = logloss(M, pm).toFixed(4)
console.log(`  book close  picks the winner ${(100 * su(M, mkt)).toFixed(1)}%  log loss ${logloss(M, mkt).toFixed(4)}  Brier ${brier(M, mkt).toFixed(4)}  (cut taken out)`)
console.log(`  coin + home ${(100 * M.filter((r) => margin(r) > 0).length / M.length).toFixed(1)}% home wins`)
// calibration of the logged share, 5 bins
const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]
for (let b = 0; b < 5; b++) { const s = M.filter((r) => pm(r) >= bins[b] && pm(r) < bins[b + 1]); if (s.length) console.log(`    model share ${bins[b].toFixed(1)}-${Math.min(1, bins[b + 1]).toFixed(1)}: n=${String(s.length).padStart(3)}  said ${(100 * s.reduce((t, r) => t + pm(r), 0) / s.length).toFixed(1)}%  home won ${(100 * s.filter((r) => margin(r) > 0).length / s.length).toFixed(1)}%`) }

// ── HELD OUT: the spread record (the side the model likes, by how far it is off the line) ──
function atsRecord(set, which, edge) {
  let w = 0, l = 0, pu = 0, units = 0
  for (const r of set) {
    const ln = r.line[which]; const e = r.m + ln.spreadHome // > 0: the model likes the home side
    if (Math.abs(e) < edge) continue
    const side = e > 0 ? 'home' : 'away', res = atsResult(margin(r), ln.spreadHome)
    const price = (side === 'home' ? ln.spreadOddsHome : ln.spreadOddsAway) ?? -110
    if (res === 'push') pu++; else if (res === side) { w++; units += payout(price) } else { l++; units -= 1 }
  }
  return { w, l, pu, units }
}
const ci95 = (w, n) => { const p = w / n, h = 1.96 * Math.sqrt(p * (1 - p) / n); return `${(100 * (p - h)).toFixed(1)}-${(100 * (p + h)).toFixed(1)}%` }
for (const which of ['close', 'open']) {
  console.log(`\nHELD OUT, SPREAD vs the ${which.toUpperCase()} (pick = the side the model likes; break-even at -110 is 52.4%):`)
  for (const edge of [0, 1, 2, 3, 4, 5, 6]) {
    const s = atsRecord(T, which, edge), n = s.w + s.l
    if (n && which === 'close' && (edge === 0 || edge === 3)) summary[`spread vs close, >= ${edge} off`] = `${s.w}-${s.l} ${(100 * s.w / n).toFixed(1)}%`
    if (n) console.log(`  off the line by >= ${edge} pts: ${String(s.w).padStart(3)}-${String(s.l).padStart(3)}-${s.pu}  ${(100 * s.w / n).toFixed(1)}% (95% ${ci95(s.w, n)})  ${s.units >= 0 ? '+' : ''}${s.units.toFixed(1)} units on ${n}`)
  }
}

// ── HELD OUT: does the line move toward the model? (open -> close, the steam test) ──
{
  let toward = 0, away = 0, still = 0
  for (const r of T) {
    const e = r.m + r.line.open.spreadHome; if (Math.abs(e) < 2) continue
    const mv = r.line.close.spreadHome - r.line.open.spreadHome // > 0: the line moved toward the road side... home got more points
    // the model likes home (e>0) -> a move toward the model makes the home number SMALLER (more points given): mv < 0
    const t = e > 0 ? -mv : mv
    if (Math.abs(mv) < 1e-9) still++; else if (t > 0) toward++; else away++
  }
  console.log(`\nHELD OUT, LINE MOVE where the model was 2+ pts off the open: moved toward the model ${toward}, away ${away}, did not move ${still}`)
  summary['line moved toward / away'] = `${toward} / ${away}`
}

// ── HELD OUT: moneyline, the side whose logged share beats the no-cut close by a margin ──
console.log('\nHELD OUT, MONEYLINE at the close (bet 1 unit when the model share beats the cut-free book share by >= t):')
for (const t of [0.02, 0.04, 0.06, 0.08, 0.1]) {
  let n = 0, w = 0, units = 0
  for (const r of M) {
    const d = pm(r) - mkt(r); if (Math.abs(d) < t) continue
    const homeSide = d > 0, price = homeSide ? r.line.close.mlHome : r.line.close.mlAway, won = homeSide === (margin(r) > 0)
    n++; if (won) { w++; units += payout(price) } else units -= 1
  }
  if (n) console.log(`  t=${t.toFixed(2)}: ${w} of ${n} won  ${units >= 0 ? '+' : ''}${units.toFixed(1)} units  (ROI ${(100 * units / n).toFixed(1)}%)`)
}

// ── by month, held out ──
console.log('\nHELD OUT by month (margin MAE model / close; spread record vs close at edge >= 3):')
const byM = new Map(); for (const r of T) { const k = r.date.slice(0, 7); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(r) }
for (const [k, s] of [...byM].sort()) { const a = atsRecord(s, 'close', 3); console.log(`  ${k}: ${mae(s, (r) => r.m).toFixed(2)} / ${mae(s, bookClose).toFixed(2)}  ${a.w}-${a.l}-${a.pu}  (n=${s.length})`) }

// ── the early season (fit and held out together: the model's weakest stretch) ──
const early = rows.filter((r) => r.date < `${SEASON - 1}-12-01` && r.line?.close?.spreadHome != null)
if (early.length) { const a = atsRecord(early, 'close', 3); console.log(`\nEARLY SEASON (before ${SEASON - 1}-12-01, ${early.length} games; these are FIT games): margin MAE model ${mae(early, (r) => r.m).toFixed(2)} / close ${mae(early, bookClose).toFixed(2)}; spread vs close at >= 3: ${a.w}-${a.l}-${a.pu}`) }
return summary
}

const V0 = report('v0: ratings only', tune([0]))
if (BOX) {
  const V1 = report('v1: ratings + WHO PLAYS (box score as the injury report: best case)', tune(VALUES))
  console.log('\n================ v0 -> v1, HELD OUT ================')
  for (const k of Object.keys(V0)) console.log(`  ${k.padEnd(34)} ${V0[k]}  ->  ${V1[k]}`)
}
