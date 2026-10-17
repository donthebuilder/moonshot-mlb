// 🏒 LAMP 2+ GOALS -- goal2_site_v1. A NEW MODEL, not part of the goal score (TWO-SCORE batch, 2026-10-11, Donovan:
// "who can score two"). The live goal board (lamp-goal-v3) is untouched. This is the same population, the same pooled
// lines (lib/nhl/goalModel pooledLegs) and the same percentile-among-tonight's-skaters scale, with the target and the
// weights changed for two goals:
//
//   legs    shotsPg   shots per game over his last ~82 NHL games           weight 35
//           shPct     shooting % = goals per shot over the same window    weight 30
//           toi       average ice time                                    weight 20
//           goalsPg   goals per game                                      weight 15
//   score   the weighted mean of the legs' percentile ranks in the NIGHT's scored pool, 0-100. A RANKING, not a
//           probability; nothing here is printed as one.
//   MONOTONE: a higher value of any leg never lowers a skater's score (percentile is non-decreasing, weights positive).
//   rank    within the game by score, ties by shots/GP then name
//   status  ON THE BOARD = the top third of the NIGHT (lib/nhl/goalModel BOARD_SHARE), NOT ON THE BOARD the rest.
//           Nothing is CALLED on this board: it is TRACKED, not carded (goals are exempt from the Card price floor,
//           and a 2+ goals price is not stored; lib/twoPlus/rules.js).
//   target  2+ goals (boxscore `goals` >= 2); not dressed = void.
//   record  lamp_prop_log, market 'GOAL', model_version 'goal2_site_v1' (the primary key carries the version: no SQL),
//           locked with the goal board's snapshot, never at or after puck drop, graded off the same box.
// Pure: no fetch, no clock, no 'use client'.
import { percentiles, BOARD_SHARE } from './goalModel'
import { gradeCountRows, propRow } from './ptsModel'
import { CURRENT, versionsFor } from './versions'

export const MARKET = 'GOAL'
export const MODEL_VERSION = CURRENT.goal2   // the current version (labels); rows use versionsFor(day.date).goal2
export const BAR = 2
export const LEGS = ['shotsPg', 'shPct', 'toi', 'goalsPg']
export const WEIGHTS = Object.freeze({ shotsPg: 35, shPct: 30, toi: 20, goalsPg: 15 })
export const LEG_LABEL = { shotsPg: 'SHOTS/GP', shPct: 'SH%', toi: 'TOI/GP', goalsPg: 'GOALS/GP' }
export const NOTE = 'Two-goal ranking: a new model, not part of the goal score.'

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A goal-board candidate's pooledLegs() result -> this model's legs (adds shPct = goals per shot). */
export function goal2Legs(pooled) {
  if (!pooled?.ok) return pooled || { ok: false, reason: 'no line' }
  const s = fin(pooled.shotsPg), g = fin(pooled.goalsPg)
  if (!(s > 0) || g == null) return { ok: false, reason: 'no shots line' }
  return { ...pooled, shPct: g / s }
}

const byScore2 = (a, b) => (b.score - a.score) || ((b.legs?.shotsPg || 0) - (a.legs?.shotsPg || 0)) || String(a.name).localeCompare(String(b.name))

/**
 * Score a night. @param candidates [{ gameId, playerId, name, pos, team, opp, home, legs: goal2Legs(pooledLegs()), context }]
 * @returns rows in scoreNight()'s shape: pct (per leg), score, rank (in game), nightRank, nightOf, status 'board'|'off'
 */
export function scoreGoal2Night(candidates) {
  const scored = candidates.filter((c) => c.legs?.ok)
  const pct = {}
  for (const leg of LEGS) {
    const p = percentiles(scored.map((c) => c.legs[leg]))
    scored.forEach((c, i) => { pct[`${c.gameId}|${c.playerId}`] = pct[`${c.gameId}|${c.playerId}`] || {}; pct[`${c.gameId}|${c.playerId}`][leg] = p[i] })
  }
  const rows = candidates.map((c) => {
    if (!c.legs?.ok) return { ...c, pct: null, score: null, rank: null, status: 'off', reason: c.legs?.reason || 'no line' }
    const ps = pct[`${c.gameId}|${c.playerId}`]
    const present = LEGS.filter((l) => ps[l] != null)
    const w = present.reduce((s, l) => s + WEIGHTS[l], 0)
    const score = w ? Math.round(present.reduce((s, l) => s + WEIGHTS[l] * ps[l], 0) / w) : null
    return { ...c, pct: ps, score, rank: null, status: score == null ? 'off' : 'board', reason: score == null ? 'no leg could be ranked' : null }
  })
  const scoredRows = rows.filter((r) => r.score != null).sort(byScore2)
  const cut = scoredRows.length ? Math.ceil(scoredRows.length * BOARD_SHARE) : 0
  scoredRows.forEach((r, i) => {
    r.nightRank = i + 1; r.nightOf = scoredRows.length
    r.status = r.nightRank <= cut ? 'board' : 'off'
    if (r.status === 'off') r.reason = `below the top third of tonight's two-goal board (#${r.nightRank} of ${r.nightOf}, cut ${cut})`
  })
  const byGame = new Map()
  for (const r of scoredRows) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) { list.sort(byScore2); list.forEach((r, i) => { r.rank = i + 1 }) }
  for (const r of scoredRows) r.context = { ...(r.context || {}), role: null, nightRank: r.nightRank, nightOf: r.nightOf }
  return rows
}

/** 2+ goals: hit = goals >= 2 (boxscore); a skater not dressed is void (hit null). */
export const gradeGoal2Rows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'goals', BAR)
export const toGoal2Row = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: versionsFor(day.date).goal2, bar: BAR, legs: LEGS })
