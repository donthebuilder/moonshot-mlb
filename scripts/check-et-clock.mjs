#!/usr/bin/env node
// THE EASTERN CLOCK ACROSS DST (2026-09-27). lib/data.js etHoursSinceNoon /
// easternOffset against the old UTC-16 fold, on an EDT day and an EST day.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-et-clock.mjs
// Exit 1 on any failed check.
import { etHoursSinceNoon, easternOffset, easternDate } from '../lib/data.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const oldFold = (ms) => { const h = new Date(ms).getUTCHours(); return (h < 4 ? h + 24 : h) - 16 }

// EDT: every quarter hour of a September day, the new clock's whole hour is the old value.
let same = true
for (let t = Date.parse('2026-09-27T00:00:00Z'); t < Date.parse('2026-09-28T00:00:00Z'); t += 15 * 60e3) {
  if (Math.floor(etHoursSinceNoon(t)) !== oldFold(t)) { same = false; console.log('  differs at', new Date(t).toISOString(), etHoursSinceNoon(t), oldFold(t)) }
}
check(same, 'EDT (Sep 27): floor(new) === old UTC-16 fold at every quarter hour')

// EST: the real hour, where the old fold was an hour early.
const nov = (iso) => Date.parse(iso)
check(etHoursSinceNoon(nov('2026-11-08T14:00:00Z')) === -3, `Nov 8 14:00Z = 9am EST -> -3 (got ${etHoursSinceNoon(nov('2026-11-08T14:00:00Z'))}; old fold said ${oldFold(nov('2026-11-08T14:00:00Z'))})`)
check(etHoursSinceNoon(nov('2026-11-08T17:00:00Z')) === 0, 'Nov 8 17:00Z = noon EST -> 0')
check(etHoursSinceNoon(nov('2026-11-09T04:30:00Z')) === 11.5, 'Nov 9 04:30Z = 11:30pm EST Nov 8 -> 11.5')
check(etHoursSinceNoon(nov('2026-11-09T05:00:00Z')) === -12, 'Nov 9 05:00Z = midnight EST -> -12')
// the switch itself: Sun Nov 1 2026, 2am EDT -> 1am EST
check(etHoursSinceNoon(nov('2026-11-01T05:30:00Z')) === -10.5 && etHoursSinceNoon(nov('2026-11-01T06:30:00Z')) === -10.5, 'Nov 1: 05:30Z = 1:30am EDT, 06:30Z = 1:30am EST (the repeated hour)')
check(etHoursSinceNoon(nov('2026-11-01T16:00:00Z')) === -1, 'Nov 1 16:00Z = 11am EST -> -1 (old fold: 0)')

// minutes: the two fractional NFL slots
check(etHoursSinceNoon(nov('2026-09-27T15:44:00Z')) < -0.25 && etHoursSinceNoon(nov('2026-09-27T15:45:00Z')) >= -0.25, 'SUN_LONGSHOTS_HOUR -0.25 opens at 11:45am EDT, not noon')
check(etHoursSinceNoon(nov('2026-11-03T16:29:00Z')) < -0.5 && etHoursSinceNoon(nov('2026-11-03T16:30:00Z')) >= -0.5, 'Tuesday 2+ Club -0.5 opens at 11:30am EST (16:30Z)')

// the backfill's 23:59 ET
const seen = (day) => `${day}T23:59:00${easternOffset(Date.parse(`${day}T12:00:00Z`))}`
check(seen('2026-09-26') === '2026-09-26T23:59:00-04:00' && easternDate(Date.parse(seen('2026-09-26'))) === '2026-09-26', `Sep 26 backfill seen_at ${seen('2026-09-26')}`)
check(seen('2026-11-01') === '2026-11-01T23:59:00-05:00' && easternDate(Date.parse(seen('2026-11-01'))) === '2026-11-01', `Nov 1 (switch day) backfill seen_at ${seen('2026-11-01')}`)
check(seen('2027-03-14') === '2027-03-14T23:59:00-04:00', `Mar 14 2027 (spring forward) ${seen('2027-03-14')}`)

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
