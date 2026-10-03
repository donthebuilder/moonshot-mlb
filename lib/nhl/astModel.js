// 🏒 LAMP ASSISTS — lamp-ast-v1. SHADOW MODEL, same shape and same rules as
// lamp-pts-v1 (lib/nhl/ptsModel.js): written to lamp_prop_log (market 'AST')
// at the goal board's lock, graded off the same boxscore, read by nothing on
// the site. Definition: docs/lamp/lamp-pts-ast-v1-2026-10-01.md. Pure. No
// claim of accuracy is made: it exists to be measured.
//
//   target  1+ assists (boxscore `assists`)
//   legs    astPg   assists per game over his last ~82 NHL games, pooled with
//                   lamp-goal-v1's weighting -- the target's own rate.
//           toi     average ice time -- defencemen collect assists on
//                   minutes, not shots, so ice time is kept as its own leg.
//           oppGaPg the opponent's goals against per game -- an assist needs
//                   his team to score (shared by teammates; moves one side
//                   of a game against the other).
//           Not used: power-play assists (not in the club-stats feed).
//   score / rank / CALLED  as lamp-pts-v1 (ties by assists/GP), top 3 per game
//
// A change to any leg, bar, window or K bumps MODEL_VERSION.
import { scoreLegsNight, gradeCountRows, propRow } from './ptsModel'
import { VERSIONS, versionsFor } from './versions'

export const MARKET = 'AST'
// v2 (LAMP-V3-DEFINITION): rookies scored. Rows use versionsFor(date).ast
export const MODEL_VERSION = VERSIONS.ast[1]
export const PREV_VERSION = VERSIONS.ast[0]
export const BAR = 1
export const CALLED_K = 3
export const LEGS = ['astPg', 'toi', 'oppGaPg']
export const LEG_LABEL = { astPg: 'AST/GP', toi: 'TOI/GP', oppGaPg: 'OPP GA/GP' }

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A goal-board candidate's pooledLegs() result + pointRates() + opp GA/GP → this model's legs. */
export function astLegs(pooled, rates, oppGaPg) {
  if (!pooled?.ok) return pooled || { ok: false, reason: 'no line' }
  if (!rates) return { ok: false, reason: 'no assists line' }
  return { ok: true, astPg: rates.astPg, toi: pooled.toi, oppGaPg: fin(oppGaPg), gpPooled: pooled.gpPooled, gpCur: pooled.gpCur, gpPrev: pooled.gpPrev, prevWeight: pooled.prevWeight }
}

export const scoreAstNight = (candidates) => scoreLegsNight(candidates, LEGS, 'astPg', CALLED_K)
export const gradeAstRows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'assists', BAR)
export const toAstRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: versionsFor(day.date).ast, bar: BAR, legs: LEGS })
