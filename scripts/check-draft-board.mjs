// #71: the FRANCHISE draft board ranked by dashScore -- the MAX of TUDDY's
// per-market scores for the coming week. Measured against the live slate that
// put Jared Goff 11th overall, a KICKER 15th, and Josh Allen -- the best
// fantasy quarterback in football -- 204th, in a single-QB PPR league.
//
// The fix was to rank by season value instead. This guards the two ways it
// could quietly come back:
//
//   1. the page importing dashScore again, or growing its own copy of it (it
//      had one inline, which is how the fix in scoring.js could have been made
//      without changing the board at all);
//   2. the board head losing the line that says what the number means -- a
//      number whose units changed and whose caption did not is worse than the
//      opaque score it replaced.
//
// It deliberately does NOT re-rank the live slate here. That needs the network
// and would make a check script fail on a bad afternoon rather than on a bad
// commit. The ranking itself was verified against the real feed when shipped;
// the numbers are in claude/franchise-draft-board-season-value-2026-09-03.md.
import fs from 'node:fs'

const BOARD = 'app/fantasy/league/[leagueId]/page.js'
const WIRE = 'app/fantasy/league/[leagueId]/wire/page.js'
let bad = 0
const miss = (m) => { console.log(`MISS ${m}`); bad++ }

const board = fs.readFileSync(BOARD, 'utf8')
if (/function dashScore\s*\(/.test(board)) miss('draft board has its own copy of dashScore again')
// Strip line comments first: the fix is documented in a comment that names
// dashScore, and a checker that cannot tell code from prose fails on its own
// explanation.
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
if (/\bdashScore\b/.test(code(board))) miss('draft board references dashScore -- it must rank by seasonValue')
if (!/seasonValue\(/.test(board)) miss('draft board does not call seasonValue')
if (!/boardNote/.test(board)) miss('draft board head lost the line saying what its number means')
if (!/projectionIsPartial/.test(board)) miss('draft board no longer marks projections the feed cannot complete')

const wire = fs.readFileSync(WIRE, 'utf8')
if (!/boardNote/.test(wire)) miss('the wire lost the line distinguishing its weekly number from the board\'s')

const scoring = fs.readFileSync('lib/fantasy/scoring.js', 'utf8')
if (!/export function seasonValue/.test(scoring)) miss('seasonValue is gone from lib/fantasy/scoring.js')
if (!/export function projectionIsPartial/.test(scoring)) miss('projectionIsPartial is gone from lib/fantasy/scoring.js')

console.log(bad
  ? `\n${bad} problem(s) — the draft board may be ranking by the wrong question again`
  : '\nok   the draft board ranks by season value and says so')
process.exit(bad ? 1 : 0)
