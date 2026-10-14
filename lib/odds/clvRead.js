// CLV, READ (2026-10-14). Server only, read-only. One book's list / lock / close rows from odds_snap
// (the cron only ever inserts pregame rows: check taken_at < starts_at), folded by lib/odds/clv.js.
// Narrow columns and one book keep the read small; the admin page caches it for 10 minutes.
import { readPaged } from '../record/paged'
import { clvItems, summarizeClv } from './clv'
import { MY_BOOK } from './myBook'

const SINCE = '2026-09-27'   // first odds_snap capture
const MARKET = { mlb: 'hr', nfl: 'td', nhl: 'goal' }

export async function readClv(db, { sport, book = MY_BOOK, since = SINCE }) {
  const market = MARKET[sport]
  if (!market) return { error: `no odds_snap market for ${sport}` }
  const { data, error } = await readPaged(() => db.from('odds_snap')
    .select('event_id, odd_id, book, snap, odds, available, fair_odds')
    .eq('sport', sport).eq('market', market).eq('book', book).gte('game_date', since)
    .order('game_date', { ascending: true }).order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('snap', { ascending: true }))
  if (error) return { error: error.message }
  return { book, bets: new Set(data.map((r) => `${r.event_id}|${r.odd_id}`)).size, lock: summarizeClv(clvItems(data, 'lock')), list: summarizeClv(clvItems(data, 'list')) }
}
