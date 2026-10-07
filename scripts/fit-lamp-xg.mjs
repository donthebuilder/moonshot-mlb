#!/usr/bin/env node
// FIT lamp-xg-v1 (2026-10-07). Deterministic and offline: reads a local JSONL of lamp_shots rows
// (scripts/export-lamp-shots.mjs makes it) and writes lib/nhl/xgLampXgV1.js.
//
//   node scripts/fit-lamp-xg.mjs shots.jsonl [--cutoff=2026-02-01] [--write]
//
// THE SPLIT: the archive holds one full regular season (2025-26) and the first days of 2026-27, so
// "past only" is a CLOCK split inside it: every game dated before the cutoff trains the model, every
// later game is held out and scored once. The 2026-27 regular-season nights are a second, later
// held-out set. The coefficients written are the TRAIN-ONLY fit, the same ones the held-out numbers
// were measured on -- nothing is refitted on the games it is judged by.
// Model records are never rewritten: a new model is a new model_version with new rows.
import { writeFileSync } from 'node:fs'
import './_esm-resolve.mjs'
import { loadShots, regularSeason, sogSamples, fitLogistic, predict, logLoss, brier, auc, deciles, FEATURES } from './_lampxg.mjs'
import { normShot, isEmptyNet } from '../lib/nhl/xgFeatures.js'

const path = process.argv[2]
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d
const CUTOFF = arg('cutoff', '2026-02-01')
if (!path) { console.error('usage: fit-lamp-xg.mjs shots.jsonl [--cutoff=YYYY-MM-DD] [--write]'); process.exit(1) }

const all = regularSeason(loadShots(path))
const S2526 = all.filter((r) => r.season === 20252026)
const NEXT = all.filter((r) => r.season === 20262027)
const trainRows = S2526.filter((r) => r.game_date < CUTOFF)
const validRows = S2526.filter((r) => r.game_date >= CUTOFF)
const train = sogSamples(trainRows); const valid = sogSamples(validRows); const next = sogSamples(NEXT)
const gamesOf = (rows) => new Set(rows.map((r) => r.game_id)).size
console.log(`train  ${CUTOFF} and earlier: ${gamesOf(trainRows)} games, ${train.length} shots on goal, ${train.filter((s) => s.y).length} goals`)
console.log(`valid  later 2025-26      : ${gamesOf(validRows)} games, ${valid.length} shots on goal, ${valid.filter((s) => s.y).length} goals`)
console.log(`next   2026-27 reg season : ${gamesOf(NEXT)} games, ${next.length} shots on goal, ${next.filter((s) => s.y).length} goals`)

// direction check: the zone rule in normShot vs the side each club attacked in that period
{
  const d = new Map()
  for (const r of S2526) if (r.zone === 'O' && r.result !== 'block') { const k = `${r.game_id}|${r.period}|${r.team}`; d.set(k, (d.get(k) || 0) + (r.x > 0 ? 1 : -1)) }
  let agree = 0; let tot = 0
  for (const r of S2526) {
    const dir = d.get(`${r.game_id}|${r.period}|${r.team}`); if (!dir || r.x === 0) continue
    const n = normShot(r); if (!n) continue
    tot++; if (n.x === r.x * Math.sign(dir)) agree++   // the club's own direction says x * side is toward the net it attacked
  }
  console.log(`attack-direction agreement (zone rule vs the club's period direction): ${(100 * agree / tot).toFixed(2)}% of ${tot} attempts`)
}

const ys = (xs) => xs.map((s) => s.y)
const rate = train.filter((s) => s.y).length / train.length
const base = () => rate
const FULL = fitLogistic(train, FEATURES, 1)
const DISTONLY = fitLogistic(train, ['lnd'], 1)
const report = {}
for (const [name, set] of [['valid', valid], ['next', next], ['train', train]]) {
  const y = ys(set)
  const pFull = set.map((s) => predict(FULL, s.f)); const pD = set.map((s) => predict(DISTONLY, s.f)); const pB = set.map(base)
  report[name] = {
    shots: set.length, goals: y.reduce((a, b) => a + b, 0),
    logLoss: { baseline: logLoss(pB, y), distanceOnly: logLoss(pD, y), model: logLoss(pFull, y) },
    brier: { baseline: brier(pB, y), distanceOnly: brier(pD, y), model: brier(pFull, y) },
    auc: { distanceOnly: auc(pD, y), model: auc(pFull, y) },
    xgTotal: pFull.reduce((a, b) => a + b, 0), calibration: deciles(pFull, y),
  }
}
for (const k of ['valid', 'next']) {
  const r = report[k]
  console.log(`\n== HELD OUT: ${k} (${r.shots} shots on goal, ${r.goals} goals; model xG total ${r.xgTotal.toFixed(1)}) ==`)
  console.log(`log loss  no-model ${r.logLoss.baseline.toFixed(5)} | distance-only ${r.logLoss.distanceOnly.toFixed(5)} | lamp-xg-v1 ${r.logLoss.model.toFixed(5)}  (gain over no-model ${(100 * (1 - r.logLoss.model / r.logLoss.baseline)).toFixed(2)}%)`)
  console.log(`brier     no-model ${r.brier.baseline.toFixed(5)} | distance-only ${r.brier.distanceOnly.toFixed(5)} | lamp-xg-v1 ${r.brier.model.toFixed(5)}`)
  console.log(`AUC       distance-only ${r.auc.distanceOnly.toFixed(4)} | lamp-xg-v1 ${r.auc.model.toFixed(4)}`)
  console.log('decile  n      predicted  observed')
  r.calibration.forEach((d, i) => console.log(`${String(i + 1).padStart(4)} ${String(d.n).padStart(6)}   ${(100 * d.predicted).toFixed(2).padStart(6)}%   ${(100 * d.observed).toFixed(2).padStart(6)}%`))
}

// empty net: no goalie, so no curve. Goals scored on an empty net per club per game (train window),
// kept as a constant so a team total can add it back; a shot on goal at an empty net is a goal by definition.
const trainGames = new Set(trainRows.map((r) => r.game_id)).size
const enGoals = trainRows.filter((r) => isEmptyNet(r) && r.result === 'goal').length
const emptyNet = { goals: enGoals, clubGames: trainGames * 2, goalsPerClubGame: enGoals / (trainGames * 2) }
console.log(`\nempty net (train): ${enGoals} goals in ${trainGames * 2} club-games = ${emptyNet.goalsPerClubGame.toFixed(4)} a club-game (kept out of the curve)`)

// DIAGNOSTIC (not in v1): what a rebound flag would add. A rebound = the same club's previous shot ON GOAL in the
// game, same period, within 3 seconds. Needs the game's whole sequence, which a player's shot map does not have.
{
  const flag = (rows) => { const last = new Map(); const out = new Map()
    for (const r of rows) { const k = `${r.game_id}|${r.period}|${r.team}`; const p = last.get(k)
      out.set(`${r.game_id}|${r.event_id}`, p != null && r.time_s - p <= 3 ? 1 : 0)
      if (r.result === 'sog' || r.result === 'goal') last.set(k, r.time_s) }
    return out }
  const tag = (rows, set) => { const m = flag(rows); for (const s of set) s.f = { ...s.f, reb: m.get(`${s.r.game_id}|${s.r.event_id}`) || 0 } }
  tag(trainRows, train); tag(validRows, valid)
  const withReb = fitLogistic(train, [...FEATURES, 'reb'], 1)
  const y = ys(valid)
  const a = logLoss(valid.map((s) => predict(FULL, s.f)), y); const b = logLoss(valid.map((s) => predict(withReb, s.f)), y)
  const rb = valid.filter((s) => s.f.reb)
  report.reboundDiagnostic = { validLogLossWithout: a, validLogLossWith: b, gainPct: 100 * (1 - b / a), reboundShare: rb.length / valid.length, reboundGoalRate: rb.filter((s) => s.y).length / rb.length }
  console.log(`\nrebound diagnostic (valid): log loss ${a.toFixed(5)} -> ${b.toFixed(5)} with a 3-second rebound flag (${(100 * report.reboundDiagnostic.gainPct / 100).toFixed(2)}% better); rebounds are ${(100 * report.reboundDiagnostic.reboundShare).toFixed(1)}% of shots, goal rate ${(100 * report.reboundDiagnostic.reboundGoalRate).toFixed(1)}%`)
}

console.log('\nweights (standardised):', Object.entries(FULL.weights).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '))
if (process.argv.includes('--write')) {
  const out = {
    model_version: 'lamp-xg-v1', unit: 'goal per shot on goal (saves and goals; misses and blocks are not shots on goal)',
    fitted_on: { source: 'lamp_shots, regular season', through: CUTOFF, exclusive: true, games: gamesOf(trainRows), shots: train.length, goals: train.filter((s) => s.y).length },
    held_out: { from: CUTOFF, season: 20252026, games: gamesOf(validRows), ...report.valid, note: 'scored once; the fit never saw these games' },
    later_season: { season: 20262027, games: gamesOf(NEXT), ...report.next },
    rebound_diagnostic: report.reboundDiagnostic,
    intercept: FULL.intercept, weights: FULL.weights, mean: FULL.mean, scale: FULL.scale,
    emptyNet,
    goalie: { k: 20 },   // replaced by scripts/eval-lamp-xg-games.mjs --write
  }
  writeFileSync(new URL('../lib/nhl/xgLampXgV1.js', import.meta.url), `// GENERATED by scripts/fit-lamp-xg.mjs -- do not edit by hand. lamp-xg-v1, fitted ${CUTOFF} and earlier.\n// A new fit is a NEW model_version (new file, new rows); this one is never rewritten.\nexport default ${JSON.stringify(out, null, 2)}\n`)
  console.log('wrote lib/nhl/xgLampXgV1.js')
}
