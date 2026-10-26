#!/usr/bin/env node
// THE SLIP (2026-10-17). TEST DATA only: made-up names, prices and results, labelled TEST. No real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-slip.mjs
import { SLIP_KEYS, SLIP_KEY_ALL, CALLED_CAP, readLegs, withLeg, withLegs, withoutLeg, toggledLeg, combined, calledLegs, mergeLegacy, withPrice, legsOfSport, bySport } from '../lib/slip/core.js'
import { landedTogether, LANDED_TOGETHER_START, MIN_NIGHTS } from '../lib/slip/landed.js'
import { lampAlsoPriced } from '../lib/nhl/lampQuote.js'
import { nbaQuote } from '../lib/nba/oddsQuote.js'
import { findLegs, playerLegs } from '../lib/slip/candidates.js'
import { callStatusOf, hitIndex, hitRateOf, hitWords } from '../lib/slip/grade.js'
import { rowLeg, mlbHrLeg, nflLeg, nhlGoalLeg, nbaLeg, longshotLeg, oddsRowLeg, marketCode } from '../lib/slip/rowLegs.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const NOW = Date.parse('2026-10-20T18:00:00Z')

// STORE MIGRATION: the key shape PropCards always used, and a slip saved by the old PropCards (TEST legs)
eq('legacy keys are `${precisionKey}_slip_v1`', SLIP_KEYS, { mlb: 'moonshot_precision_v1_slip_v1', nfl: 'tuddy_precision_v1_slip_v1', nhl: 'lamp_precision_v1_slip_v1', nba: 'buckets_precision_v1_slip_v1' })
const legacy = JSON.stringify([
  { key: 'TEST1|TD', name: 'TEST Player One', market: 'ATD', price: 240, game: { key: 'AAA-BBB', label: 'AAA · BBB' }, at: NOW - 3600e3 },
  { key: 'TEST2|TD', name: 'TEST Player Two', market: 'ATD', price: 310, game: null, at: NOW - 25 * 3600e3 },   // over a day old: dropped, as before
])
const migrated = readLegs(legacy, NOW)
eq('a legacy slip reads back (old leg kept, stale leg dropped)', migrated.map((l) => [l.key, l.price]), [['TEST1|TD', 240]])
eq('garbage in storage is an empty slip, not a throw', [readLegs('{not json', NOW), readLegs(null, NOW), readLegs('{"a":1}', NOW)], [[], [], []])
eq('a price of 0 / blank is no price, never a number', readLegs(JSON.stringify([{ key: 'k', price: 0, at: NOW }, { key: 'j', price: '', at: NOW }]), NOW).map((l) => l.price), [null, null])
eq('a leg is added once', withLeg(withLeg([], { key: 'a|X', price: 100 }, NOW), { key: 'a|X', price: 100 }, NOW).length, 1)
eq('toggle adds then removes', [toggledLeg([], { key: 'a|X', price: 100 }, NOW).length, toggledLeg(toggledLeg([], { key: 'a|X', price: 100 }, NOW), { key: 'a|X' }, NOW).length], [1, 0])
eq('remove by key', withoutLeg(withLegs([], [{ key: 'a|X' }, { key: 'b|X' }], NOW), 'a|X').map((l) => l.key), ['b|X'])

// COMBINED PRICE: only when every leg has a real price
const two = [{ key: 'a', price: 100 }, { key: 'b', price: 200 }].map((l) => ({ ...l, at: NOW }))
eq('every leg priced -> a combined decimal (2.0 x 3.0)', combined(two), { allPriced: true, priced: 2, total: 2, decimal: 6 })
eq('one leg unpriced -> no combined price', combined([...two, { key: 'c', price: null, at: NOW }]), { allPriced: false, priced: 2, total: 3, decimal: null })
eq('an empty slip has no combined price', combined([]).allPriced, false)

// ADD TONIGHT'S CALLED PICKS: caps, the free example, hidden picks never reachable (TEST candidates, board order, a free four of the first four)
const cands = Array.from({ length: 9 }, (_, i) => ({ key: `T${i}`, free: i < 4, leg: { key: `T${i}|TD`, name: `TEST ${i}`, price: 200 + i } }))
const m = calledLegs(cands, 'member')
eq('member: the first six, in board order', [m.mode, m.legs.map((l) => l.key)], ['member', ['T0|TD', 'T1|TD', 'T2|TD', 'T3|TD', 'T4|TD', 'T5|TD']])
eq('member cap is 6', CALLED_CAP.member, 6)
const f = calledLegs(cands, 'free')
eq('free: an example of the free picks only, capped at 2', [f.mode, f.legs.map((l) => l.key)], ['example', ['T0|TD', 'T1|TD']])
eq('unknown membership behaves as a non-member', calledLegs(cands, 'unknown').legs.map((l) => l.key), ['T0|TD', 'T1|TD'])
eq('a non-member never gets a pick outside the free four, however many are asked', calledLegs(cands.map((c, i) => ({ ...c, free: i === 5 })), 'free').legs.map((l) => l.key), ['T5|TD'])
eq('the Join line counts all priced called picks, no names', f.total, 9)
eq('called legs are marked as such', m.legs.every((l) => l.source === 'called'), true)
eq('no priced called pick -> nothing added', calledLegs([], 'member').legs, [])

// LANDED TOGETHER (TEST nights). A night: score decides the order; each row carries its result.
const night = (date, results) => results.map((r, i) => ({ date, name: `TEST ${date} ${i}`, score: 90 - i, result: r }))
const NEVER_BEFORE = [...night('2026-10-12', ['hit', 'hit', 'hit']), ...night('2026-10-18', ['hit', 'hit'])]   // before the start date: must not count
eq('the start is one constant', LANDED_TOGETHER_START, '2026-10-19')
const before = landedTogether(NEVER_BEFORE, { today: '2026-10-18' })
eq('before the start: "Starts Monday, Oct 19" and no rate', before.rows.map((r) => r.message), Array(5).fill("Starts Monday, Oct 19: counting from tonight's locked picks"))
const afterEmpty = landedTogether(NEVER_BEFORE, { today: '2026-10-20' })
eq('nothing dated before the start counts, even after it', afterEmpty.rows.map((r) => r.nights), [0, 0, 0, 0, 0])
eq('after the start, under 5 nights: "k of 5 nights so far"', afterEmpty.rows[0].message, 'Counting since Oct 19: 0 of 5 nights so far')

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
const rows = []
days.slice(0, 5).forEach((d, i) => rows.push(...night(d, i < 2 ? ['hit', 'hit', 'hit', 'miss'] : ['hit', 'miss', 'hit', 'hit'])))
const four = landedTogether(rows, { today: '2026-10-24' })
eq('five nights: 2-leg all-hit 2 of 5, rate shown with n', [four.rows[0].message, four.rows[0].detail], ['2 of 5 nights', 'n = 5 nights'])
eq('3 legs: nights 3-5 miss on the 2nd pick', four.rows[1].message, '2 of 5 nights')
eq('4 legs: the 4th pick missed on nights 1-2, hit on 3-5 but the 2nd missed', four.rows[2].allHit, 0)
eq('a night with fewer than 5 calls does not count for N=5 or 6', [four.rows[3].nights, four.rows[4].nights, four.rows[3].message], [0, 0, 'Counting since Oct 19: 0 of 5 nights so far'])
eq('a night is graded only on a date before the feed\'s own today', landedTogether(rows, { today: '2026-10-23' }).rows[0].nights, 4)

// the locked list wins: a list changed after first pitch (locked:false) never counts
const withLate = [...rows, ...night('2026-10-19', ['hit', 'hit']).map((c) => ({ ...c, name: `LATE ${c.name}`, score: 99, locked: false, result: 'miss' }))]
eq('a late-changed list uses the locked list (late rows ignored)', landedTogether(withLate, { today: '2026-10-24' }).rows[0], four.rows[0])

// a postponed / voided leg: the night is NOT COUNTED for that N, and the page says how many
const voided = [...rows.filter((c) => c.date !== '2026-10-22'), ...night('2026-10-22', ['hit', 'void', 'hit', 'hit'])]
const v = landedTogether(voided, { today: '2026-10-24' })
eq('void in the top 2 -> not counted for N=2', [v.rows[0].nights, v.rows[0].notCounted], [4, 1])
eq('the page says how many nights were not counted', v.rows[0].detail, 'n = 4 nights; 1 night not counted (a game was voided or postponed)')
eq('under the minimum after a not-counted night: still "k of 5"', v.rows[0].message, 'Counting since Oct 19: 4 of 5 nights so far')
// a void OUTSIDE the top N does not matter to that N
const voidFar = [...rows.filter((c) => c.date !== '2026-10-22'), ...night('2026-10-22', ['hit', 'hit', 'hit', 'void'])]
eq('a void below the top N leaves N=2 counted', landedTogether(voidFar, { today: '2026-10-24' }).rows[0].notCounted, 0)
// order is the locked score, best first, not the order rows arrive in
const shuffled = [...rows].reverse()
eq('the night\'s order is its score, whatever the row order', landedTogether(shuffled, { today: '2026-10-24' }).rows.map((r) => r.allHit), four.rows.map((r) => r.allHit))
eq('calls with no score cannot be ordered, so that night is not used', landedTogether(rows.map((c) => ({ ...c, score: null })), { today: '2026-10-24' }).rows[0].nights, 0)
// LOCKED ORDER (MLB board rank, NFL TD rung). TEST rows: made-up names; `order` 1 = best, whatever the score or the row order.
const ord = (date, pairs, extra = {}) => pairs.map(([o, r], i) => ({ date, name: `TEST ${date} ${i}`, order: o, result: r, ...extra }))
const mlbRows = days.slice(0, 5).flatMap((d, i) => ord(d, i < 2 ? [[9, 'miss'], [3, 'hit'], [14, 'hit'], [5, 'hit']] : [[4, 'hit'], [2, 'hit'], [20, 'miss'], [7, 'hit']]))
const mlb = landedTogether([...mlbRows].reverse(), { today: '2026-10-24' })
eq('MLB: the night\'s top N is by `order` (board rank), not row order', [mlb.rows[0].nights, mlb.rows[0].allHit, mlb.rows[1].allHit], [5, 5, 3])
eq('MLB: a night with no order on one call is not counted', landedTogether([...mlbRows.slice(0, 4).map((c, i) => (i === 1 ? { ...c, order: null } : c)), ...mlbRows.slice(4)], { today: '2026-10-24' }).rows[0].nights, 4)
eq('MLB: rows with no order and no score count nothing', landedTogether(mlbRows.map((c) => ({ ...c, order: null })), { today: '2026-10-24' }).rows[0].nights, 0)
eq('MLB: the start date still gates an ordered night', landedTogether(ord('2026-10-12', [[1, 'hit'], [2, 'hit']]), { today: '2026-10-24' }).rows[0].nights, 0)
// NFL: the week's TD ladder; calls fall on different days, so the week is the night
const WEEK_DAYS = { 7: ['2026-10-22', '2026-10-25'], 8: ['2026-10-29', '2026-11-01'], 9: ['2026-11-05', '2026-11-08'], 10: ['2026-11-12', '2026-11-15'], 11: ['2026-11-19', '2026-11-22'] }
const nflWeeks = Object.entries(WEEK_DAYS).flatMap(([w, [thu, sun]]) => [[1, 'hit'], [2, 'hit'], [3, 'miss'], [4, 'hit'], [5, 'hit']].map(([o, r], i) => ({ date: i % 2 ? thu : sun, week: Number(w), ladder: true, name: `TEST w${w} ${i}`, order: o, result: r })))
const nfl = landedTogether(nflWeeks, { today: '2026-12-01' })
eq('NFL: five weeks of ladders are five nights (a week is one night however many days it spans)', [nfl.rows[0].nights, nfl.rows[0].allHit, nfl.rows[1].allHit, nfl.rows[4].nights], [5, 5, 0, 0])
eq('NFL: a ladder missing rung 1 (not graded / left out) is not used', landedTogether(nflWeeks.filter((c) => !(c.week === 7 && c.order === 1)), { today: '2026-12-01' }).rows[0].nights, 4)
eq('NFL: a week with no order is not used', landedTogether(nflWeeks.map((c) => ({ ...c, order: null })), { today: '2026-12-01' }).rows[0].nights, 0)
eq('MIN_NIGHTS is 5', MIN_NIGHTS, 5)
eq('no model probability is printed anywhere in the messages', JSON.stringify(four).includes('%'), false)

// PARITY (2026-10-17): the NHL "also priced" words, BUCKETS' card price, and the price-history gate. TEST data only.
const TEST_NHL = { by_player_id: { T1: { player_points: { line: 0.5, over: -150 }, player_assists: { line: 1.5, over: 200 } }, T2: { player_points: { line: 0.5, best_over: 120, over: 110 } } } }
eq('NHL also-priced: only a 0.5 book line counts', lampAlsoPriced(TEST_NHL, 'T1'), [{ word: '1+ pt', price: -150 }])
eq('NHL also-priced: best price wins', lampAlsoPriced(TEST_NHL, 'T2'), [{ word: '1+ pt', price: 120 }])
eq('NHL also-priced: nobody / no feed is empty', [lampAlsoPriced(TEST_NHL, 'T9'), lampAlsoPriced(null, 'T1')], [[], []])
const TEST_NBA = { by_player_id: { N1: { player_points: { line: 24.5, over: -110 }, player_rebounds: { line: 9.5, over: 120 } } } }
eq('NBA quote: PTS 25+ is the 24.5 line', nbaQuote(TEST_NBA, 'N1', 'pts')?.over, -110)
eq('NBA quote: REB 10+ is the 9.5 line', nbaQuote(TEST_NBA, 'N1', 'reb')?.over, 120)
eq('NBA quote: double-double has no book line; another line is no quote', [nbaQuote(TEST_NBA, 'N1', 'dd'), nbaQuote(TEST_NBA, 'N1', 'ast')], [null, null])

// ROW '+' (2026-10-17, lib/slip/rowLegs.js): the leg a list row adds. TEST data only: made-up ids, names and prices.
const TEST_MLB = { by_player_id: { 1: { batter_home_runs: { line: 0.5, over: 380, best_over: 420 } }, 2: { batter_home_runs: { line: 1.5, over: 900 } }, 3: { batter_home_runs: { line: 0.5, over: 0 } } } }
const mlbRow = (id) => ({ player_id: id, game_pk: 77, name: `TEST ${id}`, team: 'AAA', opponent: 'BBB' })
const h1 = mlbHrLeg(TEST_MLB, mlbRow(1))
eq('MLB row leg: the best real price, keyed like the Props card', [h1.key, h1.price, h1.line, h1.market, h1.game], ['1-77|HR', 420, 'o0.5', 'HR', { key: 'AAA-BBB', label: 'AAA · BBB' }])
eq('MLB row leg: a book line that is not the bar (1.5) is no leg', mlbHrLeg(TEST_MLB, mlbRow(2)), null)
eq('MLB row leg: a zero price / no quote / no feed is no leg', [mlbHrLeg(TEST_MLB, mlbRow(3)), mlbHrLeg(TEST_MLB, mlbRow(9)), mlbHrLeg(null, mlbRow(1))], [null, null, null])
const TEST_NFL = { by_player_id: { T1: { player_anytime_td: { line: 0.5, over: 150 }, player_rush_yds: { line: 59.5, over: -115 } } } }
eq('NFL row leg: anytime TD on 0.5', nflLeg(TEST_NFL, { player_id: 'T1', name: 'TEST One', team: 'AAA', opp: 'BBB' }, 'TD', 'Anytime TD')?.key, 'T1|TD')
eq('NFL row leg: rush yards at 59.5 is not the 49.5 bar, so no leg', nflLeg(TEST_NFL, { player_id: 'T1', name: 'TEST One' }, 'RUSH_YDS'), null)
eq('NFL row leg: nobody priced is no leg', nflLeg(TEST_NFL, { player_id: 'T9', name: 'TEST Nine' }, 'TD'), null)
const TEST_NHL2 = { by_player_id: { H1: { player_anytime_goal: { line: 0.5, over: 210 } }, H2: { player_anytime_goal: { line: 1.5, over: 800 } } } }
eq('NHL row leg: goal on 0.5, keyed like the player page', [nhlGoalLeg(TEST_NHL2, { id: 'H1', name: 'TEST H1' })?.key, nhlGoalLeg(TEST_NHL2, { id: 'H1', name: 'TEST H1' })?.price], ['H1|GOAL', 210])
eq('NHL row leg: another line is no leg', nhlGoalLeg(TEST_NHL2, { id: 'H2', name: 'TEST H2' }), null)
eq('BUCKETS row leg: PTS on the 24.5 line, keyed like the player page', nbaLeg(TEST_NBA, { id: 'N1', name: 'TEST N1' }, 'pts')?.key, 'N1|pts')
eq('BUCKETS row leg: AST has no quote, so no leg', nbaLeg(TEST_NBA, { id: 'N1', name: 'TEST N1' }, 'ast'), null)
eq('longshot leg: the best book price on the sport\'s anytime bet', ['mlb', 'nfl', 'nhl'].map((s) => longshotLeg(s, { id: 'L1', name: 'TEST L', team: 'AAA', opp: 'BBB', best: 650 })?.key), ['L1|HR', 'L1|TD', 'L1|GOAL'])
eq('longshot leg: no best price, or a sport with no anytime market, is no leg', [longshotLeg('nhl', { id: 'L1', name: 'TEST L', best: null }), longshotLeg('nba', { id: 'L1', name: 'TEST L', best: 650 })], [null, null])
const o1 = oddsRowLeg('mlb', mlbRow(1), 'batter_hits', 'Hits', { line: 0.5, over: -180 }, 0.5, '1-77')
eq('odds board leg: the market code and key are the Props card\'s (HIT)', [o1.key, o1.market, o1.price], ['1-77|HIT', 'Hits', -180])
eq('odds board leg: off the standard bar is no leg', oddsRowLeg('mlb', mlbRow(1), 'batter_hits', 'Hits', { line: 1.5, over: 250 }, 0.5, '1-77'), null)
// THE GATE: a row tap is always a by-hand add. Whatever a caller passes, the leg is never the 'called' shortcut, and it carries no status.
const sneaky = rowLeg({ sport: 'nfl', id: 'X', code: 'TD', name: 'TEST X', q: { line: 0.5, over: 200 }, source: 'called', status: 'called' })
eq('row leg: source is always player (never called), no status field', [sneaky.source, 'status' in sneaky, 'called' in sneaky], ['player', false, false])
eq('row legs for every sport are by-hand', [h1, nflLeg(TEST_NFL, { player_id: 'T1', name: 'TEST One' }, 'TD'), nhlGoalLeg(TEST_NHL2, { id: 'H1', name: 'TEST H1' }), nbaLeg(TEST_NBA, { id: 'N1', name: 'TEST N1' }, 'pts'), longshotLeg('nfl', { id: 'L1', name: 'TEST L', best: 300 })].every((l) => l.source === 'player'), true)
eq('a row leg goes on the shared slip and toggles off', toggledLeg(toggledLeg([], h1, NOW), h1, NOW).length, 0)
eq('market codes: the player pages\' codes', [marketCode('nfl', 'player_anytime_td'), marketCode('nhl', 'player_shots_on_goal'), marketCode('nba', 'player_points'), marketCode('mlb', 'batter_home_runs')], ['TD', 'SOG', 'pts', 'HR'])

// ONE SHARED SLIP (2026-10-25, TEST legs): every sport in one list, the four old keys carried over once
eq('the shared slip key', SLIP_KEY_ALL, 'dash_slip_v2')
const rawOld = {
  mlb: JSON.stringify([{ key: 'TEST1|HR', name: 'TEST M1', market: 'HR', price: 300, at: NOW - 3600e3 }]),
  nba: JSON.stringify([{ key: 'TEST1|pts', name: 'TEST N1', market: 'PTS', price: -110, at: NOW - 3600e3 }, { key: 'TEST9|pts', name: 'TEST N9', price: 100, at: NOW - 30 * 3600e3 }]),
  nhl: null,
}
const merged = mergeLegacy(rawOld, NOW)
eq('legacy keys merge: each leg stamped with its sport, stale dropped', merged.map((l) => [l.sport, l.key]), [['mlb', 'TEST1|HR'], ['nba', 'TEST1|pts']])
eq('merging again adds nothing new (a leg is kept once)', withLegs(merged, merged, NOW).length, 2)
const x = withLegs([], [{ key: 'K1', sport: 'mlb', price: 200 }, { key: 'K1', sport: 'nba', price: 150 }], NOW)
eq('the same key in two sports is two legs', x.map((l) => l.sport), ['mlb', 'nba'])
eq('removing by key + sport takes only that sport\'s leg', withoutLeg(x, 'K1', 'nba').map((l) => l.sport), ['mlb'])
eq('a sport\'s legs are only its own', legsOfSport(x, 'nba').map((l) => l.price), [150])
eq('legs group in sport order, empty sports left out', bySport([...x].reverse()).map(([s]) => s), ['mlb', 'nba'])
eq('a cross-sport slip prices as one parlay when every leg is priced', combined(x).decimal, 3 * 2.5)
eq('your own price sets the leg and marks it yours', withPrice(x, 'K1', 'nba', '-120').map((l) => [l.sport, l.price, Boolean(l.priceEdited)]), [['mlb', 200, false], ['nba', -120, true]])
eq('a bad price (blank, junk, under 100) changes nothing', [withPrice(x, 'K1', 'nba', ''), withPrice(x, 'K1', 'nba', 'abc'), withPrice(x, 'K1', 'nba', '50')].every((r) => r === x), true)

// ADD A LEG (2026-10-25, TEST data): a typed name -> only players with a real price on the bet's own bar
const IDX = { nba: [{ id: 'N1', name: 'TEST Nine One', team: 'AAA' }, { id: 'N2', name: 'TEST Nine Two', team: 'BBB' }, { id: 'N3', name: 'TEST Nine Three', team: 'AAA' }], nhl: [{ id: 'H1', name: 'TEST Hockey One', team: 'CCC' }] }
const TEST_NBA2 = { by_player_id: { ...TEST_NBA.by_player_id, N3: { player_points: { line: 9.5, over: -130 }, player_rebounds: { line: 4.5, over: 110 } } } }
const ODDS = { nba: TEST_NBA2, nhl: { by_player_id: { H1: { player_anytime_goal: { line: 0.5, over: 400 } } } } }
eq('add a leg: under 2 letters finds nothing', findLegs('t', IDX, ODDS), [])
const f1 = findLegs('test nine', IDX, ODDS)
eq('add a leg: only players the books price (N2 has no quote); an off-bar book line is its own leg with the line in the label', f1.map((h) => [h.id, h.legs.map((l) => [l.key, l.market])]), [['N1', [['N1|pts', 'PTS 25+'], ['N1|reb', 'REB 10+']]], ['N3', [['N3|pts@9.5', 'PTS o9.5'], ['N3|reb@4.5', 'REB o4.5']]]])
eq('add a leg: an off-bar leg is a different bet from the board\'s (both can ride one slip) and finds the same hit-rate lane', [withLegs([], [...f1[0].legs, ...f1[1].legs], NOW).length, hitRateOf({ key: 'N3|pts@9.5', sport: 'nba', id: 'N3', line: 'o9.5' }, hitIndex([{ sport: 'nba', id: 'N3', lane: 'pts', line: 9.5, side: 'over', own: { L10: { ok: 6, n: 10, pct: 60 } } }])).own.pct], [4, 60])
eq('add a leg: a leg is the existing builder\'s (real price, by hand, no game)', [f1[0].legs[0].price, f1[0].legs[0].source, f1[0].legs[0].sport, f1[0].legs[0].game], [-110, 'player', 'nba', null])
eq('add a leg: it searches across products', findLegs('test', IDX, ODDS).map((h) => h.sport).sort(), ['nba', 'nba', 'nhl'])
eq('add a leg: a product with no prices loaded is skipped, never guessed', findLegs('test hockey', IDX, { nba: TEST_NBA }), [])
eq('add a leg: no odds, no legs', playerLegs('nba', IDX.nba[0], null), [])
eq('add a leg: the leg goes on the shared slip once', withLegs([], [f1[0].legs[0], f1[0].legs[0]], NOW).length, 1)
// GRADE: CALLED only for a pick the product published; a non-member never sees a pick outside the free four
const pubT = { cands: [{ key: 'N1|pts', free: false, leg: { key: 'N1|pts' } }, { key: 'N1|reb', free: true, leg: { key: 'N1|reb' } }] }
eq('grade: a member sees CALLED on a called leg', callStatusOf({ key: 'N1|pts' }, pubT, 'member'), 'called')
eq('grade: a non-member sees nothing outside the free four', callStatusOf({ key: 'N1|pts' }, pubT, 'free'), null)
eq('grade: a non-member sees a free-four call', callStatusOf({ key: 'N1|reb' }, pubT, 'free'), 'called')
eq('grade: no published calls, or a leg not called, is silent (never "not on the board")', [callStatusOf({ key: 'N1|pts' }, null, 'member'), callStatusOf({ key: 'ZZ|pts' }, pubT, 'member')], [null, null])

// HIT RATE STRIP (TEST rows in main's Hit Rater shape): a leg finds its row by sport + id + lane + line, over side only, never a model %
const c10 = (ok, n) => ({ ok, n, pct: Math.round((100 * ok) / n) })
const HR_ROWS = [
  { sport: 'nba', id: 'N1', lane: 'pts', line: 24.5, side: 'over', own: { L10: c10(7, 10) }, dvp: { L10: c10(6, 10) } },
  { sport: 'nhl', id: 'H1', lane: 'g', line: 0.5, side: 'over', own: { L10: c10(3, 10) }, dvp: null },
  { sport: 'nfl', id: 'F1', lane: 'REC_YDS', line: 59.5, side: 'over', own: { L10: c10(2, 4) }, dvp: { L10: c10(5, 10) } },
  { sport: 'nba', id: 'N1', lane: 'pts', line: 24.5, side: 'under', own: { L10: c10(3, 10) }, dvp: null },
]
const HX = hitIndex(HR_ROWS)
const legNba = { key: 'N1|pts', sport: 'nba', id: 'N1', line: 'o24.5' }
eq('hit rate: BUCKETS leg finds its row; words are percent first, the count after', [hitWords(hitRateOf(legNba, HX).own), hitWords(hitRateOf(legNba, HX).dvp)], ['70% 7/10', '60% 6/10'])
eq('hit rate: the over row, not the under row', hitRateOf(legNba, HX).own.pct, 70)
eq('hit rate: LAMP GOAL leg maps to lane g, no defense number is silent', [hitRateOf({ key: 'H1|GOAL', sport: 'nhl', id: 'H1', line: 'o0.5' }, HX).own.pct, hitRateOf({ key: 'H1|GOAL', sport: 'nhl', id: 'H1', line: 'o0.5' }, HX).dvp], [30, null])
eq('hit rate: TUDDY lane key is the market code; under 5 games is flagged thin', [hitRateOf({ key: 'F1|REC_YDS', sport: 'nfl', id: 'F1', line: 'o59.5' }, HX).own.thin, hitRateOf({ key: 'F1|REC_YDS', sport: 'nfl', id: 'F1', line: 'o59.5' }, HX).dvp.thin], [true, false])
eq('hit rate: another line, an unknown man, no index, or MOONSHOT (no rows) is no strip', [hitRateOf({ ...legNba, line: 'o29.5' }, HX), hitRateOf({ key: 'ZZ|pts', sport: 'nba', id: 'ZZ', line: 'o24.5' }, HX), hitRateOf(legNba, null), hitRateOf({ key: 'M1|HR', sport: 'mlb', id: 'M1', line: 'o0.5' }, HX)], [null, null, null, null])

// CROSS-SPORT PARLAYS (2026-10-25): legs from different products ride one slip and one combined price
const mix = withLegs([], [
  { key: 'N1|pts', sport: 'nba', price: 100, game: { key: 'AAA-BBB', label: 'AAA · BBB' } },
  { key: 'H1|GOAL', sport: 'nhl', price: 200, game: { key: 'CCC-DDD', label: 'CCC · DDD' } },
  { key: 'F1|TD', sport: 'nfl', price: 300, game: { key: 'EEE-FFF', label: 'EEE · FFF' } },
  { key: 'N2|reb', sport: 'nba', price: -200, game: { key: 'AAA-BBB', label: 'AAA · BBB' } },
], NOW)
eq('cross-sport: three products on one slip, grouped in sport order', bySport(mix).map(([s, ls]) => [s, ls.length]), [['nfl', 1], ['nhl', 1], ['nba', 2]])
eq('cross-sport: one combined price across sports (2.0 x 3.0 x 4.0 x 1.5)', combined(mix).decimal, 36)
eq('cross-sport: taking a whole sport off leaves the others', withoutLeg(withoutLeg(mix, 'N1|pts', 'nba'), 'N2|reb', 'nba').map((l) => l.sport), ['nhl', 'nfl'])

if (fail) { console.error(`\n${fail} FAILED`); process.exit(1) }
console.log('\nall ok')
