#!/usr/bin/env node
// THE NHL SIMULATOR, MEASURED (2026-10-22, PREPLAY N2). Offline, deterministic. Before LAMP's PREPLAY shows a number:
//
//   node --import ./scripts/_esm-resolve.mjs scripts/eval-lamp-preplay.mjs <dir> [--write]
//
//   <dir> holds shots.jsonl and games.jsonl (scripts/fetch-lamp-shots-feed.mjs). Every 2025-26 regular-season game
//   whose two clubs had 20+ games before it: each club's expected goals from LAMP's team model (lib/nhl/teamProj.js,
//   the club-game rows built by lib/nhl/teamXg.js from the same shots, games dated BEFORE this one only), then the
//   home club's chance from the simulator's own distribution (lib/nhl/preplay.js: Poisson regulation, overtime at the
//   measured 3-on-3 factor, the measured shootout) -- computed exactly instead of by 2,000 draws.
//
//   FIT on games before 2026-02-01 (the same block lamp-team-v1 was tuned in): home ice, the overtime factor, the
//   shootout's home share. Then FROZEN and JUDGED on 2026-02-01 onward:
//     the gate   the favourite's win share by 5-point band, within 5 points of what happened in every band with 50+ games
//     the score  log loss and Brier against "the home club wins its usual share" (the fit block's home win rate)
//   --write: lib/nhl/preplayV1.js gets the fitted numbers and the held-out result (measured: true only if the gate holds).
import { readFileSync, writeFileSync } from 'node:fs'
import './_esm-resolve.mjs'
import { teamGameRows } from '../lib/nhl/teamXg.js'
import { projectGame } from '../lib/nhl/teamProj.js'
import MODEL from '../lib/nhl/teamProjV1.js'
import { exactHomeShare } from '../lib/nhl/preplay.js'

const dir = process.argv[2]
if (!dir) { console.error('usage: eval-lamp-preplay.mjs <dir> [--write]'); process.exit(2) }
const WRITE = process.argv.includes('--write')
const CUT = '2026-02-01', MIN_GAMES = 20
const jl = (f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const shots = jl('shots.jsonl').filter((r) => r.game_type === 2)
const games = jl('games.jsonl').filter((g) => g.type === 2 && g.season === 20252026 && g.hs != null && g.as != null)
const clubRows = {}
for (const r of teamGameRows(shots)) (clubRows[r.team] ||= []).push(r)

// the simulator's distribution, exactly (lib/nhl/preplay.js exactHomeShare)
const homeShare = (lh, la, cal) => exactHomeShare(lh, la, cal)

// ── every game the model can rate ─────────────────────────────────────────
const rated = []
for (const g of games) {
  const nh = (clubRows[g.home] || []).filter((r) => r.game_date < g.date).length
  const na = (clubRows[g.away] || []).filter((r) => r.game_date < g.date).length
  if (nh < MIN_GAMES || na < MIN_GAMES) continue
  const pj = projectGame({ home: g.home, away: g.away }, clubRows, g.date, MODEL)
  rated.push({ ...g, lh: pj.home.goals, la: pj.away.goals, homeWon: g.hs > g.as, tiedReg: g.last === 'OT' || g.last === 'SO' })
}
const fit = rated.filter((g) => g.date < CUT), held = rated.filter((g) => g.date >= CUT)
const ll = (set, cal) => set.reduce((s, g) => { const p = Math.min(0.999, Math.max(0.001, homeShare(g.lh, g.la, cal).p)); return s - (g.homeWon ? Math.log(p) : Math.log(1 - p)) }, 0) / set.length
const brier = (set, cal) => set.reduce((s, g) => s + (homeShare(g.lh, g.la, cal).p - (g.homeWon ? 1 : 0)) ** 2, 0) / set.length

// ── FIT (games before the cut) ────────────────────────────────────────────
const so = fit.filter((g) => g.last === 'SO')
const soHome = (so.filter((g) => g.homeWon).length + 25) / (so.length + 50)   // pulled toward a coin by 50 shootouts
const tied = fit.filter((g) => g.tiedReg)
let best = null
for (let k = 0.5; k <= 3.01; k += 0.05) {
  const cal = { homeIce: 1, otSeconds: 300, otFactor: k, shootoutHome: soHome }
  const pred = tied.reduce((s, g) => s + homeShare(g.lh, g.la, cal).ot, 0) / Math.max(1, tied.length)
  const real = tied.filter((g) => g.last === 'OT').length / Math.max(1, tied.length)
  if (!best || Math.abs(pred - real) < best.d) best = { k: Number(k.toFixed(2)), d: Math.abs(pred - real), pred, real }
}
const otFactor = best.k
let hi = null
for (let h = 0.9; h <= 1.2001; h += 0.0025) {
  const cal = { homeIce: h, otSeconds: 300, otFactor, shootoutHome: soHome }
  const v = ll(fit, cal)
  if (!hi || v < hi.v) hi = { h: Number(h.toFixed(4)), v }
}
const CAL = { homeIce: hi.h, otSeconds: 300, otFactor, shootoutHome: Number(soHome.toFixed(4)) }

// ── JUDGE (games from the cut on) ─────────────────────────────────────────
const homeRate = fit.filter((g) => g.homeWon).length / fit.length
const base = { ll: -(held.reduce((s, g) => s + (g.homeWon ? Math.log(homeRate) : Math.log(1 - homeRate)), 0) / held.length), brier: held.reduce((s, g) => s + (homeRate - (g.homeWon ? 1 : 0)) ** 2, 0) / held.length }
const bands = []
for (let lo = 50; lo < 80; lo += 5) {
  const inBand = held.map((g) => { const p = homeShare(g.lh, g.la, CAL).p; const fav = p >= 0.5; return { pf: fav ? p : 1 - p, won: fav ? g.homeWon : !g.homeWon } }).filter((x) => x.pf * 100 >= lo && x.pf * 100 < (lo === 75 ? 101 : lo + 5))
  if (!inBand.length) continue
  const said = inBand.reduce((s, x) => s + x.pf, 0) / inBand.length, did = inBand.filter((x) => x.won).length / inBand.length
  bands.push({ band: `${lo}-${lo === 75 ? 100 : lo + 5}%`, n: inBand.length, said: +(said * 100).toFixed(1), happened: +(did * 100).toFixed(1), off: +((did - said) * 100).toFixed(1) })
}
const gate = bands.filter((b) => b.n >= 50).every((b) => Math.abs(b.off) <= 5)
const tieSaid = held.reduce((s, g) => s + homeShare(g.lh, g.la, CAL).tie, 0) / held.length
const tieReal = held.filter((g) => g.tiedReg).length / held.length
const out = {
  version: 'lamp-preplay-v1', measured: gate, ...CAL, shrinkGames: 10,
  fit: { before: CUT, games: fit.length, homeWinRate: +homeRate.toFixed(4), shootouts: so.length, tiedAfter60: tied.length, otShare: { said: +best.pred.toFixed(3), happened: +best.real.toFixed(3) } },
  heldOut: {
    from: CUT, games: held.length,
    logLoss: { model: +ll(held, CAL).toFixed(4), baseline: +base.ll.toFixed(4) }, brier: { model: +brier(held, CAL).toFixed(4), baseline: +base.brier.toFixed(4) },
    tiedAfter60: { said: +(tieSaid * 100).toFixed(1), happened: +(tieReal * 100).toFixed(1) },
    bands, gate: gate ? 'PASS: every band with 50+ games within 5 points' : 'FAIL: a band with 50+ games is more than 5 points off',
  },
}
console.log(JSON.stringify(out, null, 1))
if (WRITE) {
  writeFileSync('lib/nhl/preplayV1.js', `// lamp-preplay-v1, the measured numbers behind lib/nhl/preplay.js. GENERATED -- do not edit by hand.\n// Regenerate: node --import ./scripts/_esm-resolve.mjs scripts/eval-lamp-preplay.mjs <dir> --write\n// Fit on 2025-26 regular-season games before ${CUT}; judged on the games from ${CUT} on (heldOut). measured is true only\n// when every band of the favourite's win share with 50+ held-out games lands within 5 points of what happened.\nexport default ${JSON.stringify(out, null, 2)}\n`)
  console.log('wrote lib/nhl/preplayV1.js')
}
