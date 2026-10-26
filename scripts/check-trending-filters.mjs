#!/usr/bin/env node
// TRENDING FILTERS (2026-10-26). TEST data only: made-up names, prices and counts, labelled TEST. No real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-trending-filters.mjs
import { defaults, filterRows, sortRows, propOptions, teamOptions, gameOptions, sportCounts, fromParams, toParams, describe, decimalOf, winCell } from '../lib/trendingFilters.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const c = (ok, n) => ({ ok, n, pct: n ? Math.round((100 * ok) / n) : null })
const row = (o) => ({ sport: 'nba', id: o.name, name: o.name, team: 'AAA', opp: 'BBB', home: true, gameId: 'G1', lane: o.word.toLowerCase(), word: o.word, line: 10.5, odds: 150, own: { L5: c(3, 5), L10: c(7, 10), L20: c(12, 20), Season: c(30, 50) }, dvp: { L10: c(5, 10) }, ...o })
const ROWS = [
  row({ name: 'TEST A', word: 'PTS', own: { L5: c(5, 5), L10: c(9, 10), L20: c(15, 20), Season: c(40, 50) } }),
  row({ name: 'TEST B', word: 'REB', odds: -200, own: { L5: c(2, 5), L10: c(6, 10), L20: c(10, 20), Season: c(20, 50) } }),
  row({ name: 'TEST C', word: 'GOAL', sport: 'nhl', team: 'CCC', opp: 'DDD', home: false, gameId: 'G2', odds: 900, own: { L5: c(1, 5), L10: c(3, 10), L20: c(5, 20), Season: c(12, 60) } }),
  row({ name: 'TEST D', word: 'ANY TD', sport: 'nfl', team: 'EEE', opp: 'FFF', gameId: 'G3', odds: null, own: { L5: c(2, 3), L10: c(3, 4), L20: null, Season: c(9, 20) } }),
  row({ name: 'TEST E', word: 'SOG', sport: 'nhl', team: 'CCC', opp: null, home: null, gameId: null, odds: -110, own: { L5: c(4, 5), L10: c(8, 10), L20: c(16, 20), Season: c(45, 60) } }),
]
const names = (rs) => rs.map((r) => r.name.replace('TEST ', ''))
const D = defaults()

eq('default: every sport, L10, at least 5 games (TEST D has 4 L10 games: left out)', names(filterRows(ROWS, D)), ['A', 'B', 'C', 'E'])
eq('sports on/off: NBA only', names(filterRows(ROWS, { ...D, sports: ['nba'] })), ['A', 'B'])
eq('sports on/off: NHL + NFL, the others off', names(filterRows(ROWS, { ...D, sports: ['nhl', 'nfl'], minN: 1 })), ['C', 'D', 'E'])
eq('prop type works across sports', names(filterRows(ROWS, { ...D, props: ['PTS', 'SOG'] })), ['A', 'E'])
eq('hit-rate bar 70 on L10', names(filterRows(ROWS, { ...D, bar: 70 })), ['A', 'E'])
eq('hit-rate bar uses the chosen window (L5 80+)', names(filterRows(ROWS, { ...D, bar: 80, win: 'L5' })), ['A', 'E'])
eq('long-run window: 50 games or 60, bar 70', names(filterRows(ROWS, { ...D, bar: 70, win: 'Season' })), ['A', 'E'])
eq('minimum games 10 on L20 leaves out a man with no L20', names(filterRows(ROWS, { ...D, win: 'L20', minN: 10 })), ['A', 'B', 'C', 'E'])
eq('price range reads in bettor order: -150 to +300', names(filterRows(ROWS, { ...D, price: [-150, 300] })), ['A', 'E'])
eq('a price range leaves out a row with no price; no range keeps it', [names(filterRows(ROWS, { ...D, minN: 1, price: [-500, 2000] })).includes('D'), names(filterRows(ROWS, { ...D, minN: 1 })).includes('D')], [false, true])
eq('home / away', [names(filterRows(ROWS, { ...D, ha: 'away' })), names(filterRows(ROWS, { ...D, ha: 'home' }))], [['C'], ['A', 'B']])
eq('team and name search (accents and case do not matter)', [names(filterRows(ROWS, { ...D, team: 'CCC' })), names(filterRows(ROWS, { ...D, q: 'test b' })), names(filterRows(ROWS, { ...D, q: 'ccc' }))], [['C', 'E'], ['B'], ['C', 'E']])
eq('game filter keeps rows of that game only', names(filterRows(ROWS, { ...D, game: 'G2' })), ['C'])
eq('filters stack: NHL + SOG/GOAL + bar 70 + price', names(filterRows(ROWS, { ...D, sports: ['nhl'], props: ['GOAL', 'SOG'], bar: 70, price: [-200, 500] })), ['E'])
eq('nothing clears every filter at once is an empty list, not a throw', filterRows(ROWS, { ...D, bar: 80, sports: ['nfl'] }), [])
eq('sort: the chosen window first, then the long run', names(sortRows(filterRows(ROWS, D), 'L10')), ['A', 'E', 'B', 'C'])
eq('sort by L5 puts the L5 leader first', names(sortRows(filterRows(ROWS, D), 'L5'))[0], 'A')
eq('prop options come from the sports that are on', [propOptions(ROWS, ['nba']).map((o) => o.word), propOptions(ROWS, ['nhl', 'nfl']).map((o) => o.word)], [['PTS', 'REB'], ['GOAL', 'ANY TD', 'SOG']])
eq('team options sorted', teamOptions(ROWS), ['AAA', 'CCC', 'EEE'])
eq('game options: only rows that carry a game (tonight), labelled away @ home', gameOptions(ROWS).map((g) => g.label), ['BBB @ AAA', 'CCC @ DDD', 'FFF @ EEE'].sort())
eq('sport counts', sportCounts(ROWS), { nba: 2, nhl: 2, nfl: 1 })
eq('decimal order: -150 < +300', [decimalOf(-150) < decimalOf(300), decimalOf(100)], [true, 2])
eq('winCell: an empty or missing window is null', [winCell(ROWS[3], 'L20'), winCell(ROWS[0], 'L5').pct], [null, 100])

// THE URL: defaults write nothing; a view round-trips; garbage is the default
const get = (o) => (k) => o[k] ?? null
eq('defaults write no params', Object.values(toParams(D)).every((v) => v == null), true)
const view = { ...D, sports: ['nba', 'nhl'], props: ['PTS', 'SOG'], bar: 70, win: 'L5', price: [-150, 300], minN: 8, ha: 'away', q: 'ab', team: 'CCC', game: 'G2' }
const wrote = Object.fromEntries(Object.entries(toParams(view)).filter(([, v]) => v != null))
eq('a view round-trips through the hash', fromParams(get(wrote)), view)
eq('garbage in the URL is the default view', fromParams(get({ sp: 'xx', bar: '55', win: 'L99', price: '5,6', min: '3', ha: 'both' })), D)
eq('the sports default is the page\'s preset (a product tab)', fromParams(get({}), defaults(['nhl'])).sports, ['nhl'])
eq('the preset itself is not written to the URL', toParams(defaults(['nhl']), defaults(['nhl'])).sp, null)
eq('the count line says what is on', describe(view, { nba: 'BUCKETS', nhl: 'LAMP' }), 'BUCKETS + LAMP · PTS, SOG · L5 70%+ · -150 to +300 · away games · CCC')

if (fail) { console.error(`\n${fail} FAILED`); process.exit(1) }
console.log('\nall ok')
