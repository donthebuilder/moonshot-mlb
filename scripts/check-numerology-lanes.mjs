#!/usr/bin/env node
// NHL LANE NIGHTS COMPLETE (2026-10-06, ledger audit P0-3). TEST DATA only -- made-up skaters, a made-up game.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-numerology-lanes.mjs
import { boxResults, laneNights, ELIGIBLE } from '../lib/numerology/record.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// TEST game: skaters 1-4 played (2 scored), skater 5 was in the posted lineup but is not on the box (scratched)
const box = {
  awayTeam: { forwards: [{ playerId: 1, goals: 1 }, { playerId: 2, goals: 0 }], defense: [{ playerId: 3, goals: 0 }] },
  homeTeam: { forwards: [{ playerId: 4, goals: 2 }], defense: [] },
}
const logged = ['1', '2', '3', '4', '5']
const res = boxResults(box, logged)
eq('every logged skater is graded', [...res.keys()].sort(), ['1', '2', '3', '4', '5'])
eq('scored = hit, played', [res.get('1'), res.get('4')], [{ played: true, hit: true }, { played: true, hit: true }])
eq('played, no goal = a miss', res.get('2'), { played: true, hit: false })
eq('not on the box = did not dress (void), never a miss', res.get('5'), { played: false, hit: false })
eq('a skater on the box but not logged is still returned (harmless: gradeNight only updates rows that exist)', boxResults(box, []).size, 4)

// log rows as numerology_log holds them: an _eligible row per skater + one matched lane row for skater 1 and 3
const logRows = (graded) => [
  ...['1', '2', '3', '4', '5'].map((id) => ({ player_id: id, lane: ELIGIBLE, value: 'jersey,birth', played: graded ? res.get(id).played : null, hit: graded ? res.get(id).hit : null, graded_at: graded ? '2026-10-06T03:00:00Z' : null })),
  { player_id: '1', lane: 'jersey', value: '9', played: graded ? true : null, hit: graded ? true : null, graded_at: graded ? '2026-10-06T03:00:00Z' : null },
  { player_id: '3', lane: 'jersey', value: '9', played: graded ? true : null, hit: graded ? false : null, graded_at: graded ? '2026-10-06T03:00:00Z' : null },
]
// BEFORE: only the board's rows (skaters 1 and 2) were graded, the rest stayed null
const before = logRows(false).map((r) => (['1', '2'].includes(r.player_id) ? { ...r, played: true, hit: r.player_id === '1', graded_at: '2026-10-06T03:00:00Z' } : r))
const ln0 = laneNights('nhl', '2026-10-06', before).find((l) => l.lane === 'jersey')
eq('BEFORE the fix: the night never completes (graded_at null, no hit counts)', [ln0.graded_at, ln0.eligible_hits, ln0.matched_hits], [null, null, null])
const ln1 = laneNights('nhl', '2026-10-06', logRows(true)).find((l) => l.lane === 'jersey')
eq('AFTER: the night completes -- 4 eligible (the scratch is void, not a miss), skaters 1 and 4 scored; 2 matched, 1 hit', [ln1.eligible, ln1.matched, ln1.eligible_hits, ln1.matched_hits], [4, 2, 2, 1])
eq('AFTER: graded_at is set', Boolean(ln1.graded_at), true)
console.log(fail ? `\n${fail} FAILED` : '\nTEST DATA: all green')
process.exit(fail ? 1 : 0)
