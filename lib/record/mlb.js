// MOONSHOT's home runs, read as §33 events (lib/record/shape.js).
//
// homer_feed is the event table: one row per home run, written by the homers
// tick the minute the feed first sees it, with the board designation frozen
// at that moment (role, on_board, board_rank). This adapter only READS it --
// same rows, same order -- and says what each one was in the shared words.
// The status comes from lib/callStatus.js; nothing here re-derives it.
import { callStatus } from '../callStatus'
import { EVENT_TYPES } from './shape'
import { readPaged } from './paged'

// What the public pages print. `stats`, `hooks` and the post ids stay in the
// table -- a page that needs them asks for them.
const SELECT = 'day,player_id,hr_n,name,team,opponent,game_pk,inning,home,role,on_board,hr_score,board_rank,odds_over,odds_book,seen_at'

/** One homer_feed row → an EventRecord. `payload` is the row itself. */
export function toMlbEvent(row) {
  return {
    sport: 'mlb', game_id: row.game_pk ?? null, game_date: row.day,
    player_id: row.player_id, name: row.name, team: row.team, opp: row.opponent ?? null,
    type: EVENT_TYPES.mlb, n: row.hr_n, at: row.seen_at,
    status: callStatus(row),
    key: `mlb:${row.day}:${row.player_id}:hr:${row.hr_n}`,
    payload: row,
  }
}

/** Home runs between two slate days (inclusive), newest first. */
export async function readMlbEvents(db, { since = null, until = null } = {}) {
  const { data, error } = await readPaged(() => {
    let q = db.from('homer_feed').select(SELECT)
    if (since) q = q.gte('day', since)
    if (until) q = q.lte('day', until)
    // seen_at first (what the pages sort on), then the primary key, so the
    // pager's order is total.
    return q.order('seen_at', { ascending: false }).order('day', { ascending: true }).order('player_id', { ascending: true }).order('hr_n', { ascending: true })
  })
  if (error) return { events: [], error }
  return { events: data.map(toMlbEvent), error: null }
}
