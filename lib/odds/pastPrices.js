// OUR PRICES, IN THE BOT'S ARCHIVE SHAPE (2026-09-27). Server only.
//
// True Price (bots/odds_history.py -> odds_history.json) is built from dated
// odds_<date>.json snapshots. The bot's own providers stopped carrying player
// props on 09-14 (odds_status.json: a paid plan), so the page froze there.
// This hands the builder OUR SportsGameOdds prices for a date in the exact
// slim shape it already reads -- { rows: { mlbam_id: { market: [line, price,
// implied] } } } -- so the builder, its grading and its ROI stay one piece of
// code. The bot fetches it once per date (bots/fetch_site_odds.py) and the
// file is archived on the data branch like every odds_<date>.json before it.
//
//   batter_home_runs       odds_snap, the median book at the lock snapshot
//                          (else close, else the morning list); line 0.5
//   batter_hits            odds_lines 'hits': yes/no (1+) if listed, else the over
//   batter_hits_runs_rbis  odds_lines 'hrr': the over if listed, else yes/no
//   batter_total_bases     odds_lines 'tb':  the over if listed, else yes/no
// A yes/no market is the builder's line 0.5 ("1+"). Prices are the price we
// read before the start -- never after it (both tables refuse that).
import { readPaged } from '../record/paged'
import { pricesFromRows, impliedOf } from './priceAtLock'

const SNAP_ORDER = ['lock', 'close', 'list']
// our market -> [builder market, preferred bet type]
const LINE_MARKETS = { hits: ['batter_hits', 'yn'], hrr: ['batter_hits_runs_rbis', 'ou'], tb: ['batter_total_bases', 'ou'] }
const pct = (american) => Math.round(1000 * impliedOf(american)) / 10

export async function mlbArchive(db, date) {
  const rows = {}
  const put = (pid, market, q) => { (rows[pid] ||= {})[market] = q }

  const snap = await readPaged(() => db.from('odds_snap')
    .select('sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at, snap, odd_id')
    .eq('sport', 'mlb').eq('game_date', date).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }).order('snap', { ascending: true }))
  if (snap.error) throw new Error(`odds_snap: ${snap.error.message}`)
  // Each player's earliest-ranked snapshot kind (lock before close before list).
  const bestSnap = new Map()
  for (const r of snap.data) {
    const cur = bestSnap.get(r.our_player_id)
    if (cur == null || SNAP_ORDER.indexOf(r.snap) < SNAP_ORDER.indexOf(cur)) bestSnap.set(r.our_player_id, r.snap)
  }
  const { prices } = pricesFromRows(snap.data.filter((r) => r.snap === bestSnap.get(r.our_player_id)))
  for (const [k, v] of prices) {
    const pid = k.split(':')[2]
    put(pid, 'batter_home_runs', [0.5, v.median, pct(v.median)])
  }

  const lines = await readPaged(() => db.from('odds_lines')
    .select('our_player_id, market, bet, line, odds, event_id, odd_id')
    .eq('sport', 'mlb').eq('game_date', date).eq('snap', 'lock').in('market', Object.keys(LINE_MARKETS)).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }))
  if (lines.error) throw new Error(`odds_lines: ${lines.error.message}`)
  const pick = new Map()   // pid|market -> row
  for (const r of lines.data) {
    if (!Number.isInteger(r.odds)) continue
    const [, prefer] = LINE_MARKETS[r.market]
    const k = `${r.our_player_id}|${r.market}`
    const cur = pick.get(k)
    if (!cur || (cur.bet !== prefer && r.bet === prefer)) pick.set(k, r)
  }
  for (const r of pick.values()) {
    const [market] = LINE_MARKETS[r.market]
    const line = r.bet === 'yn' ? 0.5 : Number(r.line)
    if (!Number.isFinite(line)) continue
    put(r.our_player_id, market, [line, r.odds, pct(r.odds)])
  }
  return { date, source: 'sportsgameodds (dashnetwork odds_snap + odds_lines)', rows }
}
