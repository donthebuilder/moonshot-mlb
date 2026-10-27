// lamp-first-v1 (lib/nhl/firstModel.js): the pure parts. TEST DATA throughout (labelled TEST_), no feed, no database.
import { shrinkGoals, clubFirstRate, clubFirstCounts, scoreFirstNight, gradeFirstRows, MIN_GP } from '../lib/nhl/firstModel.js'
let bad = 0
const ok = (c, m) => { if (!c) { bad++; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
// TEST_: shrinkage pulls a thin rate toward 0.12 and leaves a long one alone
ok(Math.abs(shrinkGoals(0.5, 5) - ((0.5 * 5 + 20 * 0.12) / 25)) < 1e-9, 'goal rate is pulled toward the league by games')
ok(shrinkGoals(0.5, 200) > 0.45, 'a long season stays himself')
ok(clubFirstRate(0, 0) === 0.5, 'a club with no games is 50%')
ok(clubFirstRate(10, 10) > 0.5 && clubFirstRate(10, 10) < 1, 'a club that always scored first is pulled back')
const TEST_counts = clubFirstCounts([{ home: 'AAA', away: 'BBB', first_score_team: 'AAA' }, { home: 'BBB', away: 'AAA', first_score_team: 'AAA' }])
ok(TEST_counts.get('AAA').firsts === 2 && TEST_counts.get('AAA').games === 2 && TEST_counts.get('BBB').firsts === 0, 'club counts: firsts and games per club')
const cand = (id, name, team, gpg, gp) => ({ gameId: 1, playerId: id, name, pos: 'C', team, opp: team === 'AAA' ? 'BBB' : 'AAA', home: team === 'AAA', legs: { ok: true, goalsPg: gpg, gpPooled: gp }, context: null })
const TEST_night = scoreFirstNight([cand(1, 'TEST Alpha', 'AAA', 0.6, 20), cand(2, 'TEST Bravo', 'BBB', 0.6, 20), cand(3, 'TEST Charlie', 'AAA', 0.2, 20), cand(4, 'TEST Delta', 'BBB', 0.1, 20), cand(5, 'TEST Echo', 'AAA', 0.9, 2), { ...cand(6, 'TEST Foxtrot', 'AAA', 0.3, 20), legs: { ok: false, reason: 'out' } }], TEST_counts)
const g = TEST_night.byGame.get(1)
const by = (n) => g.find((r) => r.name === n)
ok(by('TEST Alpha').rank === 1 && by('TEST Alpha').status === 'called', 'same rate, the club that scores first leads: Alpha #1 CALLED')
ok(by('TEST Bravo').rank === 2 && by('TEST Bravo').status === 'board', 'Bravo #2 ON THE BOARD')
ok(by('TEST Charlie').rank === 3 && by('TEST Charlie').status === 'board', 'Charlie #3 ON THE BOARD')
ok(by('TEST Delta').rank === 4 && by('TEST Delta').status === 'off' && /#4/.test(by('TEST Delta').reason), 'Delta #4 NOT ON THE BOARD with the reason')
ok(by('TEST Echo').score == null && by('TEST Echo').status === 'off' && new RegExp(String(MIN_GP)).test(by('TEST Echo').reason), 'under 5 games: not scored, reason printed')
ok(by('TEST Foxtrot').status === 'off' && by('TEST Foxtrot').reason === 'out', 'an unscored man keeps his reason')
ok(g.filter((r) => r.status === 'called').length === 1, 'one CALLED a game')
ok(by('TEST Alpha').score === 100 && by('TEST Delta').score === 0, 'score is a 0-100 spot among scored skaters')
// grade
const pbgs = { awayTeam: { forwards: [{ playerId: 2 }], defense: [{ playerId: 4 }] }, homeTeam: { forwards: [{ playerId: 1 }, { playerId: 3 }], defense: [] } }
const rows = [{ player_id: 1 }, { player_id: 2 }, { player_id: 9 }]
const gr = gradeFirstRows(rows, pbgs, { firstScorer: '2' })
ok(gr[1].hit === true && gr[0].hit === false && gr[2].hit === null && gr[2].dressed === false, 'grade: the first scorer hits, others miss, not dressed is void')
ok(gradeFirstRows(rows, pbgs) === rows, 'no first scorer named: rows come back untouched (a regrade changes nothing)')
if (bad) { console.error(`${bad} failed`); process.exit(1) }
console.log('all ok')
