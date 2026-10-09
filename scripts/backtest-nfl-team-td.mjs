// Held-out backtest of the TUDDY team touchdown model vs the old roster-sum dial.
//   node scripts/backtest-nfl-team-td.mjs <dir with nfl_logs.json [nfl_week.json] [nfl_matchup.json]>
// Tested and left out (each made the 2025 held-out score worse): home field, rest days, a yards-based offence rate.
// Truth: the touchdowns the tracked players scored in each club's game (nfl_logs.json g_td, summed per club-game),
// the same unit the model projects. Walk-forward: every week is predicted from games BEFORE it only.
import fs from 'node:fs'
import path from 'node:path'
import { teamGames, fitTeams, projectGame, PARAMS } from '../lib/nfl/teamTdModel.js'

const dir = process.argv[2]
if (!dir) { console.error('usage: backtest-nfl-team-td.mjs <data dir>'); process.exit(2) }
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null } }
const logs = load('nfl_logs.json'); const week = load('nfl_week.json')
const rows = teamGames(logs)
// FULL-COVERAGE TRUTH (a cross-check, NOT a site input): nflverse team week stats, offensive TDs = rushing_tds + passing_tds.
// stats_team_week_<season>.csv from https://github.com/nflverse/nflverse-data/releases/download/stats_team/ (REG season only).
const REAL = new Map()
for (const season of [2025, 2026]) {
  let txt = null
  try { txt = fs.readFileSync(path.join(dir, `stats_team_week_${season}.csv`), 'utf8') } catch { /* optional */ }
  if (!txt) continue
  const lines = txt.trim().split('\n'); const head = lines[0].split(',')
  const ix = (n) => head.indexOf(n)
  for (const ln of lines.slice(1)) {
    const c = ln.split(',')
    if (c[ix('season_type')] !== 'REG') continue
    REAL.set(`${season}|${Number(c[ix('week')])}|${c[ix('team')]}`, (Number(c[ix('rushing_tds')]) || 0) + (Number(c[ix('passing_tds')]) || 0))
  }
}
const truthOf = (r) => (REAL.size ? REAL.get(`${r.s}|${r.w}|${r.tm}`) : r.td)
const lfact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s }
const pnll = (lam, y) => lam - y * Math.log(lam) + lfact(y)
const corr = (x, y) => { const n = x.length; const mx = x.reduce((a, b) => a + b, 0) / n; const my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 } return sxy / Math.sqrt(sxx * syy) }

// games: pair the two club-rows of one game
const byGame = new Map()
for (const r of rows) { const k = `${r.s}|${r.w}|${[r.tm, r.opp].sort().join('@')}`; const g = byGame.get(k) || { s: r.s, w: r.w, rows: [] }; g.rows.push(r); byGame.set(k, g) }
const games = [...byGame.values()].filter((g) => g.rows.length === 2 && g.rows.every((r) => truthOf(r) != null))

function evaluate(params, filter, opts = {}) {
  const teamP = []; const teamY = []; const totP = []; const totY = []
  const cache = new Map()
  for (const g of games) {
    if (!filter(g)) continue
    const ck = `${g.s}|${g.w}`
    if (!cache.has(ck)) cache.set(ck, fitTeams(rows, g.s, g.w, params))
    const m = cache.get(ck)
    if (m.mu == null || m.off.size === 0) continue
    const [x, y] = g.rows
    const home = x.h === 1 ? x : y.h === 1 ? y : null
    const away = home === x ? y : home === y ? x : null
    const a = away || x; const h = home || y
    const p = projectGame(m, a.tm, h.tm)
    if (!p) continue
    teamP.push(p.awayTd, p.homeTd); teamY.push(truthOf(a), truthOf(h))
    totP.push(p.total); totY.push(truthOf(a) + truthOf(h))
  }
  const n = teamP.length
  const sum = (v) => v.reduce((a, b) => a + b, 0)
  if (opts.autoCover) { const sc = sum(teamY) / sum(teamP); for (let i = 0; i < teamP.length; i++) teamP[i] *= sc; for (let i = 0; i < totP.length; i++) totP[i] *= sc; opts.coverOut = sc }
  return {
    games: n / 2, bias: (sum(teamP) - sum(teamY)) / n,
    nll: sum(teamP.map((l, i) => pnll(l, teamY[i]))) / n,
    mae: sum(totP.map((v, i) => Math.abs(v - totY[i]))) / totP.length,
    r: corr(totP, totY), rTeam: corr(teamP, teamY),
  }
}

const fmt = (o) => `games ${o.games}  bias ${o.bias.toFixed(3)}  nll/team ${o.nll.toFixed(4)}  MAE(total) ${o.mae.toFixed(3)}  r(total) ${o.r.toFixed(3)}  r(team) ${o.rTeam.toFixed(3)}`
const train = (g) => g.s === 2025 && g.w >= 5          // tuning folds
const test = (g) => g.s === 2026 && g.w <= 4           // untouched
const trainAll = (g) => g.s === 2025 && g.w >= 2

if (process.argv.includes('--grid')) {
  const res = []
  for (const a of [0.45, 0.65, 0.9, 1.1, 1.3]) for (const b of [0, 0.35, 0.7, 1.0]) for (const k of [0, 1, 2, 3, 4, 6]) for (const carry of [0.4]) {
    const o = { autoCover: true }; res.push({ a, b, k, carry, cover: 0, ...evaluate({ ...PARAMS, a, b, k, carry }, train, o), c: o.coverOut })
  }
  res.sort((x, y) => x.nll - y.nll)
  for (const r of res.slice(0, 8)) console.log(JSON.stringify({ a: r.a, b: r.b, k: r.k, carry: r.carry, cover: +r.c.toFixed(3) }), fmt(r))
  process.exit(0)
}
if (process.argv.includes('--extras')) {
  const base = { ...PARAMS }
  const run = (label, P) => { const o = { autoCover: true }; console.log(label.padEnd(18), fmt(evaluate(P, train, o)), 'cover', o.coverOut.toFixed(3)) }
  run('base', base)
  for (const b of [0, 0.35, 0.7]) run(`defence b${b}`, { ...base, b })
  process.exit(0)
}

console.log('PARAMS', JSON.stringify(PARAMS))
// baselines on the same games
const flatP = { ...PARAMS, a: 0, b: 0 }                       // league average only
const plain = { ...PARAMS, a: 1, b: 0, k: 0 }        // plain team TD/game to date
const plainSh = { ...PARAMS, a: 1, b: 0 }                      // plain team TD/game, shrunk
for (const [name, f] of [['TUNING 2025 w5-18', train], ['HELD-OUT 2026 w1-4', test]]) {
  console.log(`\n== ${name}`)
  console.log('league average only :', fmt(evaluate(flatP, f)))
  console.log('plain team TD/game  :', fmt(evaluate(plain, f)))
  console.log('team TD/game shrunk :', fmt(evaluate(plainSh, f)))
  console.log('TEAM MODEL (shipped):', fmt(evaluate(PARAMS, f)))
}

// SAME-LEAK COMPARISON: the team model refit on ALL of 2026 w1-4 (so every game it scores is in its own fit), the way the
// old dial's current xTDs already contain those games. This is the fair partner for the old-dial line below.
{
  const m = fitTeams(rows, 2026, 5, PARAMS)
  const tp = []; const ty = []; const op = []; const oy = []
  for (const g of games.filter(test)) { const [x, y] = g.rows; const p = projectGame(m, x.tm, y.tm); tp.push(p.awayTd, p.homeTd); ty.push(truthOf(x), truthOf(y)); op.push(p.total); oy.push(truthOf(x) + truthOf(y)) }
  const n = tp.length; const sum = (v) => v.reduce((a, b) => a + b, 0)
  console.log('\n== TEAM MODEL refit on 2026 w1-4 itself (same leak as the old dial below)')
  console.log(`games ${n / 2}  bias ${((sum(tp) - sum(ty)) / n).toFixed(3)}  nll/team ${(sum(tp.map((l, i) => pnll(l, ty[i]))) / n).toFixed(4)}  MAE(total) ${(sum(op.map((v, i) => Math.abs(v - oy[i]))) / op.length).toFixed(3)}  r(total) ${corr(op, oy).toFixed(3)}  r(team) ${corr(tp, ty).toFixed(3)}`)
}

// the OLD dial, replayed as far as the stored data allows: sum of every non-bye player's CURRENT xTD per club.
// LEAKY and IN SAMPLE (those xTDs were built after weeks 1-4 were played) so it can only flatter the dial.
if (week) {
  const by = new Map()
  for (const p of week.players || []) if (!p.on_bye) by.set(p.team, (by.get(p.team) || 0) + (Number(p?.stats?.xTD) || 0))
  const teamP = []; const teamY = []; const totP = []; const totY = []
  for (const g of games.filter(test)) {
    const [x, y] = g.rows
    if (!by.has(x.tm) || !by.has(y.tm)) continue
    teamP.push(by.get(x.tm), by.get(y.tm)); teamY.push(truthOf(x), truthOf(y)); totP.push(by.get(x.tm) + by.get(y.tm)); totY.push(truthOf(x) + truthOf(y))
  }
  const n = teamP.length; const sum = (v) => v.reduce((a, b) => a + b, 0)
  console.log('\n== OLD DIAL (sum of players xTD, current values; in-sample, leaky), 2026 w1-4')
  console.log(`games ${n / 2}  bias ${((sum(teamP) - sum(teamY)) / n).toFixed(3)}  nll/team ${(sum(teamP.map((l, i) => pnll(l, teamY[i]))) / n).toFixed(4)}  MAE(total) ${(sum(totP.map((v, i) => Math.abs(v - totY[i]))) / totP.length).toFixed(3)}  r(total) ${corr(totP, totY).toFixed(3)}  r(team) ${corr(teamP, teamY).toFixed(3)}`)
}
