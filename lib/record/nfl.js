// TUDDY's touchdowns, read as §33 events (lib/record/shape.js).
//
// nfl_td_feed is the event table: one row per touchdown, written by the NFL
// tick when the feed first sees the scoring play, with the board frozen at
// that moment (on_bot = a designated TD pick, td_board = rated, no call). The
// scorer's id (gsis_id) is only set on a confident roster match, so an
// event's player_id can be null -- the row still counts, it just can't link.
// Status from lib/callStatus.js (tdCallStatus); nothing here re-derives it.
import { tdCallStatus } from '../callStatus'
import { EVENT_TYPES } from './shape'
import { readPaged } from './paged'

const SELECT = 'day,game_id,td_n,team,opponent,quarter,clock,scorer_name,gsis_id,position,kind,yards,passer_name,on_bot,td_board,seen_at'

/** One nfl_td_feed row → an EventRecord. `payload` is the row itself. */
export function toNflEvent(row) {
  return {
    sport: 'nfl', game_id: row.game_id, game_date: row.day,
    player_id: row.gsis_id ?? null, name: row.scorer_name || row.team, team: row.team, opp: row.opponent ?? null,
    type: EVENT_TYPES.nfl, n: row.td_n, at: row.seen_at,
    status: tdCallStatus(row),
    // td_n counts touchdowns in the GAME, so the game is the identity here.
    key: `nfl:${row.day}:${row.game_id}:td:${row.td_n}`,
    payload: row,
  }
}

/** Touchdowns between two days (inclusive), newest first. */
export async function readNflEvents(db, { since = null, until = null } = {}) {
  const { data, error } = await readPaged(() => {
    let q = db.from('nfl_td_feed').select(SELECT)
    if (since) q = q.gte('day', since)
    if (until) q = q.lte('day', until)
    return q.order('seen_at', { ascending: false }).order('day', { ascending: true }).order('game_id', { ascending: true }).order('td_n', { ascending: true })
  })
  if (error) return { events: [], error }
  return { events: data.map(toNflEvent), error: null }
}
