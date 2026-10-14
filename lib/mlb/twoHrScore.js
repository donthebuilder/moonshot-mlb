// TWO-HOMER RANKING, MLB: "who can hit two?" (parity batch, 2026-10-13). The twin of NFL's lib/nfl/twoScore.js (2+ TD) and
// NHL's lib/nhl/goal2Model.js (2+ goals), on MOONSHOT's own slate rows.
//
// A NEW RANKING, not part of the HR score: it never changes hr_score, board_rank, the board order or a CALLED / ON THE BOARD word on
// the HR board. Nothing is written for it: it is computed in the page from the slate file the bot already publishes, so no pregame
// row can be touched at or after first pitch and no record is rewritten. (A stored, graded version would be a new model_version
// with new rows, written by the bot or a tick before first pitch: not built here.)
//
// WHAT IT IS. A transparent, monotone 0-100 SCORE (a ranking, NOT a probability; nothing here is printed as one). Each input becomes
// a number 0-100 among tonight's hitters (mid-rank percentile); the score is the weighted mean of the inputs that exist for him:
//   hr    the bot's HR score tonight                                         25
//   rate  home runs per plate appearance this season (hr_per_pa; 50+ PA)    20
//   iso   season ISO (extra-base power with the singles stripped out)        15
//   brl   recent barrel rate                                                 10
//   arm   tonight's starter's home runs allowed per nine (pitcher_hr9)       10
//   park  the park's HR factor (park_hr_factor)                              10
//   pa    expected plate appearances from his lineup slot (lib/xpa.js)       10
// Two homers need volume as well as power, so the slot (PA) is an input of its own. MONOTONE: raising any one input never lowers the
// score (each input's number is non-decreasing in it, the weights are positive). A missing input is left out and the rest are
// re-weighted; the row lists what it used. Weights are a labelled first cut, not fitted to a result.
//
// "CAN HIT TWO" = he is in the top third of THIS board (the same cut as ON THE BOARD, lib/callStatus). A tag on a ranking, never a forecast.
// GRADE (when a record exists): the real result, 2 or more home runs in the game.
import { xpaFor } from '../xpa'

export const TWO_HR_NOTE = 'Two-homer ranking: a new model, not part of the HR score.'
export const TWO_HR_MIN = 2

export const TWO_HR_INPUTS = Object.freeze([
  { key: 'hr', label: 'HR score', weight: 25 },
  { key: 'rate', label: 'HR per PA', weight: 20 },
  { key: 'iso', label: 'ISO', weight: 15 },
  { key: 'brl', label: 'Barrel rate', weight: 10 },
  { key: 'arm', label: 'Arm HR/9', weight: 10 },
  { key: 'park', label: 'Park HR factor', weight: 10 },
  { key: 'pa', label: 'Plate appearances', weight: 10 },
])
export const TWO_HR_WEIGHTS = Object.freeze(Object.fromEntries(TWO_HR_INPUTS.map((i) => [i.key, i.weight])))

// a rate on fewer plate appearances than this is noise (3 PA, 1 HR), so it is left out and the other inputs carry the weight
const RATE_MIN_PA = 50
const fin = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const pos = (v) => { const x = fin(v); return x != null && x > 0 ? x : null }

/** The raw reading of each input for one hitter (null = not published; 0 is "absent" where a zero is not a real reading). */
export function rawInputs(p) {
  return {
    hr: pos(p?.hr_score),
    rate: fin(p?.hr_per_pa) != null && Number(p.hr_per_pa) >= 0 && (pos(p?.season_pa) || 0) >= RATE_MIN_PA ? Number(p.hr_per_pa) : null,
    iso: pos(p?.season_iso),
    brl: pos(p?.recent_barrel_rate),
    arm: pos(p?.pitcher_hr9),
    park: pos(p?.park_hr_factor),
    pa: xpaFor(p?.lineup_spot),
  }
}

/** Mid-rank percentile of v among the sorted values: ties share, non-decreasing in v. */
function pctIn(sorted, v) {
  const n = sorted.length
  if (!n) return null
  let lo = 0, hi = n
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m }
  const below = lo
  hi = n
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m }
  return (100 * (below + (lo - below) / 2)) / n
}

/** Score one hitter against a pool of raw-input readings. Pure. @returns {{ score:number|null, parts:Array, missing:string[] }} */
export function twoHrScore(raw, pool) {
  const cols = {}
  for (const i of TWO_HR_INPUTS) cols[i.key] = (pool || []).map((r) => r?.[i.key]).filter((v) => v != null).sort((a, b) => a - b)
  const parts = []
  const missing = []
  for (const i of TWO_HR_INPUTS) {
    const v = raw?.[i.key]
    const pct = v == null ? null : pctIn(cols[i.key], v)
    if (pct == null) { missing.push(i.key); continue }
    parts.push({ key: i.key, label: i.label, weight: i.weight, raw: v, pct })
  }
  const w = parts.reduce((s, x) => s + x.weight, 0)
  if (!w) return { score: null, parts, missing }
  return { score: Math.round((parts.reduce((s, x) => s + x.weight * x.pct, 0) / w) * 10) / 10, parts, missing }
}

/**
 * Tonight's two-homer scores for a slate. `pool` is the WHOLE slate (so a team or game filter never changes a score);
 * returns Map(rowKey -> { score, parts, missing }) for the rows of `pool`. A hitter with no HR score is not on the board.
 * `keyOf` is how the page keys a row (lib/player playerId: player + game, so a doubleheader's two rows stay two).
 */
export function twoHrScores(pool, keyOf) {
  const rows = (pool || []).filter(Boolean)
  const raws = rows.map(rawInputs)
  const out = new Map()
  rows.forEach((p, i) => {
    if (raws[i].hr == null) return
    const r = twoHrScore(raws[i], raws.filter((x) => x.hr != null))
    if (r.score != null) out.set(keyOf(p), r)
  })
  return out
}

/** The rows carrying `hr2_score` / `hr2_parts` (copies; the slate row is never mutated). Rows with no score are left out. */
export function withTwoHr(rows, scores, keyOf) {
  return (rows || []).filter(Boolean).flatMap((p) => {
    const s = scores.get(keyOf(p))
    return s ? [{ ...p, hr2_score: s.score, hr2_parts: s.parts }] : []
  })
}

/** hit / miss for a game's home run count. */
export const twoHrResult = (hr) => (Number(hr) >= TWO_HR_MIN ? 'hit' : 'miss')
