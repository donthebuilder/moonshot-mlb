// THE PRICE AT LOCK (odds plan step 3 prep, 2026-09-27). Server only, read-only.
//
// For a player on a game date: what the books offered in the 'lock' snapshot
// (odds_snap, written by /api/odds/tick 50-70 min before the start; NHL's
// lock is 5-15 min). One answer per (sport, game_date, our_player_id):
//
//   best     the longest price any book offered (available books only)
//   median   the middle of the available books' prices, in implied-probability
//            terms (American odds don't average), converted back
//   books    how many books listed him; fair / open = the feed's market-wide
//            no-vig price and opening line, as stored
//
// NEVER A GUESSED PRICE: no lock row means no price. A player with lock rows
// in two different events that date (a doubleheader) is ambiguous and left
// out -- counted in `ambiguous`, never picked between.
import { readPaged } from '../record/paged'
import { unstable_cache } from 'next/cache'

/** American odds -> implied probability (with the book's vig in it). */
export const impliedOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
/** Implied probability -> American odds, rounded to a whole number. */
export const americanOf = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p))
/** Profit on a 1-unit stake that wins at American odds `a`. */
export const winProfit = (a) => (a > 0 ? a / 100 : 100 / -a)

function median(nums) {
  const s = [...nums].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Group lock rows into one price per player-date. Pure; exported for tests. */
export function pricesFromRows(rows) {
  const by = new Map()
  for (const r of rows) {
    if (!r.our_player_id) continue
    const k = `${r.sport}:${r.game_date}:${r.our_player_id}`
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(r)
  }
  const out = new Map()
  let ambiguous = 0
  for (const [k, list] of by) {
    if (new Set(list.map((r) => r.event_id)).size > 1) { ambiguous += 1; continue }
    const live = list.filter((r) => r.available && Number.isInteger(r.odds))
    if (!live.length) continue
    const top = live.reduce((a, b) => (b.odds > a.odds ? b : a))
    out.set(k, {
      event_id: list[0].event_id,
      best: top.odds, best_book: top.book,
      median: americanOf(median(live.map((r) => impliedOf(r.odds)))),
      books: live.length,
      fair: list[0].fair_odds ?? null, open: list[0].open_odds ?? null,
      taken_at: list[0].taken_at,
    })
  }
  return { prices: out, ambiguous }
}

/**
 * Lock prices for one sport between two game dates (inclusive).
 * @returns {{ prices: Map<string, object>, ambiguous: number, error: object|null }}
 *   keyed `${sport}:${game_date}:${our_player_id}` (priceKey).
 */
const LOCK_COLS = 'sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at'
const lockQuery = (db, sport, from, to) => () => {
  let q = db.from('odds_snap').select(LOCK_COLS).eq('sport', sport).eq('snap', 'lock').not('our_player_id', 'is', null)
  if (from) q = q.gte('game_date', from)
  if (to) q = q.lte('game_date', to)
  return q.order('game_date', { ascending: true }).order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true })
}
const etToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const dayList = (from, to) => { const out = []; for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out }

// A PAST DATE'S LOCK ROWS, ONCE (2026-10-05, egress round 3): a lock price is taken before
// its game and never changes after, but /api/record/calls re-read every lock row since the
// season start (paged, ~269 KB per 1000 rows, growing weekly) on every rebuild -- up to 48
// a day per sport. A past date's rows now sit in Next's Data Cache under that date (one
// small item each, a day long); only today and later are read fresh. Outside a Next
// request (a script) it reads the whole range directly, as before.
async function lockRows(db, sport, since, until) {
  const today = etToday()
  const past = since && until ? dayList(since, until < today ? until : (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) })()) : []
  if (!past.length) return readPaged(lockQuery(db, sport, since, until))
  try {
    const parts = await Promise.all(past.map((d) => unstable_cache(async () => {
      const r = await readPaged(lockQuery(db, sport, d, d))
      if (r.error) throw new Error(r.error.message)
      return r.data
    }, ['lock-rows-v1', sport, d], { revalidate: 86400 })()))
    const rest = until >= today ? await readPaged(lockQuery(db, sport, today, until)) : { data: [], error: null }
    if (rest.error) return rest
    return { data: [...parts.flat(), ...rest.data], error: null }
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) return { data: [], error: e }
    return readPaged(lockQuery(db, sport, since, until))
  }
}

export async function readLockPrices(db, { sport, since = null, until = null }) {
  const { data, error } = await lockRows(db, sport, since, until)
  if (error) return { prices: new Map(), ambiguous: 0, error }
  return { ...pricesFromRows(data), error: null }
}

export const priceKey = (sport, gameDate, playerId) => `${sport}:${gameDate}:${playerId}`
