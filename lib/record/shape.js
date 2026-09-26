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
