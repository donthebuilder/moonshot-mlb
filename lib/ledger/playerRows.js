// ONE PLAYER'S ROWS IN THE LEDGER (2026-10-07). Server only. "In the ledger" on a player card: the
// rows HE has in the Called table this season -- every home run / touchdown / goal he scored, each tagged
// CALLED / ON THE BOARD / NOT ON THE BOARD as the event tables froze it, read by the SAME readers /called
// and the in-app Called ledger use (lib/record/*; status from lib/callStatus.js, scoreNight for hockey):
//   MLB  homer_feed   (one row per home run)
//   NFL  nfl_td_feed  (one row per touchdown; the scorer's gsis id)
//   NHL  lamp_goal_log (one row per night he scored; CALLED = a called pick in any public LAMP market, 0c)
// A row is one event (a home run, a touchdown) -- or, for hockey, one night he scored, with `goals` that night.
// Nothing is stored, nothing is predicted, and a player with no rows says so (an empty list, never a made-up one).
import { toMlbEvent } from '../record/mlb'
import { toNflEvent } from '../record/nfl'
import { toRecord, markAnyMarketCalls } from '../record/nhl'
import { ALL_VERSIONS } from '../nhl/goalModel'

const MLB_SELECT = 'day,player_id,hr_n,name,team,opponent,game_pk,inning,home,role,on_board,hr_score,board_rank,board_of:stats->>board_of,odds_over,odds_book,seen_at'
const NFL_SELECT = 'day,game_id,td_n,team,opponent,quarter,clock,scorer_name,gsis_id,position,kind,yards,passer_name,on_bot,td_board,seen_at'
const NHL_SELECT = 'game_id, game_date, game_type, player_id, model_version, team, opp, name, pos, score, rank_in_game, status, dressed, goals, hit, locked_at, graded_at'

// the season a day belongs to starts in the year before when the day is before that start
const START = { mlb: '-03-01', nfl: '-09-01', nhl: '-09-01' }
export const seasonSince = (sport, day) => { const s = START[sport]; return day >= `${day.slice(0, 4)}${s}` ? `${day.slice(0, 4)}${s}` : `${Number(day.slice(0, 4)) - 1}${s}` }

export const ID_OK = { mlb: /^\d{3,8}$/, nfl: /^\d{2}-\d{7}$/, nhl: /^\d{7}$/ }
export const UNIT = { mlb: { one: 'home run', many: 'home runs' }, nfl: { one: 'touchdown', many: 'touchdowns' }, nhl: { one: 'goal night', many: 'goal nights' } }

const READ = {
  async mlb(db, id, since) {
    const { data, error } = await db.from('homer_feed').select(MLB_SELECT).eq('player_id', Number(id)).gte('day', since).order('day', { ascending: false }).order('hr_n', { ascending: false }).limit(80)
    if (error) throw new Error(error.message)
    return data.map(toMlbEvent).map((e) => ({ day: e.game_date, opp: e.opp, goals: 1, status: e.status, score: e.payload?.hr_score ?? null }))
  },
  async nfl(db, id, since) {
    const { data, error } = await db.from('nfl_td_feed').select(NFL_SELECT).eq('gsis_id', id).gte('day', since).order('day', { ascending: false }).order('td_n', { ascending: false }).limit(80)
    if (error) throw new Error(error.message)
    return data.map(toNflEvent).map((e) => ({ day: e.game_date, opp: e.opp, goals: 1, status: e.status, score: null }))
  },
  async nhl(db, id, since) {
    const { data, error } = await db.from('lamp_goal_log').select(NHL_SELECT).in('model_version', ALL_VERSIONS).eq('player_id', Number(id))
      .eq('hit', true).not('graded_at', 'is', null).neq('game_type', 1).gte('game_date', since).order('game_date', { ascending: false }).limit(80)
    if (error) throw new Error(error.message)
    const rows = data.map(toRecord)
    await markAnyMarketCalls(db, rows)
    return rows.map((r) => ({ day: r.game_date, opp: r.opp, goals: r.goals ?? 1, status: r.status, score: r.score }))
  },
}

/** { rows, counts } for one player's season; rows newest first, counts by status. */
export async function readPlayerLedger(db, sport, id, today) {
  const since = seasonSince(sport, today)
  const rows = await READ[sport](db, id, since)
  const counts = { called: 0, board: 0, off: 0, total: rows.length }
  for (const r of rows) if (counts[r.status] != null) counts[r.status] += 1
  return { since, rows, counts }
}
