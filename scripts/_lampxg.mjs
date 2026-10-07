// Shared by scripts/fit-lamp-xg.mjs and scripts/eval-lamp-xg-games.mjs (lamp-xg-v1, 2026-10-07).
// Offline only: reads a local JSONL of lamp_shots rows (made by scripts/export-lamp-shots.mjs),
// never the network. Deterministic: no random numbers anywhere.
import { readFileSync } from 'node:fs'
import { normShot, features, isEmptyNet } from '../lib/nhl/xgFeatures.js'

export const FEATURES = ['lnd', 'dist', 'd10', 'd20', 'd35', 'd55', 'angle', 'a25', 'a45', 'a70', 'nearAngle', 'nearBehind', 'long', 'pp', 'sh', 'three', 'four', 'snap', 'slap', 'backhand', 'tip', 'wrap', 'rare', 'tipNear', 'slapFar']

export function loadShots(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

/** regular-season shots only, in game order (period, clock, event) */
export function regularSeason(rows) {
  return rows.filter((r) => r.game_type === 2).sort((a, b) => (a.game_id - b.game_id) || (a.period - b.period) || (a.time_s - b.time_s) || (a.event_id - b.event_id))
}

/** shots on goal that a goalie faced, with their feature vector and the 0/1 outcome */
export function sogSamples(rows) {
  const out = []
  for (const r of rows) {
    if (r.result !== 'sog' && r.result !== 'goal') continue
    if (isEmptyNet(r)) continue
    const n = normShot(r)
    if (!n) continue
    const f = features(r, n)
    out.push({ r, f, y: r.result === 'goal' ? 1 : 0 })
  }
  return out
}

/** ridge logistic regression by Newton steps on standardised features. Returns the model in xg.js's shape. */
export function fitLogistic(samples, names = FEATURES, lambda = 1) {
  const p = names.length; const n = samples.length
  const mean = {}; const scale = {}
  for (const k of names) {
    let m = 0; for (const s of samples) m += s.f[k]; m /= n
    let v = 0; for (const s of samples) v += (s.f[k] - m) ** 2; v = Math.sqrt(v / n)
    mean[k] = m; scale[k] = v > 1e-9 ? v : 1
  }
  const X = samples.map((s) => [1, ...names.map((k) => (s.f[k] - mean[k]) / scale[k])])
  const y = samples.map((s) => s.y)
  let w = new Array(p + 1).fill(0)
  w[0] = Math.log((y.reduce((a, b) => a + b, 0) / n) / (1 - y.reduce((a, b) => a + b, 0) / n))
  for (let it = 0; it < 50; it++) {
    const g = new Array(p + 1).fill(0); const H = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0))
    for (let i = 0; i < n; i++) {
      let z = 0; for (let j = 0; j <= p; j++) z += w[j] * X[i][j]
      const mu = 1 / (1 + Math.exp(-z)); const e = mu - y[i]; const wt = mu * (1 - mu)
      for (let j = 0; j <= p; j++) { g[j] += e * X[i][j]; for (let k = j; k <= p; k++) H[j][k] += wt * X[i][j] * X[i][k] }
    }
    for (let j = 1; j <= p; j++) { g[j] += lambda * w[j]; H[j][j] += lambda }
    for (let j = 0; j <= p; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j]
    const d = solve(H, g)
    let step = 0; for (let j = 0; j <= p; j++) { w[j] -= d[j]; step = Math.max(step, Math.abs(d[j])) }
    if (step < 1e-9) break
  }
  return { intercept: w[0], weights: Object.fromEntries(names.map((k, j) => [k, w[j + 1]])), mean, scale }
}

function solve(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]]
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r] }
  return x
}

export const predict = (m, f) => {
  let z = m.intercept
  for (const [k, w] of Object.entries(m.weights)) z += w * ((f[k] - m.mean[k]) / m.scale[k])
  return 1 / (1 + Math.exp(-z))
}

export function logLoss(ps, ys) { let s = 0; for (let i = 0; i < ps.length; i++) { const p = Math.min(1 - 1e-12, Math.max(1e-12, ps[i])); s -= ys[i] ? Math.log(p) : Math.log(1 - p) } return s / ps.length }
export function brier(ps, ys) { let s = 0; for (let i = 0; i < ps.length; i++) s += (ps[i] - ys[i]) ** 2; return s / ps.length }
export function auc(ps, ys) {
  const idx = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b])
  let rank = 1; let sumPos = 0; let nPos = 0
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && ps[idx[j + 1]] === ps[idx[i]]) j++; const avg = (rank + rank + (j - i)) / 2; for (let k = i; k <= j; k++) if (ys[idx[k]]) { sumPos += avg; nPos++ } rank += j - i + 1; i = j + 1 }
  const nNeg = ps.length - nPos
  return (sumPos - nPos * (nPos + 1) / 2) / (nPos * nNeg)
}
/** calibration by decile of predicted value: [{ n, predicted, observed }] */
export function deciles(ps, ys, k = 10) {
  const idx = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b]); const out = []
  for (let d = 0; d < k; d++) {
    const lo = Math.floor(d * idx.length / k); const hi = Math.floor((d + 1) * idx.length / k)
    let sp = 0; let sy = 0; for (let i = lo; i < hi; i++) { sp += ps[idx[i]]; sy += ys[idx[i]] }
    out.push({ n: hi - lo, predicted: sp / (hi - lo), observed: sy / (hi - lo) })
  }
  return out
}
