// 🏒 LAMP xG, lamp-xg-v1 (2026-10-07). What a shot on goal is worth, from where
// and how it was taken. Pure: no fetch, no clock, no 'use client'. The
// coefficients are NOT in this file: they are fitted by scripts/fit-lamp-xg.mjs
// (deterministic, offline) and stored in lib/nhl/xgLampXgV1.js together
// with the window they were fitted on and the held-out numbers.
//
//   unit        one SHOT ON GOAL (a save or a goal); a miss or a block has no
//               xG here -- the model answers "if it reaches the goalie, how
//               often is it a goal"
//   inputs      only what ONE lamp_shots row carries: x, y, shot_type, strength,
//               situation_code, period_type. No rebound or rush flag: those need
//               the whole sequence of the game, which a player's shot map does
//               not have (the fit script measures what that costs; see the file)
//   empty net   an empty-net shot is a different thing (no goalie); it is left off
//               the curve (null), and the file keeps the measured empty-net goals
//               a club-game for team totals
//   never       printed as a per-shot "chance". The page shows xG summed over
//               many shots (a measured rate), see the allow-probability notes
//               at each use.
import MODEL from './xgLampXgV1'

export const XG_MODEL_VERSION = 'lamp-xg-v1'
export { MODEL as XG_COEF }
import { normShot, features, isEmptyNet } from './xgFeatures'
export { normShot, distAngle, features, isEmptyNet } from './xgFeatures'
/**
 * xG of one shot on goal, 0..1 (a share of goals per shot, not shown as a
 * chance). null when the row has no usable location. `model` is injectable
 * so the fit script and the tests can score a candidate without touching the file.
 */
export function xgShot(s, model = MODEL) {
  if (isEmptyNet(s)) return null   // no goalie: not on the curve (model.emptyNet.goalsPerClubGame is the team-total constant)
  const n = normShot(s)
  if (!n) return null
  const f = features(s, n)
  let z = model.intercept
  for (const [name, w] of Object.entries(model.weights)) {
    const sc = model.scale[name] || 1
    z += w * ((f[name] - (model.mean[name] || 0)) / sc)
  }
  return 1 / (1 + Math.exp(-z))
}

/** xG summed over a list of shots on goal (misses and blocks add nothing); also how many were scored */
export function xgSum(shots, model = MODEL) {
  let xg = 0; let n = 0
  for (const s of shots) {
    if (s.result !== 'sog' && s.result !== 'goal') continue
    const v = xgShot(s, model)
    if (v == null) continue
    xg += v; n += 1
  }
  return { xg, shots: n }
}

/** Where each xG-weighted shot lands in a zone grid: grid[r][c] = { sog, g, xg } over the same cells shotMap.js uses */
export function xgGrid(shots, GRID, model = MODEL) {
  const grid = Array.from({ length: GRID.rows }, () => Array.from({ length: GRID.cols }, () => ({ sog: 0, g: 0, xg: 0 })))
  const cw = (GRID.x1 - GRID.x0) / GRID.cols; const ch = (GRID.y1 - GRID.y0) / GRID.rows
  for (const s of shots) {
    if (s.result !== 'sog' && s.result !== 'goal') continue
    const n = normShot(s); const v = xgShot(s, model)
    if (!n || v == null || n.x < GRID.x0) continue
    const c = Math.min(GRID.cols - 1, Math.floor((n.x - GRID.x0) / cw))
    const r = Math.min(GRID.rows - 1, Math.max(0, Math.floor((GRID.y1 - n.y) / ch)))
    const cell = grid[r][c]; cell.sog += 1; cell.xg += v; if (s.result === 'goal') cell.g += 1
  }
  return grid
}

// ── goalie quality from measured saves ─────────────────────────────────────
// A goalie's factor is goals allowed over the xG he faced, shrunk toward 1
// (a league-average goalie) by K xG of prior: (GA + K) / (xGA + K). K and the
// proof it helps on later games are in the file (goalie.k, held-out numbers).
export function goalieFactor(ga, xga, k = MODEL.goalie.k) {
  if (!Number.isFinite(ga) || !Number.isFinite(xga)) return 1
  return (ga + k) / (xga + k)
}
