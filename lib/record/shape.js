// ONE RECORD SHAPE ACROSS SPORTS (§33, Batch 2, 2026-09-25).
//
// Every sport's model output is READ in this one shape, so /called, the
// record, grading, alerts and posts don't need a code path per sport. It
// unifies how records are read, not where they are stored: no table is
// merged or migrated. Each sport gets one small adapter beside this file
// (lib/record/nhl.js first -- lamp_goal_log already had this shape; MLB and
// NFL arrive with the event record, Batch 3).
//
// Rules the adapters rely on and never break:
//   · locked_at is before first pitch / kickoff / puck drop.
//   · A row is never rewritten. A new model is a new model_version with
//     new rows.
//   · game_date is the game's own date (the league's slate day), never the
//     ET wall clock.
//   · status is the sport's own CALLED / ON THE BOARD / NOT ON THE BOARD,
//     as stored at lock -- never re-derived by a reader.

import { isCalledRole } from '../callStatus'

/** CALLED / ON THE BOARD / NOT ON THE BOARD, in that order. */
export const STATUS = ['called', 'board', 'off']

/** A graded row's outcome. `void` = the man never played (not dressed,
 *  scratched); an ungraded row's result is null, not a fourth word. */
export const RESULT = ['hit', 'miss', 'void']

/**
 * @typedef {Object} ModelRecord
 * @property {'mlb'|'nfl'|'nhl'} sport     registry key (lib/routes.js)
 * @property {string} model_id             the model family, e.g. 'lamp-goal'
 * @property {string} model_version        e.g. 'lamp-goal-v1'
 * @property {string} target               'HR' | 'TD' | 'GOAL' | …
 * @property {string|number} game_id
 * @property {string} game_date            YYYY-MM-DD, the game's own date
 * @property {number|null} game_type       league code where it has one (NHL: 1 pre, 2 regular, 3 playoffs)
 * @property {string|number} player_id
 * @property {string} name
 * @property {string} team
 * @property {string} opp
 * @property {number|null} score           0–100, null when the model did not score him
 * @property {number|null} rank            within the unit the sport calls from (NHL: his game)
 * @property {'called'|'board'|'off'} status
 * @property {Object|null} inputs          the named legs behind the score
 * @property {string} locked_at            ISO timestamp, before the start
 * @property {'hit'|'miss'|'void'|null} result   null until graded
 * @property {string|null} graded_at
 */

// ── THE EVENT RECORD (§33, Batch 3) ────────────────────────────────────────
// A live event -- a home run, a touchdown, later a goal -- read in one shape,
// with the board status it carried AT THE MOMENT it happened (frozen when the
// feed first saw it; never re-graded). One adapter per sport beside this file
// (lib/record/mlb.js, lib/record/nfl.js; NHL goals with LAMP phase 4).

/** What each sport's event is. */
export const EVENT_TYPES = { mlb: 'HOME_RUN', nfl: 'TOUCHDOWN', nhl: 'GOAL' }

/**
 * @typedef {Object} EventRecord
 * @property {'mlb'|'nfl'|'nhl'} sport
 * @property {string|null} game_id
 * @property {string} game_date              YYYY-MM-DD, the game's own date
 * @property {string|null} player_id         null when the feed never resolved him (NFL)
 * @property {string} name
 * @property {string} team
 * @property {string|null} opp
 * @property {string} type                   EVENT_TYPES[sport]
 * @property {number} n                      which one: his 2nd homer, the game's 3rd TD
 * @property {string} at                     when the feed first saw it
 * @property {'called'|'board'|'off'} status the board at that moment
 * @property {string} key                    `${sport}:${game_date}:${who}:${type}:${n}` -- this
 *                                           record's identity (not the push dedupe key)
 * @property {Object} payload                the source row, for what a page prints
 */

/**
 * The capture count over events -- /called's and /start's shape, the same
 * keys captureFrom and tdCaptureFrom return. Reads `status` only, so every
 * sport counts the same way; `byRole` counts designated roles where the
 * sport has them (MOONSHOT's TOP / HR / HIT / HRR).
 */
export function eventCapture(events) {
  const list = Array.isArray(events) ? events : []
  const total = list.length
  const called = list.filter((e) => e.status === 'called').length
  const rated = list.filter((e) => e.status === 'board').length
  const off = total - called - rated
  const byRole = {}
  for (const e of list) { const role = e.payload?.role; if (isCalledRole(role)) byRole[role] = (byRole[role] || 0) + 1 }
  return {
    total, called, rated, off, byRole,
    pct: total ? Math.round((100 * called) / total) : null,
    onBoard: called + rated,
    boardPct: total ? Math.round((100 * (called + rated)) / total) : null,
  }
}
