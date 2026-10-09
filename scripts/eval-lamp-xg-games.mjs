#!/usr/bin/env node
// HELD-OUT NIGHTS for the game dial (lamp-xg-v1, 2026-10-07). Offline, deterministic.
//
//   node scripts/eval-lamp-xg-games.mjs <dir with shots.jsonl and goal-log.jsonl> [--cutoff=2026-02-01] [--write]
//
// Question: does a team's projected goals from lamp-xg-v1 (expected shot volume x xG a shot, with the
// opposing goalie's measured quality) beat the dial the board carries today (each skater's goals a game,
// added up) on games neither was tuned on?
//   every prediction for a game uses only games dated BEFORE it (window: the club's last 82 regular-season games)
//   shrink constants are tuned on a block INSIDE the train window (2025-12-01 .. cutoff), then frozen
//   scored on: games dated at/after the cutoff (2025-26), and the first 2026-27 regular-season nights
//   "today's dial", two ways: (a) the REAL logged dial (lamp_goal_log, 70 games since 2026-09-25, preseason included)
//   and (b) its emulation by a club's goals a game over the same window, shrunk to the league mean
//   (the board sums skaters' pooled goals/GP, which is that club rate before lineup changes; emulation lets it run
//   on every 2025-26 night, where the log does not exist)
import { readFileSync, writeFileSync } from 'node:fs'
import './_esm-resolve.mjs'
import { loadShots, regularSeason } from './_lampxg.mjs'
import { xgShot, XG_COEF, goalieFactor } from '../lib/nhl/xg.js'
import { projectClub } from '../lib/nhl/xgGame.js'
import { isEmptyNet } from '../lib/nhl/xgFeatures.js'
import { teamGameRows } from '../lib/nhl/teamXg.js'
import { windowOf, projectTeam, rateOppProject } from '../lib/nhl/teamProj.js'

const dir = process.argv[2]
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d
const CUTOFF = arg('cutoff', '2026-02-01'); const TUNE_FROM = '2025-12-01'; const WINDOW = 82; const GOALIE_GAMES = 10
if (!dir) { console.error('usage: eval-lamp-xg-games.mjs <dir>'); process.exit(1) }
const shotsAll = loadShots(`${dir}/shots.jsonl`)
const shots = regularSeason(shotsAll)               // regular season: the history every prediction reads
const preShots = shotsAll.filter((r) => r.game_type === 1)
const logRows = readFileSync(`${dir}/goal-log.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

// ── per game, per club ────────────────────────────────────────────────────
function build(rows) {
  const G = new Map()
  for (const r of rows) {
    let g = G.get(r.game_id); if (!g) G.set(r.game_id, g = { id: r.game_id, date: r.game_date, season: r.season, type: r.game_type, t: {} })
    const t = g.t[r.team] || (g.t[r.team] = { team: r.team, gf: 0, sog: 0, xg: 0, sogNE: 0, en: 0, goalies: new Map() })
    if (r.result === 'goal') t.gf += 1
    if (r.result !== 'sog' && r.result !== 'goal') continue
    if (isEmptyNet(r)) { if (r.result === 'goal') t.en += 1; continue }
    const v = xgShot(r)
    if (v == null) continue
    t.sog += 1; t.xg += v
    const gl = t.goalies.get(r.goalie_id) || { sa: 0, ga: 0, xga: 0 }
    gl.sa += 1; gl.ga += r.result === 'goal' ? 1 : 0; gl.xga += v; t.goalies.set(r.goalie_id, gl)   // by the SHOOTING club: the goalie they faced
  }
  return [...G.values()].filter((g) => Object.keys(g.t).length === 2).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
}
const games = build(shots); const preGames = build(preShots)
const teamGames = new Map()   // team -> [{date, ...}] regular season, in date order
for (const g of games) for (const [team, t] of Object.entries(g.t)) {
  const opp = Object.keys(g.t).find((k) => k !== team)
  const arr = teamGames.get(team) || []; arr.push({ id: g.id, date: g.date, gf: t.gf, ga: g.t[opp].gf, sogF: t.sog, sogA: g.t[opp].sog, xgF: t.xg, xgA: g.t[opp].xg, goaliesFaced: g.t[opp].goalies /* goalies of THIS club: faced shots by opp */ })
  teamGames.set(team, arr)
}
// the goalies of club X in a game = the goalie_ids on the OTHER club's shots; stored under the shooter. Re-key by defending club:
const defGoalies = (g, team) => { const opp = Object.keys(g.t).find((k) => k !== team); return g.t[opp].goalies }
const gameById = new Map([...games, ...preGames].map((g) => [g.id, g]))
// the SITE's path: the club-game rows lib/nhl/teamXg.js writes, read through lib/nhl/teamProj.js. Scored below as 'team';
// 'team' must equal xgGC (same model by hand) to the last digit, which is the proof the shipped code is the evaluated model.
const teamRows = new Map()
for (const r of teamGameRows(shots)) { const a = teamRows.get(r.team) || []; a.push(r); teamRows.set(r.team, a) }

// league means from the TRAIN window only
const trainGames = games.filter((g) => g.season === 20252026 && g.date < CUTOFF)
const nTG = trainGames.length * 2
const L = { gf: 0, sog: 0, xg: 0 }
for (const g of trainGames) for (const t of Object.values(g.t)) { L.gf += t.gf; L.sog += t.sog; L.xg += t.xg }
L.xgPerSog = L.xg / L.sog; L.gf /= nTG; L.sog /= nTG; L.xg /= nTG
const EN = XG_COEF.emptyNet.goalsPerClubGame

// ── history a prediction may use: this club's games before `date`, last WINDOW ──
function hist(team, date) {
  const arr = teamGames.get(team) || []
  let hi = arr.length; while (hi > 0 && arr[hi - 1].date >= date) hi--
  return arr.slice(Math.max(0, hi - WINDOW), hi)
}
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)

// goalie history: every goalie's (ga, xga) before the date, across all history, shrunk
function goalieTable(date) {
  const m = new Map()
  for (const g of games) { if (g.date >= date) break
    for (const t of Object.values(g.t)) for (const [id, v] of t.goalies) { const x = m.get(id) || { ga: 0, xga: 0 }; x.ga += v.ga; x.xga += v.xga; m.set(id, x) } }
  return m
}
const goalieCache = new Map()
const gTable = (date) => { if (!goalieCache.has(date)) goalieCache.set(date, goalieTable(date)); return goalieCache.get(date) }

// share-weighted goalie factor of a club's defence: its last GOALIE_GAMES games' goalies by shots faced
function defenceFactor(team, date, k) {
  const h = hist(team, date).slice(-GOALIE_GAMES)
  const faced = new Map()
  for (const x of h) { const g = gameById.get(x.id); for (const [id, v] of defGoalies(g, team)) faced.set(id, (faced.get(id) || 0) + v.sa) }
  const tot = [...faced.values()].reduce((a, b) => a + b, 0)
  if (!tot) return 1
  const tab = gTable(date)
  let f = 0
  for (const [id, sa] of faced) { const x = tab.get(id); f += (sa / tot) * (x ? goalieFactor(x.ga, x.xga, k) : 1) }
  return f
}

// the same factor, but a goalie's (GA, xGA) is read ONLY from the games of the club's own window -- the
// aggregate the site can carry per club (lamp_team_game_xg) without a league-wide goalie view
function defenceFactorClub(team, date, k) {
  const h = hist(team, date); const last = h.slice(-GOALIE_GAMES)
  const tab = new Map()
  for (const x of h) { const g = gameById.get(x.id); for (const [id, v] of defGoalies(g, team)) { const a = tab.get(id) || { ga: 0, xga: 0 }; a.ga += v.ga; a.xga += v.xga; tab.set(id, a) } }
  const faced = new Map()
  for (const x of last) { const g = gameById.get(x.id); for (const [id, v] of defGoalies(g, team)) faced.set(id, (faced.get(id) || 0) + v.sa) }
  const tot = [...faced.values()].reduce((a, b) => a + b, 0)
  if (!tot) return 1
  let f = 0
  for (const [id, sa] of faced) { const x = tab.get(id); f += (sa / tot) * (x ? goalieFactor(x.ga, x.xga, k) : 1) }
  return f
}

const shrink = (sum_, n, mean, k) => (sum_ + k * mean) / (n + k)
function predict(team, opp, date, P) {
  const h = hist(team, date); const ho = hist(opp, date); const n = h.length; const no = ho.length
  const out = {}
  out.const = L.gf
  out.rate = shrink(sum(h, (x) => x.gf), n, L.gf, P.kRate)                    // the dial, emulated
  const gaOpp = shrink(sum(ho, (x) => x.ga), no, L.gf, P.kRate)
  out.rateOpp = L.gf + (out.rate - L.gf) + (gaOpp - L.gf)                       // the rate plus the opposing defence's rate
  const own = { n, sog: sum(h, (x) => x.sogF), xg: sum(h, (x) => x.xgF) }; const against = { n: no, sog: sum(ho, (x) => x.sogA), xg: sum(ho, (x) => x.xgA) }
  const proj = projectClub({ own, against, league: { sog: L.sog, xgPerSog: L.xgPerSog }, k: { sog: P.kSog, q: P.kQ }, emptyNet: EN })
  out.xg = proj.goals
  const gf = defenceFactor(opp, date, XG_COEF.goalie.k ?? P.kGoalie)
  out.xgGoalie = projectClub({ own, against, league: { sog: L.sog, xgPerSog: L.xgPerSog }, k: { sog: P.kSog, q: P.kQ }, goalieFactor: gf, emptyNet: EN }).goals
  out.goalieFactor = gf
  const gfc = defenceFactorClub(opp, date, XG_COEF.goalie.k ?? P.kGoalie)
  out.xgGC = projectClub({ own, against, league: { sog: L.sog, xgPerSog: L.xgPerSog }, k: { sog: P.kSog, q: P.kQ }, goalieFactor: gfc, emptyNet: EN }).goals
  const SM = { windowGames: WINDOW, goalieGames: GOALIE_GAMES, league: { gf: L.gf, sog: L.sog, xgPerSog: L.xgPerSog, emptyNet: EN }, k: { rate: P.kRate, sog: P.kSog, q: P.kQ, goalie: XG_COEF.goalie.k ?? P.kGoalie } }
  const wo = windowOf(teamRows.get(team), date, SM); const wp = windowOf(teamRows.get(opp), date, SM)
  out.team = projectTeam(wo, wp, SM).goals
  out.rateOppT = rateOppProject({ gf: sum(wo, (x) => x.gf), n: wo.length }, { ga: sum(wp, (x) => x.ga), n: wp.length }, SM)
  out.blendRate = (P.wRate ?? 0.5) * out.xgGC + (1 - (P.wRate ?? 0.5)) * out.rate
  out.blendOpp = (P.wOpp ?? 0.5) * out.xgGC + (1 - (P.wOpp ?? 0.5)) * out.rateOpp
  out.rateGoalie = out.rate * gf
  return out
}

const pearson = (a, b) => { const n = a.length; const ma = a.reduce((x, y) => x + y, 0) / n; const mb = b.reduce((x, y) => x + y, 0) / n; let sab = 0; let saa = 0; let sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2 } return sab / Math.sqrt(saa * sbb) }
const ranks = (a) => { const idx = a.map((_, i) => i).sort((x, y) => a[x] - a[y]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++; for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2; i = j + 1 } return r }
const spearman = (a, b) => pearson(ranks(a), ranks(b))
const POIS = (mu, y) => { const m = Math.max(0.2, mu); return m - y * Math.log(m) }
function score(set, P, keys) {
  const acc = Object.fromEntries(keys.map((k) => [k, { nll: 0, se: 0, ae: 0, n: 0 }]))
  for (const g of set) for (const [team, t] of Object.entries(g.t)) {
    const opp = Object.keys(g.t).find((k) => k !== team); const p = predict(team, opp, g.date, P)
    for (const k of keys) { const a = acc[k]; a.nll += POIS(p[k], t.gf); a.se += (p[k] - t.gf) ** 2; a.ae += Math.abs(p[k] - t.gf); a.n += 1 }
  }
  for (const k of keys) { const a = acc[k]; a.nll /= a.n; a.mse = a.se / a.n; a.mae = a.ae / a.n }
  return acc
}

// ── tune on the block inside train ───────────────────────────────────────
const tuneSet = games.filter((g) => g.season === 20252026 && g.date >= TUNE_FROM && g.date < CUTOFF)
const best = (cands, f) => cands.map((c) => [c, f(c)]).sort((a, b) => a[1] - b[1])[0][0]
const BASE = { kRate: 20, kSog: 20, kQ: 150, kGoalie: 20 }
const P = { ...BASE }
P.kRate = best([0, 5, 10, 20, 40, 80, 160], (k) => score(tuneSet, { ...BASE, kRate: k }, ['rate']).rate.nll)
P.kSog = best([0, 5, 10, 20, 40, 80, 160], (k) => score(tuneSet, { ...BASE, ...P, kSog: k }, ['xg']).xg.nll)
P.kQ = best([20, 50, 100, 200, 400, 800, 1600, 3200, 6400, 1e9], (k) => score(tuneSet, { ...BASE, ...P, kQ: k }, ['xg']).xg.nll)
// the goalie K lives in the model file once chosen; tune with a free override first
const tuneK = (k) => { XG_COEF.goalie.k = k; goalieCache.clear(); return score(tuneSet, P, ['xgGoalie']).xgGoalie.nll }
P.kGoalie = best([2, 5, 10, 20, 40, 80, 160, 320, 640, 1280], tuneK)
XG_COEF.goalie.k = P.kGoalie
P.wRate = best([0, 0.25, 0.5, 0.75, 1], (w) => score(tuneSet, { ...P, wRate: w }, ['blendRate']).blendRate.nll)
P.wOpp = best([0, 0.25, 0.5, 0.75, 1], (w) => score(tuneSet, { ...P, wOpp: w }, ['blendOpp']).blendOpp.nll)
console.log(`tuned on ${tuneSet.length} games ${TUNE_FROM}..${CUTOFF}:`, JSON.stringify(P))
console.log(`league means (train): goals ${L.gf.toFixed(3)} / club-game, shots on goal ${L.sog.toFixed(2)}, xG a shot ${L.xgPerSog.toFixed(4)}, empty-net goals ${EN.toFixed(3)}`)

// ── held-out ─────────────────────────────────────────────────────────────
const KEYS = ['const', 'rate', 'rateGoalie', 'rateOpp', 'xg', 'xgGoalie', 'xgGC', 'team', 'blendRate', 'blendOpp']
const NAME = { const: 'no model (league mean)', rate: "today's dial, emulated (club goals/game)", rateGoalie: 'today\'s dial x opposing goalie factor', rateOpp: 'rate + opposing defence rate', xg: 'xG: volume x xG a shot', xgGoalie: 'xG + goalie quality', xgGC: 'xG + goalie (club-window aggregate)', team: 'lamp-team-v1 (the site code path)', blendRate: 'blend: xGgc + club rate', blendOpp: 'blend: xGgc + rate+opp defence' }
const valid = games.filter((g) => g.season === 20252026 && g.date >= CUTOFF)
const next = games.filter((g) => g.season === 20262027)
function boot(set, a, b, iters = 2000) {   // paired bootstrap over games, deterministic LCG; returns mean diff of NLL (a - b) and a 95% interval
  const d = set.map((g) => { let s = 0; for (const [team, t] of Object.entries(g.t)) { const opp = Object.keys(g.t).find((k) => k !== team); const p = predict(team, opp, g.date, P); s += POIS(p[a], t.gf) - POIS(p[b], t.gf) } return s / 2 })
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const ms = []
  for (let i = 0; i < iters; i++) { let s = 0; for (let j = 0; j < d.length; j++) s += d[Math.floor(rnd() * d.length)]; ms.push(s / d.length) }
  ms.sort((x, y) => x - y)
  return { mean: d.reduce((x, y) => x + y, 0) / d.length, lo: ms[Math.floor(0.025 * iters)], hi: ms[Math.floor(0.975 * iters)] }
}
const results = {}
for (const [label, set] of [['valid 2025-26 (>= ' + CUTOFF + ')', valid], ['next 2026-27 regular season', next]]) {
  const sc = score(set, P, KEYS); results[label] = { games: set.length, ...sc }
  console.log(`\n== HELD OUT ${label}: ${set.length} games, ${set.length * 2} club-games ==`)
  for (const k of KEYS) console.log(`${NAME[k].padEnd(44)} Poisson NLL ${sc[k].nll.toFixed(4)}   MSE ${sc[k].mse.toFixed(4)}   MAE ${sc[k].mae.toFixed(4)}`)
  // the dial is a GAME total ranked against the night: how well does each projection order the games?
  const tot = Object.fromEntries(KEYS.map((k) => [k, []])); const act = []
  for (const g of set) { const tm = Object.keys(g.t); const ps = tm.map((team) => predict(team, tm.find((x) => x !== team), g.date, P)); act.push(g.t[tm[0]].gf + g.t[tm[1]].gf); for (const k of KEYS) tot[k].push(ps[0][k] + ps[1][k]) }
  results[label].gameTotalCorr = {}
  for (const k of KEYS.slice(1)) { const c = { pearson: pearson(tot[k], act), spearman: spearman(tot[k], act) }; results[label].gameTotalCorr[k] = c; console.log(`  game-total ordering, ${NAME[k].padEnd(44)} Pearson ${c.pearson.toFixed(3)}  Spearman ${c.spearman.toFixed(3)}`) }
  for (const [a, b] of [['rate', 'xg'], ['rate', 'xgGoalie'], ['rate', 'rateGoalie'], ['xg', 'xgGoalie'], ['rateOpp', 'xgGoalie'], ['rate', 'xgGC'], ['rate', 'blendRate'], ['rate', 'blendOpp'], ['xgGC', 'blendRate'], ['xgGC', 'blendOpp']]) { const c = boot(set, a, b); results[label][`${a}_minus_${b}`] = c; console.log(`  NLL ${a} minus ${b}: ${c.mean.toFixed(4)}  95% [${c.lo.toFixed(4)}, ${c.hi.toFixed(4)}]${c.lo > 0 ? '  -> ' + b + ' better' : c.hi < 0 ? '  -> ' + a + ' better' : '  -> not separable'}` ) }
}

// the site's code path equals the evaluated model, and the league's spread of GAME TOTALS (the dial's heat)
{
  let worst = 0; let worstR = 0; const totX = []; const totR = []
  for (const g of [...valid, ...next]) {
    const tm = Object.keys(g.t); const ps = tm.map((team) => predict(team, tm.find((x) => x !== team), g.date, P))
    for (const p of ps) { worst = Math.max(worst, Math.abs(p.team - p.xgGC)); worstR = Math.max(worstR, Math.abs(p.rateOppT - p.rateOpp)) }
    totX.push(ps[0].team + ps[1].team); totR.push(ps[0].rateOppT + ps[1].rateOppT)
  }
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))] }
  const dist = (a) => ({ n: a.length, p10: q(a, 0.1), p25: q(a, 0.25), p50: q(a, 0.5), p75: q(a, 0.75), p90: q(a, 0.9), min: Math.min(...a), max: Math.max(...a), mean: a.reduce((x, y) => x + y, 0) / a.length })
  results.siteVsEval = { maxAbsDiffTeam: worst, maxAbsDiffRate: worstR }
  results.dist = { xg: dist(totX), rate: dist(totR) }
  console.log(`\nsite code path vs the evaluated model, max abs difference over every held-out club-game: team ${worst.toExponential(2)}, rate fallback ${worstR.toExponential(2)}`)
  console.log('league spread of GAME TOTALS (held-out games), lamp-team-v1:', JSON.stringify(results.dist.xg))
  console.log('league spread of GAME TOTALS, rate fallback:', JSON.stringify(results.dist.rate))
}
// the REAL logged dial: lamp_goal_log, status != 'off', summed legs.goalsPg per club, against the goals that club scored
{
  const by = new Map()
  for (const r of logRows) { if (r.status === 'off') continue; const k = `${r.game_id}|${r.team}`; by.set(k, (by.get(k) || 0) + (Number(r.legs?.goalsPg) || 0)) }
  const acc = { dial: [0, 0, 0], xg: [0, 0, 0], team: [0, 0, 0], xgGC: [0, 0, 0], blendRate: [0, 0, 0], blendOpp: [0, 0, 0], rate: [0, 0, 0] }; let n = 0
  const ser = { dial: [], xg: [], team: [], xgGC: [], blendRate: [], blendOpp: [], rate: [] }; const ys = []
  for (const [k, dial] of by) {
    const [gid, team] = k.split('|'); const g = gameById.get(Number(gid)); if (!g || !g.t[team]) continue
    const opp = Object.keys(g.t).find((x) => x !== team); const y = g.t[team].gf
    // preseason games are not in the regular-season history; a club's history is its 2025-26 window, which is what the board used
    const p = predict(team, opp, g.date, P)
    n += 1; ys.push(y)
    for (const [name, mu] of [['dial', dial], ['xg', p.xg], ['xgGC', p.xgGC], ['team', p.team], ['blendRate', p.blendRate], ['blendOpp', p.blendOpp], ['rate', p.rate]]) { acc[name][0] += POIS(mu, y); acc[name][1] += (mu - y) ** 2; acc[name][2] += mu; ser[name].push(mu) }
  }
  console.log(`\n== REAL LOGGED DIAL (lamp_goal_log since 2026-09-25, preseason included): ${n} club-games ==`)
  for (const [name, a] of Object.entries(acc)) console.log(`${name.padEnd(9)} Poisson NLL ${(a[0] / n).toFixed(4)}  MSE ${(a[1] / n).toFixed(4)}  mean projected ${(a[2] / n).toFixed(3)}  club-game Pearson ${pearson(ser[name], ys).toFixed(3)}  Spearman ${spearman(ser[name], ys).toFixed(3)}`)
  results.realDial = { clubGames: n, ...Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { nll: a[0] / n, mse: a[1] / n, meanProjected: a[2] / n, pearson: pearson(ser[k], ys), spearman: spearman(ser[k], ys) }])) }
}

// goalie: how far does it move a game's dial?
{
  const spread = []
  for (const g of valid) for (const [team] of Object.entries(g.t)) { const opp = Object.keys(g.t).find((k) => k !== team); const p = predict(team, opp, g.date, P); spread.push(p.xgGoalie - p.xg) }
  spread.sort((a, b) => a - b)
  const q = (f) => spread[Math.floor(f * (spread.length - 1))]
  results.goalieMove = { p5: q(0.05), p50: q(0.5), p95: q(0.95), min: spread[0], max: spread[spread.length - 1] }
  console.log(`\ngoalie quality moves a club's projected goals by (valid club-games): p5 ${q(0.05).toFixed(3)}  median ${q(0.5).toFixed(3)}  p95 ${q(0.95).toFixed(3)}  (range ${spread[0].toFixed(3)} .. ${spread[spread.length - 1].toFixed(3)})`)
}
// the goalie factor on its own: held-out shots, does the pre-game goalie factor sort goals against?
{
  let sa = 0; const bucket = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]   // low-factor (good), mid, high-factor goalies: goals against and xG against
  for (const g of valid) for (const [team] of Object.entries(g.t)) {
    const opp = Object.keys(g.t).find((k) => k !== team)
    const tab = gTable(g.date)
    for (const [id, v] of g.t[team].goalies) { const x = tab.get(id); const f = x ? goalieFactor(x.ga, x.xga, P.kGoalie) : 1; const b = f < 0.97 ? 0 : f > 1.03 ? 2 : 1; bucket[b][0] += v.sa; bucket[b][1] += v.ga; bucket[b][2] += v.xga }
  }
  console.log('goalie factor before the game vs what happened (valid): [good<0.97, middle, poor>1.03]')
  bucket.forEach((b, i) => console.log(`  ${['good', 'middle', 'poor'][i]}: ${b[0]} shots faced, ${b[1]} goals against vs ${b[2].toFixed(1)} xG against (ratio ${(b[1] / b[2]).toFixed(3)})`))
  results.goalieBuckets = bucket
}
globalThis.__results = results
if (process.argv.includes('--write')) {
  const p = new URL('../lib/nhl/xgLampXgV1.js', import.meta.url)
  const text = readFileSync(p, 'utf8')
  const model = { ...XG_COEF, goalie: { k: P.kGoalie, note: '(GA + k) / (xGA + k): goals allowed over xG faced, shrunk toward 1', windowGames: WINDOW, shareGames: GOALIE_GAMES, tuned: P }, game_eval: { cutoff: CUTOFF, results } }
  const head = text.slice(0, text.indexOf('export default'))
  writeFileSync(p, `${head}export default ${JSON.stringify(model, null, 2)}\n`)
  console.log('wrote goalie k + game_eval into lib/nhl/xgLampXgV1.js')
}
if (process.argv.includes('--write-team')) {
  const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toPrecision(6)) : v)))
  const model = {
    version: 'lamp-team-v1',
    note: 'Written by scripts/eval-lamp-xg-games.mjs --write-team. The team model (lib/nhl/teamProj.js): shots x xG a shot x the opposing defence x the opposing goalie + empty-net goals, shrunk to the league; the shrink strengths were tuned on 2025-12-01..2026-02-01 games and frozen.',
    windowGames: WINDOW, goalieGames: GOALIE_GAMES,
    league: { gf: L.gf, sog: L.sog, xgPerSog: L.xgPerSog, emptyNet: EN },
    k: { rate: P.kRate, sog: P.kSog, q: P.kQ, goalie: XG_COEF.goalie.k },
    tuned_on: { from: TUNE_FROM, to: CUTOFF, games: tuneSet.length },
    dist: { xg: results.dist.xg, rate: results.dist.rate },
    eval: {
      cutoff: CUTOFF,
      siteVsEval: results.siteVsEval,
      heldOut: Object.fromEntries(Object.entries(results).filter(([k]) => /^(valid|next)/.test(k)).map(([k, v]) => [k, { games: v.games, ...Object.fromEntries(['const', 'rate', 'rateOpp', 'xgGC', 'team', 'blendOpp'].map((m) => [m, { nll: v[m].nll, mse: v[m].mse, mae: v[m].mae }])), gameTotalCorr: v.gameTotalCorr }])),
      realDial: results.realDial,
    },
  }
  writeFileSync(new URL('../lib/nhl/teamProjV1.js', import.meta.url), `// lamp-team-v1, the numbers behind lib/nhl/teamProj.js. GENERATED -- do not edit by hand.\n// Regenerate: node --import ./scripts/_esm-resolve.mjs scripts/eval-lamp-xg-games.mjs <dir> --write-team\nexport default ${JSON.stringify(round(model), null, 2)}\n`)
  console.log('wrote lib/nhl/teamProjV1.js')
}
