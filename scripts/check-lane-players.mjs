// "Tonight's players on these lanes" (lib/numerology/lanePlayers.js), held to the cases it names.
// TEST DATA ONLY -- invented players with invented numbers, never shown on the site.
//   node scripts/check-lane-players.mjs
import './_esm-resolve.mjs'
const { lanePlayers } = await import('../lib/numerology/lanePlayers.js')
const { universal } = await import('../lib/numerology/core.js')
const { MIN_NIGHTS, laneTable } = await import('../lib/numerology/laneTable.js')

const date = '2026-10-07'
const ud = universal(date).day.root
let bad = 0
const ok = (cond, msg) => { if (!cond) { console.log(`FAIL ${msg}`); bad += 1 } }
// a jersey whose root equals the Universal Day: jersey_universal lane
const jerseyOnRoot = ud   // 1-9, its own root
const items = [
  { id: 'T1', name: 'Test One', team: 'AAA', a: { name: 'Test One', jersey: jerseyOnRoot, birthDate: '1995-10-07', next: null, team: 'AAA' }, score: 50 },   // birthday today + jersey lane = 2+ lanes
  { id: 'T2', name: 'Test Two', team: 'BBB', a: { name: 'Test Two', jersey: jerseyOnRoot, birthDate: '1990-01-15', next: null, team: 'BBB' }, score: 90 },  // jersey lane only
  { id: 'T3', name: 'Test Three', team: 'CCC', a: { name: 'Test Three', jersey: 13, birthDate: null, next: null, team: 'CCC' } },                          // Fibonacci jersey only -> left out
  { id: 'T4', name: 'Test Four', team: 'DDD', a: { name: 'Test Four', jersey: null, birthDate: null, next: null, team: 'DDD' } },                            // no fields -> sits out
  { id: 'T5', name: 'Test Five', team: 'EEE', a: null },                                                                                                    // no adapter (a defence row) -> out
  { id: 'T6', name: 'Test Six', team: 'FFF', a: { name: 'Test Six', jersey: jerseyOnRoot, birthDate: '1991-02-02', next: null, team: 'FFF' }, score: 70 },
]
const out = lanePlayers(items, date, { limit: 8 })
ok(out[0]?.id === 'T1' && out[0].n >= 2, `the man on the most lanes leads (got ${out.map((x) => `${x.id}:${x.n}`)})`)
ok(!out.some((x) => x.id === 'T3'), 'a Fibonacci-only man is not "on tonight\'s lane" (those lanes are about the man, not the date)')
ok(!out.some((x) => ['T4', 'T5'].includes(x.id)), 'a man with no numbers, or no adapter, sits out')
const tied = out.filter((x) => x.n === 1).map((x) => x.id)
ok(tied.join() === 'T2,T6', `ties break on the sport's own score, high first (got ${tied})`)
ok(lanePlayers(items, date, { limit: 2 }).length === 2, 'limit caps the list')
ok(lanePlayers(items, null).length === 0, 'no date, no list')
ok(lanePlayers(null, date).length === 0 && lanePlayers([], date).length === 0, 'nothing in, nothing out')
// the provisional gate: laneTable still withholds `shown` under MIN_NIGHTS, and still shows from MIN_NIGHTS
const night = (day) => ({ lane: 'gem_date', day, eligible: 50, matched: 5, eligible_hits: 10, matched_hits: 2, graded_at: '2026-10-01T00:00:00Z' })
const few = laneTable([night('2026-10-01'), night('2026-10-02')])
ok(few.length === 1 && few[0].shown === false && few[0].nights === 2 && few[0].matchedHits === 4, 'under 30 nights: the running counts are there, shown=false (PROVISIONAL)')
const days = Array.from({ length: MIN_NIGHTS }, (_, i) => night(`2026-09-${String(i + 1).padStart(2, '0')}`))
ok(laneTable(days)[0].shown === true, `at ${MIN_NIGHTS} graded nights the lane is shown`)
console.log(bad ? `${bad} problem(s)` : `OK lane players: ranked by lanes then score, Fibonacci/no-number men out, ${MIN_NIGHTS}-night gate intact (TEST data)`)
process.exit(bad ? 1 : 0)
