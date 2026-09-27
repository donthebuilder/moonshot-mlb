#!/usr/bin/env node
// THE CARD VS THE BOOK'S LINE -- the join, on TEST rows (TUDDY depth step 1).
//   node --import ./scripts/_esm-resolve.mjs scripts/odds/check-lines.mjs
import { nflLineRungsFromResults, joinLockLines, overResult } from '../../lib/odds/gradedPicks.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST results file: three REC_YDS rungs (one pending), bar 40, plus a TD rung.
const file = { week: 3, graded_at: '2026-09-29T08:00:00Z', card: { REC_YDS: { bar: 40, rungs: [
  { player_id: 'A', name: 'Test A', team: 'X', actual: 61, hit: true },
  { player_id: 'B', name: 'Test B', team: 'Y', actual: 44, hit: true },
  { player_id: 'C', name: 'Test C', team: 'Z', actual: null, hit: null },
] }, TD: { rungs: [{ player_id: 'T', actual: 1, hit: true }] } } }
const rungs = nflLineRungsFromResults(file)
check(rungs.length === 3 && rungs.every((r) => r.market === 'REC_YDS'), 'non-TD rungs only (TD stays on odds_snap)')
// TEST lock lines: A's 52.5 (he had 61: over); B's 52.5 (44: under, though he cleared OUR bar of 40).
const lines = [
  { our_player_id: 'A', market: 'rec_yds', side: 'over', snap: 'lock', line: 52.5, odds: -115, best_odds: -105, best_book: 'b1', game_date: '2026-09-27' },
  { our_player_id: 'B', market: 'rec_yds', side: 'over', snap: 'lock', line: 52.5, odds: -110, best_odds: -110, best_book: 'b2', game_date: '2026-09-27' },
  { our_player_id: 'B', market: 'rec_yds', side: 'over', snap: 'list', line: 49.5, odds: -110, game_date: '2026-09-27' },
  { our_player_id: 'A', market: 'rec_yds', side: 'over', snap: 'lock', line: 50.5, odds: -110, game_date: '2026-09-10' },
]
const j = joinLockLines(rungs.filter((r) => r.actual != null), lines)
const a = j.find((p) => p.player_id === 'A'); const b = j.find((p) => p.player_id === 'B')
check(a.line === 52.5 && a.result === 'hit' && a.price.median === -115 && a.price.best === -105, 'A: over the book line 52.5 -> hit, lock price -115 (best -105); an older week\'s line is ignored')
check(b.ourResult === 'hit' && b.result === 'miss', 'B: cleared OUR bar (40) but not the BOOK line (52.5) -> the two verdicts stay separate')
check(overResult(52, 52) === 'push' && overResult(null, 52.5) === null, 'a whole-number tie is a push; no stat, no verdict')
const amb = joinLockLines([rungs[0]], [...lines, { ...lines[0], line: 53.5, game_date: '2026-09-28' }])[0]
check(amb.price === null && amb.ambiguous, 'two lock lines in the week -> unpriced, flagged ambiguous')
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
