// MOONSHOT'S LIVE PRICES, FROM OUR OWN FEED (2026-09-27). Server only.
//
// Every price on MOONSHOT -- the Odds tab and its Signals/Shop views, the
// props grid, pick quotes, the homer alert's "HR +900" -- reads one payload,
// odds_latest.json, which bots/odds_fetch.py wrote. Its providers stopped
// carrying player props on 09-14 (odds_status.json), so every one of those has
// been blank since. This builds the SAME shape from our SportsGameOdds rows,
// so none of those readers change:
//
//   by_player_id[mlbam][market] = { line, over, implied, books, best_over,
//     best_book, movement: { from_open_pp, line_changed }, taken_at, snap }
//
//   batter_home_runs       odds_snap, book by book: median over, best book
//   batter_hits            odds_lines 'hits'  -- the 1+ (0.5) bet first
//   batter_hits_runs_rbis  odds_lines 'hrr'   -- the 1.5 bet first (HRR's bar)
//   batter_total_bases     odds_lines 'tb'    -- the 1.5 bet first (CONTACT's)
// Each player/market = our NEWEST snapshot for the date (morning list, then
// ~1h before, then minutes before). from_open_pp = implied now minus implied
// at the market's opening line, in points: positive = the price shortened.
// A line that isn't the bar a pick grades on stays a different bet -- the
// readers (lib/odds.js quoteFor / gridQuote) already flag it.
import { readPaged } from '../record/paged'
import { pricesFromRows, impliedOf } from './priceAtLock'
import { normName, CATEGORY_MARKET } from '../odds'

const pct = (american) => (Number.isFinite(Number(american)) && Number(american) !== 0 ? Math.round(1000 * impliedOf(Number(american))) / 10 : null)
// our market -> [builder/site market, the line its pick grades on]
const LINE_MARKETS = { hits: ['batter_hits', 0.5], hrr: ['batter_hits_runs_rbis', 1.5], tb: ['batter_total_bases', 1.5] }
const lineOf = (r) => (r.bet === 'yn' ? 0.5 : Number(r.line))

export async function mlbLatestOdds(db, date) {
  const byId = {}
  const names = {}
  let newest = null
  const put = (pid, name, market, q) => {
    (byId[pid] ||= {})[market] = q
    if (name) names[pid] = name
    if (!newest || q.taken_at > newest) newest = q.taken_at
  }

  // Home runs: every book, newest snapshot per player.
  const snap = await readPaged(() => db.from('odds_snap')
    .select('sport, event_id, game_date, our_player_id, player_name, book, odds, available, fair_odds, open_odds, taken_at, snap, odd_id')
    .eq('sport', 'mlb').eq('game_date', date).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }).order('snap', { ascending: true }))
  if (snap.error) throw new Error(`odds_snap: ${snap.error.message}`)
  const last = new Map()
  for (const r of snap.data) if (!last.has(r.our_player_id) || r.taken_at > last.get(r.our_player_id)) last.set(r.our_player_id, r.taken_at)
  const hr = snap.data.filter((r) => r.taken_at === last.get(r.our_player_id))
  const nameOf = new Map(hr.map((r) => [r.our_player_id, r.player_name]))
  const snapOf = new Map(hr.map((r) => [r.our_player_id, r.snap]))
  for (const [k, v] of pricesFromRows(hr).prices) {
    const pid = k.split(':')[2]
    const imp = pct(v.median)
    const open = pct(v.open)
    put(pid, nameOf.get(pid), 'batter_home_runs', {
      line: 0.5, over: v.median, implied: imp, books: v.books, best_over: v.best, best_book: v.best_book,
      movement: { from_open_pp: imp != null && open != null ? Math.round(10 * (imp - open)) / 10 : null, line_changed: false },
      taken_at: v.taken_at, snap: snapOf.get(pid),
    })
  }

  // Hits, H+R+RBI, total bases: consensus rows, newest snapshot per player/market.
  const lines = await readPaged(() => db.from('odds_lines')
    .select('our_player_id, player_name, market, bet, line, odds, open_line, open_odds, best_line, best_odds, best_book, books, taken_at, snap, event_id, odd_id')
    .eq('sport', 'mlb').eq('game_date', date).in('market', Object.keys(LINE_MARKETS)).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('snap', { ascending: true }))
  if (lines.error) throw new Error(`odds_lines: ${lines.error.message}`)
  const newestAt = new Map()
  for (const r of lines.data) {
    const k = `${r.our_player_id}|${r.market}`
    if (!newestAt.has(k) || r.taken_at > newestAt.get(k)) newestAt.set(k, r.taken_at)
  }
  const pick = new Map()
  for (const r of lines.data) {
    const k = `${r.our_player_id}|${r.market}`
    if (r.taken_at !== newestAt.get(k) || !Number.isInteger(r.odds)) continue
    const bar = LINE_MARKETS[r.market][1]
    const cur = pick.get(k)
    // The bet the pick grades on (its bar) wins; otherwise the over.
    if (!cur || (lineOf(cur) !== bar && (lineOf(r) === bar || r.bet === 'ou'))) pick.set(k, r)
  }
  for (const r of pick.values()) {
    const [market] = LINE_MARKETS[r.market]
    const imp = pct(r.odds)
    const open = pct(r.open_odds)
    const line = lineOf(r)
    if (!Number.isFinite(line)) continue
    put(r.our_player_id, r.player_name, market, {
      line, over: r.odds, implied: imp, books: r.books,
      best_over: r.best_line == null || Number(r.best_line) === line ? r.best_odds : null, best_book: r.best_book,
      movement: {
        from_open_pp: imp != null && open != null && (r.bet === 'yn' || Number(r.open_line) === line) ? Math.round(10 * (imp - open)) / 10 : null,
        line_changed: r.bet === 'ou' && r.open_line != null && Number(r.open_line) !== line,
      },
      taken_at: r.taken_at, snap: r.snap,
    })
  }

  const byName = {}
  for (const [pid, q] of Object.entries(byId)) if (names[pid]) byName[normName(names[pid])] = q
  const human = newest ? new Date(newest).toUTCString().replace(/^\w+, /, '').replace(/:\d\d GMT$/, ' UTC') : null
  return {
    source: 'sportsgameodds', sport: 'baseball_mlb', date,
    fetched_at: newest, fetched_at_human: human,
    category_market: CATEGORY_MARKET,
    by_player_id: byId, by_name: byName,
    empty: !Object.keys(byId).length, state: Object.keys(byId).length ? 'ok' : 'empty',
    reason: Object.keys(byId).length ? null : 'no prices read yet for this date',
  }
}
