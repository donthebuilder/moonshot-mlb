// TWO-SCORE RANKING, NFL: "who can score two touchdowns?" (TWO-SCORE batch, 2026-10-11, Donovan).
//
// A NEW MODEL, not part of the TD score: model_id 'tuddy-td2', model_version 'td2_site_v1'. It never changes the
// anytime-TD score, its rank or its CALLED / ON THE BOARD word. A new version is new rows, never a rewrite.
//
// WHAT IT IS. A transparent, monotone 0-100 SCORE (a ranking, NOT a probability; nothing here is printed as one).
// Each input becomes a number 0-100 among this week's eligible players (RB/WR/TE with a TD score, not on a bye);
// the score is the weighted mean of the inputs that exist for him:
//   xtd   expected TDs this season (stats.xTD), mid-rank percentile in the pool      30
//   gl    goal-line carries + targets (stats.GL), percentile in the pool             20
//   rz    red-zone carries + targets (stats.RZ), percentile in the pool              15
//   team  team implied total, already a league percentile (components.TD.implied_total)   15
//   snap  snap share, already a league percentile (components.TD.f_snap_pct)          10
//   dvp   opponent defence vs his role: touchdowns allowed to that role, rank 1 = most (matchup.dvp.season)   10
// Role (RB1, WR1 ...) is shown and picks the defence cell; it adds no points of its own (no invented role values).
// MONOTONE: raising any one input never lowers the score (each input's number is non-decreasing in it and the
// weights are positive). A missing input is left out and the rest are re-weighted; the row lists what it used.
//
// "CAN SCORE TWO" = he is in the top third of this two-score board (lib/callStatus tdOnBoard, the same cut as ON THE
// BOARD). A tag on a ranking, never a forecast.
//
// GRADE. Graded on the real result: 2 or more touchdowns, rushing + receiving (tdsIn live; the game log's g_td after).
import { tdsIn } from './liveSlate'
import { tdOnBoard } from '../callStatus'

export const TWO_MODEL = Object.freeze({ model_id: 'tuddy-td2', model_version: 'td2_site_v1' })
export const TWO_NOTE = 'Two-score ranking: a new model, not part of the TD score.'
export const TWO_MIN = 2

export const TWO_INPUTS = Object.freeze([
  { key: 'xtd', label: 'Expected TDs', weight: 30 },
  { key: 'gl', label: 'Goal-line chances', weight: 20 },
  { key: 'rz', label: 'Red-zone chances', weight: 15 },
  { key: 'team', label: 'Team implied total', weight: 15 },
  { key: 'snap', label: 'Snap share', weight: 10 },
  { key: 'dvp', label: 'Defence vs his role', weight: 10 },
])
export const TWO_WEIGHTS = Object.freeze(Object.fromEntries(TWO_INPUTS.map((i) => [i.key, i.weight])))
const PRE_PCT = new Set(['team', 'snap', 'dvp'])   // already 0-100 league percentiles

const fin = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** The raw reading of each input for one player (null = not published). `dvpPct` = defence number 0-100 or null. */
export function rawInputs(p, dvpPct = null) {
  return {
    xtd: fin(p?.stats?.xTD), gl: fin(p?.stats?.GL), rz: fin(p?.stats?.RZ),
    team: fin(p?.components?.TD?.implied_total), snap: fin(p?.components?.TD?.f_snap_pct), dvp: fin(dvpPct),
  }
}

/** Defence-vs-role number (100 = gives up the most TDs to that role), from matchup.dvp.season. Null when absent. */
export function dvpPercent(matchup, p) {
  const raw = p?.role || matchup?.roles?.[p?.player_id]
  const role = typeof raw === 'string' ? raw : raw?.role
  const season = matchup?.dvp?.season
  const rank = fin(season?.[p?.opp]?.[role]?.td_rank)
  const n = season ? Object.keys(season).length : 0
  if (rank == null || n < 2) return null
  return Math.max(0, Math.min(100, ((n - rank) / (n - 1)) * 100))
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

/**
 * Score one player against a pool of raw-input readings. Pure.
 * @returns {{ score:number|null, parts:Array<{key,label,weight,raw,pct}>, missing:string[] }}
 */
export function twoScore(raw, pool) {
  const cols = {}
  for (const i of TWO_INPUTS) cols[i.key] = (pool || []).map((r) => r?.[i.key]).filter((v) => v != null).sort((a, b) => a - b)
  const parts = []
  const missing = []
  for (const i of TWO_INPUTS) {
    const v = raw?.[i.key]
    const pct = v == null ? null : PRE_PCT.has(i.key) ? Math.max(0, Math.min(100, v)) : pctIn(cols[i.key], v)
    if (pct == null) { missing.push(i.key); continue }
    parts.push({ key: i.key, label: i.label, weight: i.weight, raw: v, pct })
  }
  const w = parts.reduce((s, x) => s + x.weight, 0)
  if (!w) return { score: null, parts, missing }
  return { score: Math.round((parts.reduce((s, x) => s + x.weight * x.pct, 0) / w) * 10) / 10, parts, missing }
}

/**
 * The week's two-score board, in rank order. Each row is the slate player plus `scores.TD2`, `components.TD2` (the part
 * numbers, for the shared table), `two` (detail), `two_rank`, `two_of`, `can_two`. His own TD score is not touched.
 */
export function twoBoard(slate, matchup = null) {
  const elig = new Set(((slate?.markets || []).find((m) => m.key === 'TD')?.positions) || ['RB', 'WR', 'TE'])
  const base = (slate?.players || []).filter((p) => !p.on_bye && elig.has(p.position) && Number.isFinite(Number(p.scores?.TD)))
  const raws = base.map((p) => rawInputs(p, dvpPercent(matchup, p)))
  const rows = base.map((p, i) => ({ p, raw: raws[i], r: twoScore(raws[i], raws) })).filter((x) => x.r.score != null)
  rows.sort((a, b) => b.r.score - a.r.score || Number(b.p.scores.TD) - Number(a.p.scores.TD) || String(a.p.player_id).localeCompare(String(b.p.player_id)))
  const of = rows.length
  return {
    rows: rows.map(({ p, raw, r }, i) => ({
      ...p, scores: { ...p.scores, TD2: r.score },
      components: { ...p.components, TD2: Object.fromEntries(r.parts.map((x) => [x.key, Math.round(x.pct)])) },
      two: { score: r.score, parts: r.parts, missing: r.missing, raw }, two_rank: i + 1, two_of: of,
      can_two: tdOnBoard({ rank: i + 1, of }),
    })),
    weights: TWO_WEIGHTS, of,
  }
}

/** Real touchdowns of a result line (rushing + receiving): the live helper. */
export const twoTds = (line) => tdsIn(line)
/** hit / miss for a count of scrimmage TDs. */
export const twoResult = (tds) => (Number(tds) >= TWO_MIN ? 'hit' : 'miss')
