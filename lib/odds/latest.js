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
import { unstable_cache } from 'next/cache'
import { readPaged } from '../record/paged'
import { pricesFromRows, impliedOf } from './priceAtLock'
import { normName, CATEGORY_MARKET } from '../odds'
import { normName as nflNormName } from '../nfl/oddsMatch'
import { shiftDay } from '../data'

const pct = (american) => (Number.isFinite(Number(american)) && Number(american) !== 0 ? Math.round(1000 * impliedOf(Number(american))) / 10 : null)
const lineOf = (r) => (r.bet === 'yn' ? 0.5 : Number(r.line))
const pp = (a, b) => (a != null && b != null ? Math.round(10 * (a - b)) / 10 : null)

// ── ONE BUILDER, THREE SPORTS (2026-10-02, Donovan: Odds "for all sports, like a
// component"). Each sport is a row of this table, not a branch:
//   snapKey     the site market for odds_snap's yes/no prop, read book by book
//   lines       our odds_lines market -> [site market, the bar its pick grades on]
//               (null bar = no model bar: the MAIN line, the over priced
//               nearest even money -- the line the books lead with)
//   window      the dates read: MLB the slate day, NFL the week around it, NHL the night
// What a quote carries (the old bot file's shape, every reader unchanged):
//   line, over, implied, books, best_over, best_book, taken_at, snap,
//   movement { from_open_pp, line_changed, history [{at, over, line, checkpoint}],
//              opening_over, opened_at }   history = OUR snapshots (list, lock, close)
//   by_book  { book: { line, over } }     the yes/no prop only (odds_lines is a consensus)
const SPORTS = {
  mlb: {
    sportName: 'baseball_mlb', snapKey: 'batter_home_runs', norm: normName,
    lines: { hits: ['batter_hits', 0.5], hrr: ['batter_hits_runs_rbis', 1.5], tb: ['batter_total_bases', 1.5] },
    window: (d) => [d, d], extra: () => ({ category_market: CATEGORY_MARKET }), emptyWhy: 'no prices read yet for this date',
  },
  nfl: {
    sportName: 'americanfootball_nfl', snapKey: 'player_anytime_td', norm: nflNormName,
    lines: {
      rec_yds: ['player_reception_yds', 39.5], rec: ['player_receptions', 3.5], rush_yds: ['player_rush_yds', 49.5],
      rush_att: ['player_rush_attempts', 11.5], pass_yds: ['player_pass_yds', 224.5], kick_pts: ['player_kicking_points', 5.5],
    },
    window: (d) => [shiftDay(d, -4), shiftDay(d, 7)], extra: () => ({ match_rate: null }), emptyWhy: 'no prices read yet this week',
  },
  nhl: {
    sportName: 'icehockey_nhl', snapKey: 'player_anytime_goal', norm: normName,
    lines: { sog: ['player_shots_on_goal', null], pts: ['player_points', null], ast: ['player_assists', null], saves: ['player_saves', null] },
    window: (d) => [d, d], extra: () => ({}), emptyWhy: 'no prices read yet for tonight',
  },
  // BUCKETS (2026-10-03): its five book markets from odds_lines (EXTRA.NBA);
  // no yes/no prop is captured yet, so the snap key reads nothing. Captured
  // only once BUCKETS is open (app/api/odds/tick activeLeagues).
  nba: {
    sportName: 'basketball_nba', snapKey: 'player_first_basket', norm: normName,
    lines: { pts: ['player_points', null], reb: ['player_rebounds', null], ast: ['player_assists', null], '3pm': ['player_threes', null], pra: ['player_points_rebounds_assists', null] },
    window: (d) => [d, d], extra: () => ({}), emptyWhy: 'no prices read yet -- NBA prices are captured once BUCKETS opens',
  },
}
const LINE_MARKETS = SPORTS.mlb.lines            // kept for callers that read the MLB table
const NFL_LINE_MARKETS = SPORTS.nfl.lines

async function buildLatest(sport, db, date) {
  const S = SPORTS[sport]
  const [from, to] = S.window(date)
  const byId = {}
  const names = {}
  let newest = null
  const put = (pid, name, market, q) => {
    (byId[pid] ||= {})[market] = q
    if (name) names[pid] = name
    if (!newest || q.taken_at > newest) newest = q.taken_at
  }

  // THE YES/NO PROP, book by book: the newest snapshot is the quote; every
  // snapshot (its books' median) is a point on the line it moved along.
  const snap = await readPaged(() => db.from('odds_snap')
    .select('sport, event_id, game_date, our_player_id, player_name, book, odds, available, fair_odds, open_odds, taken_at, snap, odd_id')
    .eq('sport', sport).gte('game_date', from).lte('game_date', to).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }).order('snap', { ascending: true }))
  if (snap.error) throw new Error(`odds_snap: ${snap.error.message}`)
  const byAt = new Map()   // taken_at -> rows
  for (const r of snap.data) { if (!byAt.has(r.taken_at)) byAt.set(r.taken_at, []); byAt.get(r.taken_at).push(r) }
  const hist = new Map()   // sport:date:pid (pricesFromRows' key: one game) -> [{at, over, line, checkpoint}]
  for (const [at, rows] of [...byAt.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const snapOf = new Map(rows.map((r) => [r.our_player_id, r.snap]))
    for (const [k, v] of pricesFromRows(rows).prices) {
      if (!hist.has(k)) hist.set(k, [])
      hist.get(k).push({ at, over: v.median, line: 0.5, checkpoint: snapOf.get(k.split(':')[2]) || null })
    }
  }
  const last = new Map()
  for (const r of snap.data) if (!last.has(r.our_player_id) || r.taken_at > last.get(r.our_player_id)) last.set(r.our_player_id, r.taken_at)
  const top = snap.data.filter((r) => r.taken_at === last.get(r.our_player_id))
  const nameOf = new Map(top.map((r) => [r.our_player_id, r.player_name]))
  const snapOf = new Map(top.map((r) => [r.our_player_id, r.snap]))
  const books = new Map()   // pid -> { book: { line, over } }
  for (const r of top) if (Number.isInteger(r.odds) && r.available) (books.get(r.our_player_id) || books.set(r.our_player_id, {}).get(r.our_player_id))[r.book] = { line: 0.5, over: r.odds }
  for (const [k, v] of pricesFromRows(top).prices) {
    const pid = k.split(':')[2]
    const imp = pct(v.median)
    const h = hist.get(k) || []
    put(pid, nameOf.get(pid), S.snapKey, {
      line: 0.5, over: v.median, implied: imp, books: v.books, best_over: v.best, best_book: v.best_book,
      movement: { from_open_pp: pp(imp, pct(v.open)), line_changed: false, history: h, opening_over: v.open ?? h[0]?.over ?? null, opened_at: h[0]?.at || null },
      by_book: books.get(pid) || {},
      // the market's own no-vig price for the bet (our odds provider's fair line), for Market gaps
      fair_over: Number.isInteger(v.fair) ? v.fair : null,
      taken_at: v.taken_at, snap: snapOf.get(pid),
    })
  }

  // THE LINES: consensus rows, newest snapshot per player/market; the bet at
  // the pick's bar first, else (no bar) the main line, else the over.
  const lines = await readPaged(() => db.from('odds_lines')
    .select('our_player_id, player_name, market, bet, line, odds, open_line, open_odds, best_line, best_odds, best_book, books, fair_line, fair_odds, taken_at, snap, event_id, odd_id')
    .eq('sport', sport).gte('game_date', from).lte('game_date', to).in('market', Object.keys(S.lines)).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('snap', { ascending: true }))
  if (lines.error) throw new Error(`odds_lines: ${lines.error.message}`)
  const newestAt = new Map()
  for (const r of lines.data) {
    const k = `${r.our_player_id}|${r.market}`
    if (!newestAt.has(k) || r.taken_at > newestAt.get(k)) newestAt.set(k, r.taken_at)
  }
  const even = (r) => Math.abs((pct(r.odds) ?? 0) - 50)
  const pick = new Map()
  for (const r of lines.data) {
    const k = `${r.our_player_id}|${r.market}`
    if (r.taken_at !== newestAt.get(k) || !Number.isInteger(r.odds)) continue
    const bar = S.lines[r.market][1]
    const cur = pick.get(k)
    if (bar == null) {
      // no model bar: the main O/U line (the over nearest even money), the yes/no only if no O/U
      if (!cur || (r.bet === 'ou' && (cur.bet !== 'ou' || even(r) < even(cur)))) pick.set(k, r)
    } else if (!cur || (lineOf(cur) !== bar && (lineOf(r) === bar || r.bet === 'ou'))) pick.set(k, r)
  }
  for (const r of pick.values()) {
    const [market] = S.lines[r.market]
    const imp = pct(r.odds)
    const line = lineOf(r)
    if (!Number.isFinite(line)) continue
    // the same bet's earlier reads (same player, market, bet and line): the line it moved along
    const h = lines.data.filter((x) => x.our_player_id === r.our_player_id && x.market === r.market && x.bet === r.bet && lineOf(x) === line && Number.isInteger(x.odds))
      .sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1)).map((x) => ({ at: x.taken_at, over: x.odds, line, checkpoint: x.snap || null }))
    put(r.our_player_id, r.player_name, market, {
      line, over: r.odds, implied: imp, books: r.books,
      best_over: r.best_line == null || Number(r.best_line) === line ? r.best_odds : null, best_book: r.best_book,
      movement: {
        from_open_pp: r.bet === 'yn' || Number(r.open_line) === line ? pp(imp, pct(r.open_odds)) : null,
        line_changed: r.bet === 'ou' && r.open_line != null && Number(r.open_line) !== line,
        history: h, opening_over: r.open_odds ?? h[0]?.over ?? null, opened_at: h[0]?.at || null,
        opening_line: r.open_line != null ? Number(r.open_line) : null,
      },
      fair_over: Number.isInteger(r.fair_odds) && (r.fair_line == null || Number(r.fair_line) === line) ? r.fair_odds : null,
      taken_at: r.taken_at, snap: r.snap,
    })
  }

  // by_name is the fallback join (a player the id misses): the price, not the trail --
  // history and by_book ride by_player_id only, so the payload doesn't carry them twice
  const lite = (q) => { const { by_book: _b, fair_over: _f, ...rest } = q; return { ...rest, movement: { from_open_pp: q.movement.from_open_pp, line_changed: q.movement.line_changed } } }
  const byName = {}
  for (const [pid, qs] of Object.entries(byId)) if (names[pid]) byName[S.norm(names[pid])] = Object.fromEntries(Object.entries(qs).map(([m, q]) => [m, lite(q)]))
  const human = newest ? new Date(newest).toUTCString().replace(/^\w+, /, '').replace(/:\d\d GMT$/, ' UTC') : null
  const n = Object.keys(byId).length
  return {
    source: 'sportsgameodds', sport: S.sportName, date, window: [from, to],
    fetched_at: newest, fetched_at_human: human, ...S.extra(),
    by_player_id: byId, by_name: byName,
    empty: !n, state: n ? 'ok' : 'empty', reason: n ? null : S.emptyWhy,
  }
}

// ── BUILT ONCE PER NEW SNAPSHOT, NOT ONCE PER CALLER (2026-09-27, COST CUT 7) ──
// A full MLB build read ~1.1 MB from Supabase (09-27: 1,852 odds_snap rows
// 587 KB + 1,440 odds_lines rows 502 KB), and homers/tick alone asked every
// ~10 min (~158 MB/day), /api/odds/latest again per CDN miss -- for data that
// only changes when a snapshot lands, a handful of times a day (09-26: 7
// distinct taken_at). So each call first reads the tables' FRESHNESS -- the
// newest taken_at + an exact row count over the same filters, no rows
// returned -- and rebuilds only when that moved. The count catches a late row
// with an older stamp. Per warm instance; a cold one builds once, as before.
const _built = new Map()   // key -> { stamp, body }
const BUILT_MAX = 8

async function freshness(db, tables) {
  const parts = await Promise.all(tables.map(async ([table, filter]) => {
    const [top, cnt] = await Promise.all([
      filter(db.from(table).select('taken_at')).order('taken_at', { ascending: false }).limit(1),
      filter(db.from(table).select('taken_at', { count: 'exact', head: true })),
    ])
    if (top.error) throw new Error(`${table} freshness: ${top.error.message}`)
    if (cnt.error) throw new Error(`${table} count: ${cnt.error.message}`)
    return `${top.data?.[0]?.taken_at || '-'}#${cnt.count ?? 0}`
  }))
  return parts.join('|')
}

// SHARED ACROSS INSTANCES (2026-09-28, egress audit). The Map above is per
// warm lambda, and Vercel runs many: measured 09-28, ~100-200 full builds a
// day (NFL 2.4 MB, MLB up to 1.5 MB read each) for data with 1-2 new
// snapshots a day -- ~150-220 MB/day, most of the project's egress. Next's
// Data Cache is shared by every instance of a deployment, so the body is
// read from Supabase once per (key, stamp). The stamp is the same freshness
// read, so nothing can be served stale; bodies are 130-430 KB (under the
// 2 MB item limit). Outside a Next request (a script) it just builds.
async function sharedBuild(key, stamp, build) {
  try {
    // v2 (10-02): the body gained movement.history, by_book and NHL
    return await unstable_cache(build, ['odds-latest-v2', key, stamp], { revalidate: 86400 })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    return build()
  }
}

async function cachedBuild(key, db, tables, build) {
  const stamp = await freshness(db, tables)
  const hit = _built.get(key)
  if (hit && hit.stamp === stamp) return hit.body
  const body = await sharedBuild(key, stamp, build)
  _built.delete(key)
  _built.set(key, { stamp, body })
  while (_built.size > BUILT_MAX) _built.delete(_built.keys().next().value)
  return body
}

/** The board payload for a sport (mlb / nfl / nhl), rebuilt only when its rows moved. */
export function latestOdds(sport, db, date) {
  const S = SPORTS[sport]
  if (!S) throw new Error(`no odds builder for ${sport}`)
  const [from, to] = S.window(date)
  return cachedBuild(`${sport}|${date}`, db, [
    ['odds_snap', (q) => q.eq('sport', sport).gte('game_date', from).lte('game_date', to).not('our_player_id', 'is', null)],
    ['odds_lines', (q) => q.eq('sport', sport).gte('game_date', from).lte('game_date', to).in('market', Object.keys(S.lines)).not('our_player_id', 'is', null)],
  ], () => buildLatest(sport, db, date))
}
export const ODDS_SPORTS = Object.keys(SPORTS)
export const mlbLatestOdds = (db, date) => latestOdds('mlb', db, date)
export const nflLatestOdds = (db, today) => latestOdds('nfl', db, today)

export { LINE_MARKETS, NFL_LINE_MARKETS }

/** The lean payload every price reader on the site gets: the quotes without their trail
 *  (movement.history, by_book) or the market's fair price. Only the Odds page's Moves / Line shop ask for the detail
 *  (/api/odds/latest?detail=1), so a page visit doesn't pay for them. */
export function leanOdds(body) {
  if (!body?.by_player_id) return body
  const lean = (qs) => Object.fromEntries(Object.entries(qs).map(([m, q]) => {
    const { by_book: _b, fair_over: _f, ...rest } = q
    // the old shape exactly: movement keeps from_open_pp + line_changed (the trail is detail)
    return [m, { ...rest, movement: q.movement ? { from_open_pp: q.movement.from_open_pp, line_changed: q.movement.line_changed } : q.movement }]
  }))
  return { ...body, detail: false, by_player_id: Object.fromEntries(Object.entries(body.by_player_id).map(([pid, qs]) => [pid, lean(qs)])) }
}
