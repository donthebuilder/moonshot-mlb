// 🏒 LAMP GOAL, ICE TIME WITHIN POSITION -- lamp-goalpos-v1. SHADOW MODEL
// (BATCH-MODEL-V2 M2, 2026-10-03; claude/MODEL-AUDIT-2026-10-01.md: "the TOI
// leg pulls in defencemen" -- they log the most minutes and score 7.1% of
// nights against forwards' 19.4%). The live goal board (lamp-goal-v3) is
// unchanged; this is the same board with ONE difference, written to
// lamp_prop_log (market 'GOAL') at the same lock and graded off the same box,
// read by nothing on the site. It goes live only as a new version, on a
// measured lead.
//
//   legs    shotsPg, goalsPg   -- the live board's, unchanged
//           toi                -- his ice time's percentile AMONG HIS OWN
//                                 POSITION tonight (forwards vs forwards,
//                                 defencemen vs defencemen), in place of
//                                 the raw seconds ranked against everyone
//   score / rank / CALLED / ON THE BOARD   scoreNight(), exactly the live rule
//   target  1+ goal (boxscore `goals`); not dressed = void
import { scoreNight, percentiles } from './goalModel'
import { gradeCountRows, propRow } from './ptsModel'
import { VERSIONS } from './versions'

export const MARKET = 'GOAL'
export const MODEL_VERSION = VERSIONS.goalpos[0]
export const BAR = 1
export const LEGS = ['shotsPg', 'goalsPg', 'toi']
/** F or D: the group a skater's ice time is ranked inside. */
export const posGroup = (pos) => (String(pos || '').toUpperCase().startsWith('D') ? 'D' : 'F')

/** The live candidates with toi replaced by its within-position percentile (raw seconds kept as toiSec). */
export function withPositionToi(candidates) {
  const out = candidates.map((c) => ({ ...c, legs: c.legs?.ok ? { ...c.legs, toiSec: c.legs.toi } : c.legs }))
  for (const g of ['F', 'D']) {
    const pool = out.filter((c) => c.legs?.ok && posGroup(c.pos) === g)
    const p = percentiles(pool.map((c) => c.legs.toiSec))
    pool.forEach((c, i) => { c.legs.toi = p[i] })
  }
  return out
}

export const scoreGoalPosNight = (candidates) => scoreNight(withPositionToi(candidates))
export const gradeGoalPosRows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'goals', BAR)
export const toGoalPosRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: MODEL_VERSION, bar: BAR, legs: [...LEGS, 'toiSec'] })
