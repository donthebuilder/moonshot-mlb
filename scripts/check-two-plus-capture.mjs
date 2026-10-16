#!/usr/bin/env node
// 2+ PRICE CAPTURE + CARD HOOK, ON TEST DATA (2026-10-15). No network, no SGO object, no database.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-two-plus-capture.mjs
// The events below are SYNTHETIC TEST EVENTS in the SGO shape. Nothing here is a real price or a real player.
// Holds: a 1.5 rung is stored only where a book lists it (main line 1.5, or an alternate rung 1.5); a 0.5-only market stores nothing;
// the price is the median across the books that list the rung; a missing price is no row; the Card hook never makes a price.
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const T = await import('../lib/odds/twoPlus.js')
const H = await import('../lib/card/twoPlus.js')

let n = 0
const ok = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`) }

const ev = (leagueID, odds) => ({
  eventID: 'TEST1', leagueID, status: { startsAt: '2026-11-01T18:00:00Z', started: false },
  teams: { home: { teamID: 'H', names: { short: 'HOM' } }, away: { teamID: 'A', names: { short: 'AWY' } } },
  players: { P1: { name: 'Test One', teamID: 'H' }, P2: { name: 'Test Two', teamID: 'A' }, P3: { name: 'Test Three', teamID: 'A' } },
  odds,
})
const B = (odds, extra = {}) => ({ odds, available: true, ...extra })
const o = (stat, player, line, byBookmaker, over = 'over') => ({ statID: stat, periodID: 'game', playerID: player, betTypeID: 'ou', sideID: over, bookOverUnder: String(line), byBookmaker })
const match = (sp) => `ours-${sp.name.split(' ')[1]}`

ok('main line 1.5: stored as the median across the listing books, best = longest', () => {
  const r = T.twoPlusRows(ev('NFL', { 'touchdowns-P1-game-ou-over': o('touchdowns', 'P1', 1.5, { a: B('+300'), b: B('+400'), c: B('+500') }) }), 'lock', '2026-11-01T17:00:00Z', match)
  assert.equal(r.rows.length, 1)
  const x = r.rows[0]
  assert.deepEqual([x.sport, x.market, x.bet, x.side, x.line, x.odds, x.best_odds, x.best_book, x.books, x.odd_id, x.our_player_id], ['nfl', 'td2', 'ou', 'over', 1.5, 400, 500, 'c', 3, 'touchdowns-P1-game-ou-over', 'ours-One'])
})
ok('alternate rung: a book lists 1.5 in altLines while the main line is 0.5 -> stored with an @1.5 odd id', () => {
  const books = { a: B('-250', { overUnder: '0.5', altLines: [{ overUnder: '1.5', odds: '+260' }] }), b: B('-240', { altLines: [{ overUnder: '1.5', odds: '+300' }, { overUnder: '2.5', odds: '+2000' }] }), c: B('-260') }
  const r = T.twoPlusRows(ev('MLB', { 'batting_homeRuns-P1-game-ou-over': o('batting_homeRuns', 'P1', 0.5, books) }), 'list', '2026-11-01T10:00:00Z', match)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].odd_id, 'batting_homeRuns-P1-game-ou-over@1.5')
  assert.deepEqual([r.rows[0].market, r.rows[0].books, r.rows[0].best_odds, r.rows[0].snap], ['hr2', 2, 300, 'list'])
  assert.ok(r.rows[0].odds >= 260 && r.rows[0].odds <= 300)
})
ok('a market that lists only 0.5 stores NOTHING (no price is implied)', () => {
  const r = T.twoPlusRows(ev('NHL', { 'points-P1-game-ou-over': o('points', 'P1', 0.5, { a: B('-150'), b: B('-160') }) }), 'lock', 't', match)
  assert.equal(r.rows.length, 0)
})
ok('the anytime yes/no market, the under side, other stats and other periods are never read as 2+', () => {
  const odds = {
    'points-P1-game-yn-yes': { statID: 'points', periodID: 'game', playerID: 'P1', betTypeID: 'yn', sideID: 'yes', bookOverUnder: '1.5', byBookmaker: { a: B('+200') } },
    'points-P2-game-ou-under': o('points', 'P2', 1.5, { a: B('-300') }, 'under'),
    'shots_onGoal-P3-game-ou-over': o('shots_onGoal', 'P3', 1.5, { a: B('-120') }),
    'points-P1-1h-ou-over': { ...o('points', 'P1', 1.5, { a: B('+900') }), periodID: '1h' },
  }
  assert.equal(T.twoPlusRows(ev('NHL', odds), 'lock', 't', match).rows.length, 0)
})
ok('an unavailable book, an unparsable price and an unknown league give no row', () => {
  const books = { a: B('+300', { available: false }), b: B('n/a'), c: B('') }
  assert.equal(T.twoPlusRows(ev('NFL', { 'touchdowns-P1-game-ou-over': o('touchdowns', 'P1', 1.5, books) }), 'lock', 't', match).rows.length, 0)
  assert.equal(T.twoPlusRows(ev('NBA', { x: o('points', 'P1', 1.5, { a: B('+300') }) }), 'lock', 't', match).rows.length, 0)
})
ok('markets are keyed per sport and are not the anytime key', () => {
  assert.deepEqual(T.TWO_PLUS_KEYS.slice().sort(), ['goal2', 'hr2', 'td2'])
  assert.deepEqual(T.TWO_MARKET_OF, { nfl: 'td2', mlb: 'hr2', nhl: 'goal2' })
})

// ── THE CARD HOOK ──
const prices = new Map([['10', { median: 250 }]])
ok('hook: a stored 2+ price clears the floor and the top third -> card', () => {
  const m = H.twoPlusHook({ sport: 'nfl', cands: [{ player_id: 10, price: { median: -400 }, rank: 1, of: 30 }], twoPrices: prices })
  assert.deepEqual([m.get('10').card, m.get('10').twoPrice], [true, 250])
})
ok('hook: NO stored 2+ price -> tracked, never carded, no price made up', () => {
  const m = H.twoPlusHook({ sport: 'nfl', cands: [{ player_id: 11, price: { median: -400 }, rank: 1, of: 30 }], twoPrices: prices })
  assert.deepEqual([m.get('11').card, m.get('11').tracked, m.get('11').twoPrice], [false, true, null])
})
ok('hook: an anytime price that is not short stays anytime (no 2+ check)', () => {
  const m = H.twoPlusHook({ sport: 'nfl', cands: [{ player_id: 10, price: { median: 150 }, rank: 1, of: 30 }], twoPrices: prices })
  assert.equal(m.get('10').check2, false)
})
ok('hook: no anytime price at all -> not checked, never carded', () => {
  const m = H.twoPlusHook({ sport: 'mlb', cands: [{ player_id: 10, price: null, rank: 1, of: 30 }], twoPrices: prices })
  assert.deepEqual([m.get('10').check2, m.get('10').card], [false, false])
})

// ── SOURCE GUARDS ──
const tick = read('app/api/odds/tick/route.js')
ok('tick: 2+ rows come from the event already in hand (no new fetch, no new cron) and the lock write is insert-only', () => {
  assert.ok(tick.includes("twoPlusRows(ev, snap, takenAt, match)"))
  assert.ok((tick.match(/eventsById\(/g) || []).length === 1 && (tick.match(/eventsBetween\(/g) || []).length === 1)
  assert.ok(tick.includes("ignoreDuplicates: true"))
  assert.ok(!read('vercel.json').includes('twoPlus'))
})
const src = read('lib/card/sources.js')
ok('card loader: list/lock snapshots only, cut off at the Card lock, line 1.5 over', () => {
  const body = src.slice(src.indexOf('export async function loadTwoPlusPrices'), src.indexOf('export async function loadAnytimePrices'))
  assert.ok(body.includes("in('snap', ['list', 'lock'])") && body.includes('.lte(\'taken_at\'') && body.includes(".eq('line', TWO_LINE)"))
  assert.ok(!body.includes("'close'"))
})
console.log(`\n${n} checks passed`)
