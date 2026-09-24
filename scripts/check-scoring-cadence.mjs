// isQuietTick (lib/fantasy/scoringCadence.js). TEST DATA only.
import { isQuietTick } from '../lib/fantasy/scoringCadence.js'

let failed = 0
const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) failed += 1 }
const g = (kickoff, status = 'scheduled') => ({ kickoff, status })
const slate = [g('2026-09-25T00:15Z'), g('2026-09-27T17:00Z'), g('2026-09-29T00:15Z')]
const at = (iso) => Date.parse(iso)

ok('Tuesday afternoon, :30 -> quiet', isQuietTick(slate, at('2026-09-22T20:30Z')))
ok('Tuesday afternoon, :00 heartbeat -> runs', !isQuietTick(slate, at('2026-09-22T20:05Z')))
ok('80 min before TNF -> runs (auto-lineup, lock)', !isQuietTick(slate, at('2026-09-24T22:55Z')))
ok('2 h before TNF -> quiet', isQuietTick(slate, at('2026-09-24T22:10Z')))
ok('during a game -> runs', !isQuietTick(slate, at('2026-09-27T19:30Z')))
ok('4 h after kickoff, status still scheduled -> runs', !isQuietTick(slate, at('2026-09-27T21:20Z')))
ok('status in progress, any time -> runs', !isQuietTick([g('2026-09-27T17:00Z', 'in_progress')], at('2026-09-30T12:30Z')))
ok('6 h after the last game, all final -> quiet', isQuietTick([g('2026-09-29T00:15Z', 'final')], at('2026-09-29T06:30Z')))
ok('no games -> runs (unsure means work)', !isQuietTick([], at('2026-09-22T20:30Z')))
ok('bad kickoff -> runs', !isQuietTick([g('nope')], at('2026-09-22T20:30Z')))

if (failed) { console.error(`\n${failed} cadence check(s) failed`); process.exit(1) }
console.log('\nall cadence checks passed')
