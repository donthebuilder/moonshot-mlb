// first_td_site_v1 (lib/nfl/firstTd.js): the pure parts. TEST DATA only (made-up clubs AAA..CCC and players), no feed, no database.
import { firstTdBoard, firstTdRows, firstTdOf, firstTdResult, clubFirstCounts, clubFirstRate } from '../lib/nfl/firstTd.js'
let bad = 0
const ok = (c, m) => { if (!c) { bad++; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
const P = (id, name, team, opp, pos, xtd, td = 50, extra = {}) => ({ player_id: id, name, team, opp, position: pos, scores: { TD: td }, stats: { xTD: xtd }, ...extra })
const TEST_week = { markets: [{ key: 'TD', positions: ['RB', 'WR', 'TE'] }], players: [
  P('a1', 'TEST Ace', 'AAA', 'BBB', 'RB', 4), P('a2', 'TEST Bo', 'AAA', 'BBB', 'WR', 2), P('a3', 'TEST Cy', 'AAA', 'BBB', 'TE', 1),
  P('b1', 'TEST Dee', 'BBB', 'AAA', 'WR', 3), P('b2', 'TEST Eli', 'BBB', 'AAA', 'RB', 3), P('b3', 'TEST Flo', 'BBB', 'AAA', 'TE', 0.5), P('b4', 'TEST Gus', 'BBB', 'AAA', 'WR', 0.5),
  P('c1', 'TEST Hal', 'CCC', 'AAA', 'WR', 5, 50, { on_bye: true }), P('z1', 'TEST NoXtd', 'AAA', 'BBB', 'WR', null),
] }
ok(clubFirstRate(0, 0) === 0.5, 'a club with no games is 50%')
const TEST_counts = clubFirstCounts([{ home: 'AAA', away: 'BBB', first_score_team: 'AAA' }, { home: 'BBB', away: 'AAA', first_score_team: 'AAA' }, { home: 'AAA', away: 'BBB', first_score_team: 'AAA' }])
ok(TEST_counts.get('AAA').firsts === 3 && TEST_counts.get('BBB').games === 3 && TEST_counts.get('BBB').firsts === 0, 'club counts')
const board = firstTdBoard(TEST_week, TEST_counts)
const by = (n) => board.rows.find((r) => r.name === n)
ok(!by('TEST Hal') && !by('TEST NoXtd'), 'a bye man and a man with no expected TDs are not ranked')
ok(by('TEST Ace').first.rank === 1, 'Ace (4 of 7 xTD, club that scores first) is #1 in the game')
ok(by('TEST Dee').first.rank === 3 || by('TEST Dee').first.rank === 4 || by('TEST Dee').first.rank === 2, 'ranks run across both clubs in one game')
ok(board.rows.filter((r) => r.first.rank === 1).length === 1, 'one #1 per game')
ok(by('TEST Ace').first_on_board === true && by('TEST Gus').first_on_board === false, 'top 3 in the game ON THE BOARD, the rest not')
ok(Math.abs(by('TEST Ace').first.share - 4 / 7) < 1e-9, 'share is his slice of his club\'s expected TDs')
const base = [{ sport: 'nfl', game_id: 'E1', player_id: 'a1' }, { sport: 'nfl', game_id: 'E1', player_id: 'b1' }]
const rows = firstTdRows({ week: TEST_week, counts: TEST_counts, rowsBase: base })
ok(rows.length === 2 && rows.every((r) => r.model_version === 'first_td_site_v1' && r.model_id === 'tuddy-first' && r.game_id === 'E1' && r.called_by === null), 'lock rows: only the game\'s men, own model, nothing CALLED')
const feed = [
  { team: 'BBB', opponent: 'AAA', quarter: 2, clock: '3:00', td_n: 3, scorer_name: 'TEST Dee' },
  { team: 'AAA', opponent: 'BBB', quarter: 1, clock: '9:10', td_n: 1, scorer_name: 'TEST Ace' },
  { team: 'AAA', opponent: 'BBB', quarter: 1, clock: '2:00', td_n: 2, scorer_name: 'TEST Bo' },
  { team: 'XXX', opponent: 'YYY', quarter: 1, clock: '14:00', td_n: 1, scorer_name: 'TEST Other game' },
]
ok(firstTdOf(feed, 'BBB', 'AAA').scorer_name === 'TEST Ace', 'the first TD is the earliest quarter, most clock left')
ok(firstTdResult({ name: 'TEST Ace', team: 'AAA', opp: 'BBB' }, feed).result === 'hit', 'grade: the first scorer hits')
ok(firstTdResult({ name: 'TEST Dee', team: 'BBB', opp: 'AAA' }, feed).result === 'miss', 'grade: another man misses')
ok(firstTdResult({ name: 'TEST Ace', team: 'AAA', opp: 'BBB' }, []) === null, 'no TD on file yet: not graded')
if (bad) { console.error(`${bad} failed`); process.exit(1) }
console.log('all ok')
