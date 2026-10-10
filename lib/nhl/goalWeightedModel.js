// 🏒 LAMP GOAL, WEIGHTED -- lamp-goalw-v1. SHADOW MODEL. The definition is the doc
// (.claude-notes/LAMP-GOALW-DEFINITION.md, written before this file); the coefficients are
// lib/nhl/goalWeightedV1.js, fitted offline by scripts/nhl/goal-v2-backtest.mjs on 2025-26 with
// every night scored only from data before it, and frozen.
//
// The live goal board (lamp-goal-v3) is unchanged. This is the same board with ONE difference:
// the live legs (shots/GP, goals/GP, TOI/GP, and whether he is a defenceman) are weighted by a
// fitted logistic instead of averaged as equal percentiles. It is written to lamp_prop_log
// (market 'GOAL') at the same lock and graded off the same box, read by nothing on the site. It
// goes live only as a NEW version (lamp-goal-v4) on the definition's PROMOTION RULE.
//
//   population / candidates / pooled lines / rookie pull   the live board's, untouched
//   P              logistic of the four features, 0..1 -- LOGGED in context, NEVER PRINTED
//   score          P's percentile among tonight's scored skaters (0-100), the live board's scale
//   rank / CALLED / ON THE BOARD   scoreNight()'s rule applied to P: top skater on each team in a
//                  game is CALLED (the higher = TOP, the other GOAL), the top third of the night
//                  by P is ON THE BOARD, the rest NOT ON THE BOARD. Ties by name.
//   target         1+ goal (boxscore `goals`); not dressed = void
// Pure: no fetch, no clock, no 'use client'.
import { percentiles, CALLED_K_PER_TEAM, BOARD_SHARE } from './goalModel'
import { gradeCountRows, propRow } from './ptsModel'
import { VERSIONS } from './versions'
import MODEL from './goalWeightedV1'

export const MARKET = 'GOAL'
export const MODEL_VERSION = VERSIONS.goalw[0]
export const BAR = 1
export const LEGS = ['shotsPg', 'goalsPg', 'toi']
export const POS_WORD = 'defence'

/** D or not: the group the fitted flag reads (the same split lib/nhl/goalPosModel.js posGroup makes). */
export const isDefence = (pos) => String(pos || '').toUpperCase().startsWith('D')

/** The model's number for one scored candidate (a pooledLegs() result with ok, and his position). 0..1. */
export function goalWeightedP(legs, pos, model = MODEL) {
  const x = { goalsPg: legs.goalsPg, shotsPg: legs.shotsPg, toiMin: (legs.toi || 0) / 60, isD: isDefence(pos) ? 1 : 0 }
  let z = model.intercept
  for (const k of model.features) z += model.weights[k] * ((x[k] - model.mean[k]) / model.sd[k])
  return 1 / (1 + Math.exp(-z))
}

const byP = (a, b) => (b.p - a.p) || String(a.name).localeCompare(String(b.name))

/**
 * Score a night -- scoreNight()'s output shape (rows with pct, score, rank, status, role, nightRank, nightOf),
 * ranked by P. @param candidates [{ gameId, playerId, name, pos, team, opp, home, legs: pooledLegs(), context }]
 */
export function scoreGoalWeightedNight(candidates, model = MODEL) {
  const scored = candidates.filter((c) => c.legs?.ok)
  const ps = scored.map((c) => goalWeightedP(c.legs, c.pos, model))
  const pct = percentiles(ps)
  const byId = new Map(scored.map((c, i) => [`${c.gameId}|${c.playerId}`, { p: ps[i], score: Math.round(pct[i]) }]))
  const rows = candidates.map((c) => {
    if (!c.legs?.ok) return { ...c, pct: null, score: null, rank: null, status: 'off', reason: c.legs?.reason || 'no line' }
    const m = byId.get(`${c.gameId}|${c.playerId}`)
    return { ...c, p: m.p, pct: { score: m.score }, score: m.score, rank: null, status: 'board', reason: null }
  })
  const scoredRows = rows.filter((r) => r.score != null).sort(byP)
  const cut = scoredRows.length ? Math.ceil(scoredRows.length * BOARD_SHARE) : 0
  scoredRows.forEach((r, i) => { r.nightRank = i + 1; r.nightOf = scoredRows.length })
  const byGame = new Map()
  for (const r of scoredRows) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) {
    list.sort(byP)
    const perTeam = new Map()
    list.forEach((r, i) => {
      r.rank = i + 1
      const n = perTeam.get(r.team) || 0
      perTeam.set(r.team, n + 1)
      if (n < CALLED_K_PER_TEAM) { r.status = 'called'; r.role = null }
      else {
        r.status = r.nightRank <= cut ? 'board' : 'off'
        if (r.status === 'off') r.reason = `below the top third of tonight's board (#${r.nightRank} of ${r.nightOf}, cut ${cut})`
      }
    })
    list.filter((r) => r.status === 'called').forEach((r, i) => { r.role = i === 0 ? 'TOP' : 'GOAL' })
  }
  for (const r of scoredRows) r.context = { ...(r.context || {}), role: r.role ?? null, nightRank: r.nightRank, nightOf: r.nightOf, modelP: Math.round(r.p * 10000) / 10000, defence: isDefence(r.pos) }
  return rows
}

export const gradeGoalWeightedRows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'goals', BAR)
export const toGoalWeightedRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: MODEL_VERSION, bar: BAR, legs: LEGS })
