#!/usr/bin/env node
// WHO SCORES ON A GOALIE + THE LAMP SCORE BANDS (2026-10-13). Offline. Every goalie, skater, shot, goal and score below is TEST data made up for the check.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-goalie-giveups.mjs
import { giveUps, chooseGiveUps, leanOf, GIVEUP_FLOOR, lintGiveUps, splitLine, leanText, POS_KEYS } from '../lib/nhl/goalieGiveUps.js'
import { scoreBandsFromRecords, bandsNote, bandsScope, scoreBandsFrom, bandCells, BANDS_MIN_N } from '../lib/record/scoreBands.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const cuts = (pos, side, unk = 0) => ({
  'pos:C': { sa: pos.C * 9, ga: pos.C }, 'pos:W': { sa: pos.W * 9, ga: pos.W }, 'pos:D': { sa: pos.D * 9, ga: pos.D }, 'pos:unk': { sa: unk * 9, ga: unk },
  'side:left': { sa: side[0] * 9, ga: side[0] }, 'side:mid': { sa: side[1] * 9, ga: side[1] }, 'side:right': { sa: side[2] * 9, ga: side[2] },
})
// TEST league: 1000 goals, C 40% W 45% D 15%; left 20% mid 60% right 20%
const LEAGUE = { sa: 10000, ga: 1000, cuts: cuts({ C: 400, W: 450, D: 150 }, [200, 600, 200]) }
const goalie = (id, sa, pos, side, unk = 0) => ({ goalie: id, sa, ga: pos.C + pos.W + pos.D + unk, cuts: cuts(pos, side, unk) })
const ANSWER = {
  available: true, season: 20269999, league: LEAGUE,
  goalies: [
    goalie(1, 400, { C: 10, W: 30, D: 5 }, [8, 27, 10]),      // 45 goals: wings 67% (+22 pts)
    goalie(2, 350, { C: 18, W: 20, D: 7 }, [9, 27, 9]),       // 45 goals: like the league
    goalie(3, 120, { C: 4, W: 7, D: 3 }, [3, 8, 3]),          // 14 goals: listed, not enough
    goalie(4, 90, { C: 5, W: 5, D: 2 }, [3, 6, 3]),           // 90 shots: not listed
    goalie(5, 300, { C: 12, W: 14, D: 4 }, [4, 20, 6], 5),    // 30 known + 5 unknown-position goals = 35
    goalie(6, 300, { C: 12, W: 14, D: 4 }, [4, 20, 6]),       // not on a roster
  ],
}
const NAMES = { 1: 'Test A', 2: 'Test B', 3: 'Test C', 4: 'Test D', 5: 'Test E' }
const who = (id) => (NAMES[id] ? { name: NAMES[id], team: 'TST' } : null)
const v = giveUps(ANSWER, who)

check(v.state === 'ok' && v.season === 20269999, 'an available answer reads ok with its season')
check(v.rows.length === 4, 'four rows: the 90-shot goalie is under the listing floor and the unnamed one is left out')
check(v.unnamed === 1, 'the goalie with no roster name is counted as unnamed, never named by guess')
check(v.rows.map((r) => r.id).join() === '1,2,5,3', 'rows run most goals against first')
const r1 = v.rows[0]
check(Math.abs(r1.pos.W.share - 30 / 45) < 1e-9 && Math.abs(POS_KEYS.reduce((a, k) => a + r1.pos[k].share, 0) - 1) < 1e-9, 'position shares are of the goals with a known position and add to 1')
check(r1.leanPos?.key === 'W' && Math.round(r1.leanPos.pts) === 22, 'the lean is the position furthest above the league (wings +22 points)')
check(leanText(r1.leanPos) === 'W +22', 'the lean prints as "W +22"')
check(v.rows[1].leanPos === null && v.rows[1].leanSide === null, 'a split that looks like the league has no lean')
const r5 = v.rows[2]
check(r5.ga === 35 && Math.abs(r5.pos.C.share - 12 / 30) < 1e-9, 'unknown-position goals are in GA but out of the shares (12 of 30 known)')
const r3 = v.rows[3]
check(r3.enough === false && r3.pos.C.share === null && r3.side.left.share === null && r3.leanPos === null, 'under the goals floor every share is null (a dash), never 0%')
check(r3.ga === 14 && r3.sa === 120, 'a not-enough row still shows its shots and goals')
check(v.league.posKnown === 1 && Math.abs(v.league.pos.C.share - 0.4) < 1e-9 && Math.abs(v.league.side.mid.share - 0.6) < 1e-9, 'the league split is its own shares')
check(v.enough === 3, 'three goalies clear the goals floor')
// a lean needs both the points and the standard-error floor
const tiny = { total: 20, byKey: { C: { share: 0.5 }, W: { share: 0.3 }, D: { share: 0.2 } } }
const lg = { total: 1000, byKey: { C: { share: 0.4 }, W: { share: 0.45 }, D: { share: 0.15 } } }
check(leanOf(tiny, lg, POS_KEYS) === null, '10 points above on 20 goals is inside one standard error of that many goals: no lean')
const big = { total: 400, byKey: { C: { share: 0.46 }, W: { share: 0.4 }, D: { share: 0.14 } } }
check(leanOf(big, lg, POS_KEYS)?.key === 'C', '6 points above on 400 goals clears both floors')
check(leanOf({ total: 400, byKey: { C: { share: 0.42 }, W: { share: 0.43 }, D: { share: 0.15 } } }, lg, POS_KEYS) === null, 'under 5 points never leans, however many goals')
// unavailable (the SQL has not run) hides everything
check(giveUps({ available: false }, who).state === 'unavailable' && giveUps(null, who).rows.length === 0, 'no answer (SQL not run) is unavailable with no rows')
// this season vs the last full one
const cur = giveUps({ ...ANSWER, season: 20279999, goalies: ANSWER.goalies.slice(2, 3) }, who)
const prev = giveUps(ANSWER, who)
const pick = chooseGiveUps(cur, prev)
check(pick.fallback === true && pick.season === 20269999 && pick.current.season === 20279999 && pick.current.enough === 0, 'too few goalies clear the floor this season: last season is shown, named, flagged as a fallback')
const many = giveUps({ ...ANSWER, season: 20279999, goalies: Array.from({ length: 6 }, (_, i) => goalie(10 + i, 300, { C: 12, W: 14, D: 4 }, [4, 20, 6])) }, (id) => ({ name: `T${id}`, team: 'TST' }))
check(chooseGiveUps(many, prev).fallback === false && chooseGiveUps(many, prev).season === 20279999, 'once enough goalies clear it, this season is shown')
check(chooseGiveUps(giveUps(null, who), giveUps(null, who)).state === 'unavailable', 'nothing readable stays unavailable')
check(GIVEUP_FLOOR.goals === 20 && GIVEUP_FLOOR.shots === 100, 'the floors are the printed ones')
check(splitLine(v.league.pos, POS_KEYS) === 'C 40% · W 45% · D 15%', 'the league line prints its shares')
check(lintGiveUps('Test A allows more goals to wings than the league (30 of 45).').length === 0 && lintGiveUps('he will score').length > 0, 'the wording lint passes counts and catches an outcome claim')

// ── score bands ──
const rec = (score, status, result, extra = {}) => ({ score, status, result, game_type: 2, locked_at: '2026-10-01T00:00:00Z', game_date: '2026-10-01', ...extra })
const ROWS = [
  rec(95, 'called', 'hit'), rec(91, 'called', 'miss'), rec(90, 'called', 'hit'), rec(92, 'board', 'miss'), rec(99, 'board', 'hit'),
  rec(89, 'called', 'miss'), rec(85, 'board', 'hit'), rec(84, 'called', 'miss'), rec(80, 'board', 'miss'), rec(79, 'board', 'miss'),
  rec(70, 'off', 'hit'), rec(69, 'off', 'miss'), rec(10, 'off', 'miss'),
  rec(null, 'off', 'hit'),                                         // dressed with no score: in no band, in the total
  rec(95, 'called', 'void'), rec(95, 'called', null),              // void / ungraded: out of every count
  rec(95, 'called', 'hit', { game_type: 1 }), rec(95, 'called', 'hit', { game_type: 3 }),   // preseason / playoffs: out
  rec(95, 'called', 'hit', { locked_at: null }),                   // no lock stamp: out
]
const b = scoreBandsFromRecords(ROWS)
const by = Object.fromEntries(b.bands.map((x) => [x.key, `${x.hits}/${x.n}`]))
check(by['90+'] === '3/5' && by['85-89'] === '1/2' && by['80-84'] === '0/2' && by['70-79'] === '1/2' && by['<70'] === '0/2', `band edges are 90 / 85 / 80 / 70 inclusive and counts are right (${JSON.stringify(by)})`)
const sp = Object.fromEntries(b.split.map((x) => [x.key, `${x.hits}/${x.n}`]))
check(sp.called90 === '2/3' && sp.not90 === '1/2' && sp.calledUnder === '0/2', `CALLED+90+, 90+ not CALLED and CALLED under 90 split the rows (${JSON.stringify(sp)})`)
check(b.split[0].n + b.split[1].n === b.bands[0].n, 'CALLED+90+ and 90+ not CALLED add to the 90+ band')
check(b.all.n === 14 && b.unscored.n === 1 && b.bands.reduce((a, x) => a + x.n, 0) + b.unscored.n === b.all.n, 'bands + the unscored row equal the total; void, ungraded, preseason, playoffs and unlocked rows are out')
check(b.split[0].label === 'CALLED + 90+' && b.split[2].label === 'CALLED under 90', 'the call word is lib/callStatus STATUS_WORD.called')
check(b.bands.every((x) => x.small) && /small sample/i.test(bandsNote(b)) && bandCells(b.bands[0]).small, `every row under ${BANDS_MIN_N} is flagged small sample`)
check(scoreBandsFromRecords([]) === null && scoreBandsFromRecords([rec(95, 'called', 'void')]) === null, 'nothing graded is null')
check(scoreBandsFrom({}) === null && scoreBandsFrom({ scoreBands: b }) === b, 'an older calibration body without bands prints nothing')
check(/Regular season, 1 graded night/.test(bandsScope(b)) && /1 dressed skaters with no score/.test(bandsScope(b)), 'the scope names the window and the unscored count')
check(lintGiveUps(bandsNote(b)).length === 0, 'the bands note passes the wording lint')

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall green')
