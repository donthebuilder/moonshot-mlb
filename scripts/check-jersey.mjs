// A JERSEY NUMBER, ONE RULE, CHECKED (2026-10-21, KNOWN-ISSUES #13). lib/jersey.js on TEST values, and the wiring: every ESPN roster reader and
// the shared numerology entry points go through it. TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-jersey.mjs
import fs from 'node:fs'
const { jerseyNumber } = await import('../lib/jersey.js')
const A = await import('../lib/numerology/adapters.js')
let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }

ok(jerseyNumber(727) === null, 'ESPN\'s #727 (the Oct 21 pull): no jersey')
ok(jerseyNumber('727') === null && jerseyNumber(100) === null, 'anything over 99: no jersey')
ok(jerseyNumber(99) === 99 && jerseyNumber('7') === 7 && jerseyNumber(23) === 23, '1..99 read as themselves')
ok(jerseyNumber(0) === 0 && jerseyNumber('00') === 0, '0 and 00 are jerseys (the feeds send both)')
ok([null, undefined, '', ' ', 'abc', '12a', -4, 7.5, '7.5', NaN].every((v) => jerseyNumber(v) === null), 'blank, negative, decimal or text: no jersey')

ok(A.fromNhl({ name: 'Test Skater', jersey: 727 }).jersey === null, 'numerology adapter (NHL): a 727 never becomes a lane')
ok(A.fromNba({ name: 'Test Guard', jersey: '1' }).jersey === 1, 'numerology adapter (NBA): a real number is kept')
ok(A.fromNfl({ name: 'Test End', jersey_number: 150 }).jersey === null, 'numerology adapter (NFL): over 99 dropped')
ok(A.fromMlb({ name: 'Test Hitter', jersey_number: '44' }).jersey === 44, 'numerology adapter (MLB): a real number is kept')

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
for (const [f, re] of [
  ['lib/nba/numerology.js', /jersey: jerseyNumber\(a\.jersey\)/],
  ['lib/nhl/numerology.js', /jerseyNumber\(s\.sweaterNumber\)/],
  ['lib/numerology/allSports.js', /const j = jerseyOf\(jersey\)/],
  ['lib/nba/api.js', /jersey: jerseyNumber\(a\.jersey\) != null \? String\(a\.jersey\)\.trim\(\) : null/],
  ['app/api/buckets/team/route.js', /jersey: jerseyNumber\(a\.jersey\) != null \? String\(a\.jersey\)\.trim\(\) : null/],
]) ok(re.test(read(f)), `${f} reads jerseys through lib/jersey.js`)

console.log(bad ? `${bad}/${n} FAILED` : `check-jersey: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
