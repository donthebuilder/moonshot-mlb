#!/usr/bin/env node
// lamp-xg-v1 checks (2026-10-07). Offline; every shot below is TEST data made up for the check, never a real shot.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-xg.mjs
import { xgShot, xgSum, xgGrid, normShot, distAngle, goalieFactor, XG_COEF, XG_MODEL_VERSION } from '../lib/nhl/xg.js'
import { projectClub } from '../lib/nhl/xgGame.js'
import { fitLogistic, predict, logLoss, auc } from './_lampxg.mjs'
import { GRID } from '../lib/nhl/shotMapShape.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const near = (a, b, tol) => Math.abs(a - b) <= tol
const TEST = (o) => ({ result: 'sog', zone: 'O', strength: 'ev', shot_type: 'wrist', situation_code: '1551', goalie_id: 1, ...o })   // TEST shot

check(XG_MODEL_VERSION === 'lamp-xg-v1' && XG_COEF.model_version === 'lamp-xg-v1', 'model_version is lamp-xg-v1 in code and in the coefficient file')
check(XG_COEF.fitted_on.through <= XG_COEF.held_out.from, `fitted through ${XG_COEF.fitted_on.through}, held out from ${XG_COEF.held_out.from}: the fit never saw the games it is judged on`)

// geometry
const n1 = normShot(TEST({ x: -70, y: 10 })); check(n1.x === 70 && n1.y === -10, 'a shot at x < 0 in the offensive zone turns to the right-hand net (x, y both flipped)')
const n2 = normShot(TEST({ x: -50, y: 5, zone: 'D' })); check(n2.x === -50 && n2.y === 5, "a shot on goal from the shooter's own zone at x < 0 attacks the far net and is NOT mirrored near")
const n3 = normShot(TEST({ x: 60, y: 5, zone: 'D', result: 'block' })); check(n3.x === 60, 'a blocked shot keeps its own location')
check(normShot({ x: null, y: 1 }) === null, 'no location, no shot')
const da = distAngle({ x: 89, y: 0 }); check(da.dist === 0 && da.angle === 0, 'at the net: distance 0')
const db = distAngle({ x: 69, y: 0 }); check(near(db.dist, 20, 1e-9) && db.angle === 0, 'the dots, straight on: 20 ft, 0 degrees')
const dc = distAngle({ x: 89, y: 20 }); check(near(dc.angle, 90, 1e-9), 'on the goal line: 90 degrees')

// shape of the curve
const slot = xgShot(TEST({ x: 80, y: 3 })); const point = xgShot(TEST({ x: 40, y: 10 })); const tight = xgShot(TEST({ x: 84, y: 30 })); const far = xgShot(TEST({ x: -60, y: 0, zone: 'D' }))
check(slot > point * 3, `slot beats the point by a wide margin (${slot.toFixed(3)} vs ${point.toFixed(3)})`)
check(slot > tight, 'straight on beats a tight angle from the same depth')
check(far < 0.03, 'a long shot from the shooter\'s own end is worth almost nothing')
check([slot, point, tight, far].every((v) => v > 0 && v < 1), 'every xG is strictly between 0 and 1')
check(xgShot(TEST({ goalie_id: null, x: 80, y: 0 })) === null, 'an empty-net shot is off the curve (null), not scored by it')
check(xgShot(TEST({ x: 80, y: 0, result: 'miss' })) != null && xgSum([TEST({ x: 80, y: 0, result: 'miss' }), TEST({ x: 80, y: 0, result: 'block' })]).xg === 0, 'misses and blocks add nothing to a sum')
const s2 = xgSum([TEST({ x: 80, y: 3 }), TEST({ x: 40, y: 10 }), TEST({ x: 80, y: 3, result: 'goal' })]); check(s2.shots === 3 && near(s2.xg, 2 * slot + point, 1e-9), 'xgSum adds the shots on goal')
const g = xgGrid([TEST({ x: 80, y: 3 }), TEST({ x: 80, y: 3, result: 'goal' }), TEST({ x: 10, y: 0 })], GRID)
const cells = g.flat(); check(near(cells.reduce((a, c) => a + c.xg, 0), 2 * slot, 1e-9) && cells.reduce((a, c) => a + c.sog, 0) === 2 && cells.reduce((a, c) => a + c.g, 0) === 1, 'xgGrid puts a shot in one cell and drops what is behind the blue line')

// the fitter recovers a known TEST curve (deterministic generator)
{
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const truth = (d) => 1 / (1 + Math.exp(-(1.2 - 0.09 * d)))
  const samples = []
  for (let i = 0; i < 6000; i++) { const d = 3 + rnd() * 55; samples.push({ f: { dist: d, lnd: Math.log(d + 1) }, y: rnd() < truth(d) ? 1 : 0 }) }
  const m = fitLogistic(samples, ['dist'], 0.01)
  const slope = m.weights.dist / m.scale.dist
  check(near(slope, -0.09, 0.012), `TEST fit recovers the slope (${slope.toFixed(3)} vs -0.090)`)
  const p = samples.map((s) => predict(m, s.f)); const y = samples.map((s) => s.y)
  check(logLoss(p, y) < logLoss(y.map(() => y.reduce((a, b) => a + b, 0) / y.length), y) && auc(p, y) > 0.7, 'TEST fit beats the no-model log loss and ranks (AUC > 0.7)')
}

// goalie factor
check(goalieFactor(0, 0) === 1 && goalieFactor(10, 10) === 1, 'a goalie at his xG is a factor of 1')
check(goalieFactor(30, 20, 20) > 1 && goalieFactor(30, 20, 20) < 1.5, 'a goalie allowing more than his xG is above 1, shrunk (not the raw 1.5)')
check(goalieFactor(10, 20, 1e9) > 0.999 && goalieFactor(10, 20, 1e9) < 1.001, 'an enormous K shrinks every goalie to league average')
check(goalieFactor(null, 5) === 1, 'no goalie data is league average, never a guess')

// the club projection (TEST league: 28 shots, 0.1 xG a shot)
{
  const league = { sog: 28, xgPerSog: 0.1 }; const k = { sog: 20, q: 200 }
  const avg = { n: 82, sog: 28 * 82, xg: 2.8 * 82 }
  const p0 = projectClub({ own: avg, against: avg, league, k, emptyNet: 0.2 })
  check(near(p0.goals, 3.0, 1e-9) && near(p0.shots, 28, 1e-9), 'two league-average clubs: 28 shots, 3.0 goals with the empty-net constant')
  const p1 = projectClub({ own: avg, against: avg, league, k, goalieFactor: 1.1, emptyNet: 0 })
  check(near(p1.goals, 2.8 * 1.1, 1e-9), 'a goalie 10% worse than his xG raises the projection 10%')
  const none = projectClub({ own: { n: 0, sog: 0, xg: 0 }, against: { n: 0, sog: 0, xg: 0 }, league, k })
  check(near(none.goals, 2.8, 1e-9), 'no games on file: the league mean, not zero')
  const hot = projectClub({ own: { n: 82, sog: 40 * 82, xg: 4 * 82 }, against: avg, league, k })
  check(hot.shots > 28 && hot.shots < 40, 'a club that shoots 40 a game is pulled toward the league but stays above it')
}

// the stored held-out evidence is what the fit script measured
const hv = XG_COEF.held_out
check(hv.logLoss.model < hv.logLoss.baseline && hv.logLoss.model < hv.logLoss.distanceOnly, `held-out log loss: model ${hv.logLoss.model.toFixed(4)} < distance-only ${hv.logLoss.distanceOnly.toFixed(4)} < no-model ${hv.logLoss.baseline.toFixed(4)}`)
check(near(hv.xgTotal / hv.goals, 1, 0.03), `held-out total xG ${hv.xgTotal.toFixed(0)} is within 3% of the ${hv.goals} goals`)
check(hv.calibration.length === 10 && hv.calibration.every((d) => near(d.predicted, d.observed, 0.05)), 'held-out calibration: every decile within 5 points')
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
