// LAMP's model record, read in the shared shape (lib/record/shape.js).
//
// The one reader of lamp_goal_log for the RECORD: the in-app record route
// (/api/lamp/record), the front door's number (/start) and /called all come
// through here, so the select, the model version and the result mapping are
// written once. The board's own locked-rows read (lib/nhl/boardRead.js) stays
// separate -- it is the board, not the record.
//
// Never names the net columns (starters, starters_actual, goalies…): they may
// not exist on a deployment where that migration hasn't run.
import { MODEL_VERSION, COUNT_KEYS, addCounts, coverage } from '../nhl/goalModel'
import { readPaged } from './paged'

// Lean by default: the three jsonb columns behind `inputs` are most of a
// row's weight, and a 60-night record read is ~40k rows in season (egress
// is paid for). Ask for them with { withInputs: true } when a page shows them.
const SELECT = 'game_id, game_date, game_type, player_id, team, opp, name, pos, score, rank_in_game, status, dressed, goals, hit, locked_at, graded_at'
const INPUTS = ', legs, pct, context, reason'

/** dressed + hit, as the tick grades them (lib/nhl/goalModel.js gradeRows),
 *  into one word. Not dressed is void, not a miss. */
export function resultOf(r) {
  if (!r.graded_at) return null
  if (r.dressed === false || r.hit == null) return 'void'
  return r.hit ? 'hit' : 'miss'
}

/** One lamp_goal_log row → a ModelRecord. `dressed`, `goals`, `hit` and
 *  `pos` ride along for the pages that print them. */
export function toRecord(r) {
  return {
    sport: 'nhl', model_id: 'lamp-goal', model_version: MODEL_VERSION, target: 'GOAL',
    game_id: r.game_id, game_date: r.game_date, game_type: r.game_type ?? null,
    player_id: r.player_id, name: r.name, team: r.team, opp: r.opp, pos: r.pos ?? null,
    score: r.score ?? null, rank: r.rank_in_game ?? null, status: r.status,
    inputs: 'legs' in r ? { legs: r.legs ?? null, pct: r.pct ?? null, context: r.context ?? null, reason: r.reason ?? null } : null,
    locked_at: r.locked_at, result: resultOf(r), graded_at: r.graded_at ?? null,
    dressed: r.dressed ?? null, goals: r.goals ?? null, hit: r.hit ?? null,
  }
}

/** True when the error is "the migration hasn't run", which callers report
 *  as an empty record with a reason rather than an outage. */
export const isMissingTable = (error) => /does not exist|relation|schema cache/i.test(String(error?.message || ''))

/**
 * The current model's rows, newest night first.
 * @param db           a Supabase client (service role or anon; both can read)
 * @param since/until  game_date bounds, inclusive; either may be omitted
 * @param includePre   preseason is graded like any night but stays out
 *                     unless asked for
 * @param graded       only rows with a grade
 * @param withInputs   also read legs / pct / context / reason
 * @param hitOnly      only skaters who scored -- all /called's capture needs
 *                     (nhlCaptureFrom counts scorers), ~40 rows a night
 *                     instead of ~600
 * @param status       only rows with this status ('called' for a night's calls)
 * @param calledOrHit  only CALLED rows and scorers -- the record route's two
 *                     lists, ~80 rows a night
 * @returns {{ rows: ModelRecord[], error: object|null }}
 */
export async function readNhlRecords(db, { since = null, until = null, includePre = false, graded = true, withInputs = false, hitOnly = false, status = null, calledOrHit = false } = {}) {
  // Paged (lib/record/paged.js): a regular-season night is ~600 rows, so
  // an unpaged 60-night read would count a night and a half and call it
  // the record. Order is total -- date, game, player -- for the pager.
  const { data, error } = await readPaged(() => {
    let q = db.from('lamp_goal_log').select(withInputs ? SELECT + INPUTS : SELECT).eq('model_version', MODEL_VERSION)
    if (since) q = q.gte('game_date', since)
    if (until) q = q.lte('game_date', until)
    if (graded) q = q.not('graded_at', 'is', null)
    if (!includePre) q = q.neq('game_type', 1)
    if (hitOnly) q = q.eq('hit', true)
    if (status) q = q.eq('status', status)
    if (calledOrHit) q = q.or('status.eq.called,hit.eq.true')
    return q.order('game_date', { ascending: false }).order('game_id', { ascending: true }).order('player_id', { ascending: true })
  })
  if (error) return { rows: [], error }
  return { rows: data.map(toRecord), error: null }
}

/**
 * /called's capture shape (the same keys captureFrom / tdCaptureFrom return)
 * from LAMP's own coverage() -- one computation, two shapes. Counts SCORERS:
 * a skater with two goals is one scorer, one row. Needs only the scorers'
 * rows (readNhlRecords { hitOnly: true } is enough); every other row adds
 * nothing to these keys.
 */
export function nhlCaptureFrom(records) {
  const c = coverage(records)
  const onBoard = c.scorersCalled + c.scorersOnBoard
  return {
    total: c.scorers, called: c.scorersCalled, rated: c.scorersOnBoard, off: c.scorersOff,
    byRole: {},
    pct: c.scorers ? Math.round((100 * c.scorersCalled) / c.scorers) : null,
    onBoard,
    boardPct: c.scorers ? Math.round((100 * onBoard) / c.scorers) : null,
  }
}

/**
 * The record's per-night counts from the lamp_goal_nights view (Postgres
 * does the counting; supabase/migrations/202609260100_lamp_goal_nights.sql).
 * Game types on one date are added together, preseason left out unless
 * asked for -- the same filters as readNhlRecords.
 * @returns {{ nights: Array<{ date, counts }>, error: object|null }}  newest first
 */
export async function readNhlNights(db, { since = null, includePre = false } = {}) {
  let q = db.from('lamp_goal_nights').select(['game_date', 'game_type', ...COUNT_KEYS].join(', ')).eq('model_version', MODEL_VERSION)
  if (since) q = q.gte('game_date', since)
  if (!includePre) q = q.neq('game_type', 1)
  const { data, error } = await q.order('game_date', { ascending: false })
  if (error) return { nights: [], error }
  const byDate = new Map()
  for (const r of data || []) byDate.set(r.game_date, addCounts(byDate.get(r.game_date), r))
  return { nights: [...byDate.entries()].map(([date, counts]) => ({ date, counts })), error: null }
}
