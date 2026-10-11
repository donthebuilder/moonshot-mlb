// node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-birthday.mjs
// lib/birthday.js: format, age on a date, birthday week. All dates below are
// TEST data (made-up players' dates), labelled as such; nothing here is a real
// player's record.
import { parseYmd, ageOn, formatBorn, daysToBirthday, isBirthdayToday, isBirthdayWeek, birthdayChip, bornLine } from '../lib/birthday.js'
import { readFileSync } from 'node:fs'

let bad = 0
const eq = (name, got, want) => { if (got !== want) { bad++; console.log(`ERROR ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) } }

// format + age (TEST birth 1998-03-14)
eq('format', formatBorn('1998-03-14'), 'Mar 14, 1998')
eq('format with time text', formatBorn('1998-03-14T00:00:00Z'), 'Mar 14, 1998')
eq('age day before', ageOn('1998-03-14', '2026-03-13'), 27)
eq('age on the day', ageOn('1998-03-14', '2026-03-14'), 28)
eq('born line', bornLine('1998-03-14', '2026-10-10'), 'Born Mar 14, 1998 · age 28')

// today / this week
eq('today', isBirthdayToday('1998-10-10', '2026-10-10'), true)
eq('chip today', birthdayChip('1998-10-10', '2026-10-10'), 'birthday today')
eq('chip tomorrow', birthdayChip('1998-10-11', '2026-10-10'), 'birthday tomorrow')
eq('chip in 6', birthdayChip('1998-10-16', '2026-10-10'), 'birthday in 6 days')
eq('chip in 7 = none', birthdayChip('1998-10-17', '2026-10-10'), null)
eq('yesterday = none', isBirthdayWeek('1998-10-09', '2026-10-10'), false)

// year boundary: Dec 29 -> Jan 2 is 4 days, and the age ticks on Jan 1 rules
eq('year boundary days', daysToBirthday('1999-01-02', '2026-12-29'), 4)
eq('year boundary chip', birthdayChip('1999-01-02', '2026-12-29'), 'birthday in 4 days')
eq('year boundary age before', ageOn('1999-01-02', '2026-12-29'), 27)
eq('year boundary age after', ageOn('1999-01-02', '2027-01-02'), 28)
eq('new year day', ageOn('1999-01-01', '2027-01-01'), 28)

// leap day (TEST birth 2000-02-29): observed Feb 28 in a non-leap year
eq('leap valid', parseYmd('2000-02-29') != null, true)
eq('leap invalid in 2001 as a birth date is still real for 2000', parseYmd('2001-02-29'), null)
eq('leap age before (2027)', ageOn('2000-02-29', '2027-02-27'), 26)
eq('leap age on Feb 28 (2027)', ageOn('2000-02-29', '2027-02-28'), 27)
eq('leap chip on Feb 28 (2027)', birthdayChip('2000-02-29', '2027-02-28'), 'birthday today')
eq('leap days to (2027-02-25)', daysToBirthday('2000-02-29', '2027-02-25'), 3)
eq('leap year itself (2028)', birthdayChip('2000-02-29', '2028-02-29'), 'birthday today')
eq('leap year: Feb 28 is the day before', birthdayChip('2000-02-29', '2028-02-28'), 'birthday tomorrow')
eq('leap after non-leap Dec', daysToBirthday('2000-02-29', '2027-12-31'), 60)

// missing / bad / implausible dates print nothing
for (const v of [null, undefined, '', 'not-a-date', '1998-13-01', '1998-02-30', '98-03-14']) {
  eq(`missing ${v}`, bornLine(v, '2026-10-10'), null)
  eq(`missing chip ${v}`, birthdayChip(v, '2026-10-10'), null)
  eq(`missing format ${v}`, formatBorn(v), null)
}
eq('future date', bornLine('2030-01-01', '2026-10-10'), null)
eq('too old', bornLine('1900-01-01', '2026-10-10'), null)

// no ET/timezone shift: result is the same under any TZ (pure calendar maths)
eq('no tz shift', ageOn('1998-03-14', '2026-03-14'), 28)

// wiring: the four player pages use the helper; no page keeps its own age maths
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
for (const f of ['components/PlayerModal.js', 'components/nfl/NflPlayerModal.js', 'components/lamp/tabs/Player.js', 'components/buckets/tabs/Player.js']) {
  const s = src(f)
  if (!/BirthdayChip|bornLine/.test(s)) { bad++; console.log(`ERROR ${f}: does not use lib/birthday`) }
  if (/function ageOf|new Date\([^)]*birth/i.test(s)) { bad++; console.log(`ERROR ${f}: own age maths`) }
}

if (bad) { console.log(`check-birthday: ${bad} failing`); process.exit(1) }
console.log('check-birthday: ok')
