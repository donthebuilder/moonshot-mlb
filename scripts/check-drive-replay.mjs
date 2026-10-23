// TUDDY'S FIELD STAGE: the play-by-play checks (2026-10-22, lib/nfl/drives.js). TEST DATA ONLY: a hand-built ESPN-shaped
// summary below (made-up clubs TST / DMO and made-up men); nothing is fetched. Proves:
//   1. each play's kind comes from ESPN's play type (a touchdown pass is a PASS with td, never an "extra point")
//   2. the names: the receiver on a pass, the runner on a run, the kicker on a kick, the returner; never the holder or tackler
//   3. a kick lands where its words say (kicks N yards from the tee; punts N yards from the line), a touchback in the end zone
//   4. the score bug: the six on the touchdown's hold, the try's point once the kick is through; a field goal's three at its end
//   5. the down and distance ("1st & Goal" inside the ten), the clock, the timeline's beats in order
//   6. the ball's path starts where the play started and ends where it ended, and a throw is in the air
//   node --import ./scripts/_esm-resolve.mjs scripts/check-drive-replay.mjs
import { playsFromSummary, playPath, ballAt, playWords, downText, beatsOf, scoreAt, patPlay, shortKey } from '../lib/nfl/drives.js'

let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`ok   ${msg}`); else { fails += 1; console.log(`FAIL ${msg}`) } }

// TEST: home TST (id 1) scores at 100, away DMO (id 2) at 0
const P = (type, text, o) => ({ type: { text: type }, text, period: { number: o.q ?? 1 }, clock: { displayValue: o.c ?? '15:00' },
  start: { down: o.d ?? 0, distance: o.dist ?? 0, yardLine: o.from, team: { id: o.team } }, end: { yardLine: o.to }, statYardage: o.gain ?? 0,
  scoringPlay: !!o.score, awayScore: o.as ?? 0, homeScore: o.hs ?? 0 })
const TEST = {
  header: { id: '999', competitions: [{ id: '999', date: '2026-01-01T18:00Z', status: { type: { completed: true } }, competitors: [
    { homeAway: 'home', score: '10', team: { id: '1', abbreviation: 'TST', color: '000000', logos: [] } },
    { homeAway: 'away', score: '0', team: { id: '2', abbreviation: 'DMO', color: '000000', logos: [] } }] }] },
  boxscore: { players: [
    { team: { id: '1' }, statistics: [{ athletes: [{ athlete: { lastName: 'Tester', displayName: 'Tom Tester', jersey: '11' } }, { athlete: { lastName: 'Runner', displayName: 'Ron Runner', jersey: '22' } }, { athlete: { lastName: 'St. Catch', displayName: 'Amon St. Catch', jersey: '14' } }] }] },
    { team: { id: '2' }, statistics: [{ athletes: [{ athlete: { lastName: 'Kick', displayName: 'Ken Kick', jersey: '3' } }] }] }] },
  drives: { previous: [
    { team: { id: '1' }, plays: [
      P('Kickoff', 'K.Kick kicks 61 yards from DMO 35 to TST 4. R.Runner to TST 30 for 26 yards (X.Tackler).', { team: '2', from: 65, to: 30 }),
      P('Rush', '(Shotgun) R.Runner left tackle to TST 38 for 8 yards (X.Tackler).', { team: '1', from: 30, to: 38, d: 1, dist: 10, gain: 8, c: '14:55' }),
      P('Pass Reception', '(Shotgun) T.Tester pass deep right to Am.St. Catch to DMO 7 for 55 yards (X.Tackler).', { team: '1', from: 38, to: 93, d: 2, dist: 2, gain: 55, c: '14:20' }),
      P('Official Timeout', 'Timeout #1 by DMO at 13:58.', { team: '1', from: 93, to: 93 }),
      P('Passing Touchdown', '(Shotgun) T.Tester pass short left to Am.St. Catch for 7 yards, TOUCHDOWN. K.Holder extra point is GOOD, Center-X.Snap, Holder-K.Holder.', { team: '1', from: 93, to: 100, d: 1, dist: 7, gain: 7, score: true, hs: 7, c: '13:50' }),
      P('Kickoff', 'K.Holder kicks 65 yards from TST 35 to end zone, Touchback to the DMO 35.', { team: '1', from: 35, to: 65, hs: 7 }),
    ] },
    { team: { id: '2' }, plays: [
      P('Pass Incompletion', 'X.Thrower pass incomplete short left to X.Wide.', { team: '2', from: 65, to: 65, d: 1, dist: 10, hs: 7, q: 2, c: '15:00' }),
      P('Punt', 'X.Punter punts 46 yards to TST 19, Center-X.Snap, fair catch by R.Runner.', { team: '2', from: 65, to: 19, d: 4, dist: 10, hs: 7, q: 2, c: '14:52' }),
      P('Field Goal Good', 'K.Holder 33 yard field goal is GOOD, Center-X.Snap, Holder-X.Hold.', { team: '1', from: 85, to: 100, d: 4, dist: 3, score: true, hs: 10, q: 2, c: '9:10' }),
    ] }] },
}

const g = playsFromSummary(TEST)
ok(g && g.home.abbrev === 'TST' && g.away.abbrev === 'DMO' && g.final === true, 'the clubs and the final come from the header')
ok(g.plays.length === 8, `timeouts are not plays: ${g.plays.length} of 9 rows kept`)
const [ko, run, deep, td, tb, inc, punt, fg] = g.plays
ok(ko.kind === 'kickoff' && run.kind === 'rush' && deep.kind === 'pass' && inc.kind === 'pass' && inc.incomplete && punt.kind === 'punt' && fg.kind === 'fg' && fg.good, 'each kind from ESPN\'s play type')
ok(td.kind === 'pass' && td.td && td.pat === '1', 'a touchdown pass is a PASS with its try (never an "extra point" play)')
ok(run.who === 'R.Runner' && deep.who === 'Am.St. Catch' && deep.qb === 'T.Tester' && fg.who === 'K.Holder' && ko.ret === 'R.Runner' && punt.ret === 'R.Runner', `names: runner ${run.who}, receiver ${deep.who} from ${deep.qb}, kicker ${fg.who}, returners ${ko.ret} / ${punt.ret}`)
ok(g.players[`TST|${shortKey(deep.who)}`]?.jersey === '14' && g.players[`TST|${shortKey(run.who)}`]?.jersey === '22', 'a feed name finds his number in the box score ("Am.St. Catch" -> #14)')
ok(deep.deep && deep.lane === 'R' && run.lane === 'L', 'depth and side from the play\'s own words')
ok(td.clock === 13 * 60 + 50 && td.period === 1, 'the clock at the snap, in seconds left')
ok(downText(run, g) === '1st & 10 · TST 30' && downText(td, g) === '1st & Goal · DMO 7' && downText(inc, g) === '1st & 10 · DMO 35', `down and distance: "${downText(run, g)}", "${downText(td, g)}", "${downText(inc, g)}"`)
ok(playWords(td) === 'TOUCHDOWN · 7 yd · Am.St. Catch' && playWords(fg) === 'FIELD GOAL GOOD · 33 yd · K.Holder' && playWords(inc).startsWith('INCOMPLETE'), `ticker: "${playWords(td)}" / "${playWords(fg)}"`)

// the kicks
const kp = playPath(ko, g), kEnd = ballAt(kp, kp.kickTo)
ok(Math.abs(kEnd.x - 4) < 0.01, `kickoff from DMO 35 for 61 lands at TST 4 (x ${kEnd.x})`)
ok(ballAt(kp, 1).x === 30, 'then the return ends where the feed says')
const tbp = playPath(tb, g)
ok(ballAt(tbp, tbp.kickTo).x > 100, 'a touchback lands in the end zone')
const pp = playPath(punt, g)
ok(Math.abs(ballAt(pp, pp.kickTo).x - 19) < 0.01 && ballAt(pp, 0).x === 79, 'a punt kicks from 14 yards behind the line and lands 46 yards past it')
ok(ballAt(pp, pp.kickTo / 2).h > 30, 'a punt is high in the air at the top of its flight')

// the ball's path through scrimmage plays
for (const p of [run, deep, td]) {
  const path = playPath(p, g)
  ok(ballAt(path, 0).x === p.from && Math.abs(ballAt(path, 1).x - p.to) < 1e-9, `${p.kind} ${p.from} -> ${p.to}: the ball starts and ends on the feed's yard lines`)
}
const dp = playPath(deep, g)
ok(ballAt(dp, (dp.throwAt + dp.keys[2][0]) / 2).h > 15, 'a deep throw is up in the air between the throw and the catch')
ok(ballAt(dp, dp.throwAt).x < deep.from, 'the passer throws from behind the line')

// the timeline and the score bug
const { beats, total } = beatsOf(g.plays)
ok(beats.every((b, i) => i === 0 || b.t >= beats[i - 1].t) && total === beats[beats.length - 1].t + beats[beats.length - 1].dur, 'beats run in order and add up to the total')
ok(beats.some((b) => b.type === 'quarter' && b.i === 5), 'the quarter break sits before the first play of the second quarter')
const tdBeat = beats.find((b) => b.type === 'td'), patBeat = beats.find((b) => b.type === 'pat'), tdPlay = beats.find((b) => b.type === 'play' && b.i === 3)
ok(scoreAt(g.plays, g, tdPlay, 0.5).join('-') === '0-0', 'during the scoring play the bug still shows the score before it')
ok(scoreAt(g.plays, g, tdBeat).join('-') === '0-6', 'on the touchdown\'s hold: the six')
ok(scoreAt(g.plays, g, patBeat, 0.9).join('-') === '0-7', 'the try through: seven')
const fgBeat = beats.find((b) => b.type === 'play' && b.i === 7)
ok(scoreAt(g.plays, g, fgBeat, 0.5).join('-') === '0-7' && scoreAt(g.plays, g, fgBeat, 1).join('-') === '0-10', 'a field goal\'s three land as the kick ends')
const pat = patPlay(td, g)
ok(pat.from === 85 && ballAt(playPath(pat, g), 1).x === 110 && pat.good, 'the try is kicked from the 15 (held at the 22) through the posts on the end line')

console.log(fails ? `\n${fails} FAILED` : '\nall drive replay checks pass')
process.exit(fails ? 1 : 0)
