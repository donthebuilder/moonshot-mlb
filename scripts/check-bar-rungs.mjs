#!/usr/bin/env node
// BUCKETS' CALL RUNG (lib/odds/barRungs.js). ALL DATA IS TEST DATA (a made-up NBA event: Test Guard / Test Big, clubs AAA / BBB); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-bar-rungs.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { barRungRows, rungPricesAt, RUNG_LINE } from '../lib/odds/barRungs.js'
import { chooseRung, straightVerdict } from '../lib/card/rules.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const B = (odds, extra = {}) => ({ odds, available: true, ...extra })
const ev = (odds) => ({ eventID: 'E1', leagueID: 'NBA', startsAt: '2026-11-01T00:00:00Z', status: { startsAt: '2026-11-01T00:00:00Z' }, teams: { home: { teamID: 'T1', names: { short: 'AAA' } }, away: { teamID: 'T2', names: { short: 'BBB' } } },
  players: { P1: { name: 'Test Guard', teamID: 'T1' }, P2: { name: 'Test Big', teamID: 'T2' } }, odds })
const odd = (stat, player, main, books) => ({ statID: stat, periodID: 'game', playerID: player, betTypeID: 'ou', sideID: 'over', bookOverUnder: String(main), bookOdds: '-150', byBookmaker: books })

t('the call rungs are the model\'s own bars minus a half: 25+/10+/8+/4+/35+ = over 24.5 / 9.5 / 7.5 / 3.5 / 34.5', () => {
  assert.deepEqual(RUNG_LINE, { pts: 24.5, reb: 9.5, ast: 7.5, '3pm': 3.5, pra: 34.5 })
})
t('4+ threes: main line 2.5 at -150 plus an ALTERNATE 3.5 rung -> a 3.5 row at the books\' median price (about +150), never the main', () => {
  const o = odd('threePointersMade', 'P1', 2.5, { a: B('-150', { overUnder: '2.5', altLines: [{ overUnder: '3.5', odds: '+140' }] }), b: B('-140', { overUnder: '2.5', altLines: [{ overUnder: '3.5', odds: '+160' }] }), c: B('-155', { overUnder: '2.5', altLines: [{ overUnder: '3.5', odds: '+150' }] }) })
  const r = barRungRows(ev({ 'tm-over': o }), 'lock', '2026-10-31T22:00:00Z', null)
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.market, '3pm_bar'); assert.equal(row.line, 3.5); assert.equal(row.side, 'over'); assert.equal(row.odd_id, 'tm-over@3.5')
  assert.ok(row.odds >= 140 && row.odds <= 160, `median ${row.odds}`); assert.equal(row.best_odds, 160); assert.equal(row.books, 3)
})
t('a book whose MAIN line is the rung counts (8+ assists on a 7.5 main) and keeps the plain odd id', () => {
  const o = odd('assists', 'P2', 7.5, { a: B('+100', { overUnder: '7.5' }), b: B('+110', { overUnder: '7.5' }) })
  const r = barRungRows(ev({ 'as-over': o }), 'list', 't', null).rows[0]
  assert.equal(r.line, 7.5); assert.equal(r.odd_id, 'as-over'); assert.equal(r.books, 2)
})
t('no book lists the rung = no row (nothing guessed); another league or another stat = no row', () => {
  assert.equal(barRungRows(ev({ x: odd('rebounds', 'P2', 5.5, { a: B('-120', { overUnder: '5.5', altLines: [{ overUnder: '6.5', odds: '+100' }] }) }) }), 'lock', 't', null).rows.length, 0)
  assert.equal(barRungRows({ ...ev({}), leagueID: 'NHL' }, 'lock', 't', null).rows.length, 0)
  assert.equal(barRungRows(ev({ x: odd('steals', 'P2', 1.5, { a: B('+100', { overUnder: '9.5' }) }) }), 'lock', 't', null).rows.length, 0)
  assert.deepEqual(rungPricesAt(odd('points', 'P1', 22.5, { a: B('-117', { overUnder: '22.5', available: false }) }), 24.5), [])
})
t('the Card picks the rung and passes it: Murray-shape 4+ threes at +150 clears the 4+ line floor and the +120 price floor; the main 2.5 at -150 did not', () => {
  const main = { line: 2.5, median: -150 }, rung = { line: 3.5, median: 150 }
  assert.equal(chooseRung([main, rung], 'nba', '3pm').line, 3.5)
  assert.equal(straightVerdict('nba', '3pm', { line: 2.5, price: { median: -150 } }).ok, false)
  assert.equal(straightVerdict('nba', '3pm', { line: 3.5, price: { median: 150 } }).ok, true)
  assert.equal(straightVerdict('nba', 'ast', { line: 7.5, price: { median: 100 } }).ok, false, 'plus money under the +120 floor is still a miss: say if the floor should be +100')
})
t('the Card\'s line loader reads the _bar rows beside the main ones, for NBA only', () => {
  const src = fs.readFileSync(new URL('../lib/card/sources.js', import.meta.url), 'utf8')
  assert.match(src, /RUNG_MARKETS = \{ nba: \(m\) => \[m, `\$\{m\}\$\{BAR_SUFFIX\}`\] \}/)
})
t('wired in the tick at the list and the lock, NBA only, written apart from the main rows', () => {
  const src = fs.readFileSync(new URL('../app/api/odds/tick/route.js', import.meta.url), 'utf8')
  assert.match(src, /rungRows\.push\(\.\.\.barRungRows\(ev, 'list'/); assert.match(src, /snap === 'lock' && ev\.leagueID === 'NBA'/)
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: bar rungs')
process.exit(failed ? 1 : 0)
