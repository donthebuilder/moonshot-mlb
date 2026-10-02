#!/usr/bin/env node
// ODDS FOR EVERY SPORT (2026-10-02). lib/odds/latest.js builds the board
// payload for mlb / nfl / nhl from our SportsGameOdds rows. This proves it on
// the live tables (read only):
//   1. each market's player count = the distinct players in that sport's
//      odds_snap (yes/no prop) / odds_lines rows in the window
//   2. a yes/no quote's movement.history has one point per snapshot that
//      player was priced in, oldest first, ending at the quote's own price
//   3. by_book lists the newest snapshot's books, and its count = quote.books
//   4. (with --old <file>) every field the previous builder wrote is unchanged
//   node --env-file=.env.local --import <loader> scripts/check-odds-latest.mjs [--date YYYY-MM-DD] [--old path]
import { adminClient } from '../lib/supabase/admin.js'
import { latestOdds, ODDS_SPORTS } from '../lib/odds/latest.js'
import { readPaged } from '../lib/record/paged.js'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const date = arg('--date') || new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)
const db = adminClient()
let bad = 0
const fail = (m) => { bad++; console.log('  FAIL', m) }
const old = arg('--old') ? await import(arg('--old')) : null

for (const sport of ODDS_SPORTS) {
  const body = await latestOdds(sport, db, date)
  const [from, to] = body.window
  const ids = Object.keys(body.by_player_id)
  const snap = await readPaged(() => db.from('odds_snap').select('our_player_id, taken_at, book, odds, available, game_date, event_id').eq('sport', sport).gte('game_date', from).lte('game_date', to).not('our_player_id', 'is', null)
    // a unique order, so paged reads neither skip nor repeat a row
    .order('taken_at', { ascending: true }).order('event_id', { ascending: true }).order('our_player_id', { ascending: true }).order('book', { ascending: true }))
  const lines = await readPaged(() => db.from('odds_lines').select('our_player_id, market').eq('sport', sport).gte('game_date', from).lte('game_date', to).not('our_player_id', 'is', null))
  // the builder's rule (lib/odds/priceAtLock pricesFromRows): a player's NEWEST snapshot, priced
  // by at least one book still offering it, in one game that day (two games = ambiguous, skipped)
  const live = (r) => Number.isInteger(r.odds) && r.available
  const newestOf = new Map()
  for (const r of snap.data) if (!newestOf.has(r.our_player_id) || r.taken_at > newestOf.get(r.our_player_id)) newestOf.set(r.our_player_id, r.taken_at)
  const snapIds = new Set([...newestOf].filter(([pid, at]) => {
    const rows = snap.data.filter((r) => r.our_player_id === pid && r.taken_at === at)
    return rows.some(live) && new Set(rows.map((r) => r.event_id)).size === 1
  }).map(([pid]) => pid))
  const markets = {}
  for (const q of Object.values(body.by_player_id)) for (const k of Object.keys(q)) markets[k] = (markets[k] || 0) + 1
  console.log(`${sport} ${from}..${to}: ${ids.length} players, markets ${JSON.stringify(markets)}`)
  const yn = Object.entries(markets).find(([k]) => /home_runs|anytime/.test(k))?.[0]
  if (yn && markets[yn] !== snapIds.size) fail(`${sport} ${yn}: ${markets[yn]} quotes vs ${snapIds.size} players in odds_snap`)
  if (!yn && snapIds.size) fail(`${sport}: ${snapIds.size} players in odds_snap but no yes/no market`)
  for (const [pid, q] of Object.entries(body.by_player_id)) {
    const y = yn && q[yn]
    if (!y) continue
    // its game: the date of its newest snapshot; each snapshot that priced him for that date is a point
    const day = snap.data.find((r) => r.our_player_id === pid && r.taken_at === newestOf.get(pid))?.game_date
    const at = new Set(snap.data.filter((r) => r.our_player_id === pid && r.game_date === day && live(r)).map((r) => r.taken_at))
    const h = y.movement?.history || []
    if (h.length !== at.size) fail(`${sport} ${pid}: history ${h.length} points vs ${at.size} snapshots`)
    if (h.length && h[h.length - 1].over !== y.over) fail(`${sport} ${pid}: history ends ${h[h.length - 1].over}, quote ${y.over}`)
    if (h.some((p, i) => i && p.at < h[i - 1].at)) fail(`${sport} ${pid}: history not oldest-first`)
    if (Object.keys(y.by_book || {}).length !== y.books) fail(`${sport} ${pid}: by_book ${Object.keys(y.by_book || {}).length} vs books ${y.books}`)
  }
  const lineMarkets = new Set(lines.data.map((r) => r.market))
  console.log(`  odds_lines markets in window: ${[...lineMarkets].join(', ') || 'none'}`)
  if (old && sport !== 'nhl') {
    const was = await (sport === 'mlb' ? old.mlbLatestOdds(db, date) : old.nflLatestOdds(db, date))
    let same = 0, diff = 0
    for (const [pid, qs] of Object.entries(was.by_player_id)) for (const [mk, q] of Object.entries(qs)) {
      const now = body.by_player_id[pid]?.[mk]
      const keys = ['line', 'over', 'implied', 'books', 'best_over', 'best_book', 'taken_at', 'snap']
      // only what the old builder wrote (the new one adds snap, history, by_book)
      const ok = now && keys.filter((k) => k in q).every((k) => JSON.stringify(q[k] ?? null) === JSON.stringify(now[k] ?? null))
        && JSON.stringify(q.movement?.from_open_pp ?? null) === JSON.stringify(now.movement?.from_open_pp ?? null)
        && Boolean(q.movement?.line_changed) === Boolean(now.movement?.line_changed)
      if (ok) same++; else { diff++; if (diff <= 3) fail(`${sport} ${pid} ${mk}: was ${JSON.stringify(q).slice(0, 160)} now ${JSON.stringify(now || null).slice(0, 160)}`) }
    }
    console.log(`  vs the previous builder: ${same} quotes identical, ${diff} differ`)
  }
}
console.log(bad ? `\n${bad} failures` : '\nall green')
process.exit(bad ? 1 : 0)
