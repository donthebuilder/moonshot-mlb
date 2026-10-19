#!/usr/bin/env node
// THE NUMEROLOGY ENGINE (BATCH-NUMEROLOGY steps 1-4c). Offline.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-numerology.mjs
// 1. ZERO DIFFS: the five old copies (pasted below verbatim, as they were
//    on 09-27) vs lib/numerology/core.js over every value and date.
// 2. Gematria, letters, date numbers, universal / personal day and
//    Fibonacci against values worked by hand.
import { digitRoot, dayRootOf, lifePathOf, rootOfDigits, dateNumbers, universal, personal, reduceKeepMaster, isFib, fibNeighbours } from '../lib/numerology/core.js'
import { gematria, cipherValue, nameParts, letters, gematriaValues } from '../lib/numerology/gematria.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── 1. the old copies, verbatim ────────────────────────────────────────────
const OLD = {
  digitRoot: (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0),
  dayRootOf: (birthDate) => { const d = Number(String(birthDate || '').slice(8, 10)); return d > 0 ? OLD.digitRoot(d) : null },
  lifePathOf: (birthDate) => { const digits = String(birthDate || '').replace(/[^0-9]/g, ''); if (digits.length < 8) return null; const sum = digits.split('').reduce((a, c) => a + Number(c), 0); return sum > 0 ? OLD.digitRoot(sum) : null },
  rootOfDigits: (s) => { const d = String(s || '').replace(/[^0-9]/g, ''); const sum = d.split('').reduce((a, c) => a + Number(c), 0); return sum > 0 ? OLD.digitRoot(sum) : null },
}
let diffs = 0; let cases = 0
for (let v = -50; v <= 10000; v++) { cases++; if (OLD.digitRoot(v) !== digitRoot(v)) diffs++ }
for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2030, 11, 31); t += 864e5) {
  const d = new Date(t).toISOString().slice(0, 10)
  for (const [k, f] of [['dayRootOf', dayRootOf], ['lifePathOf', lifePathOf], ['rootOfDigits', rootOfDigits]]) { cases++; if (OLD[k](d) !== f(d)) diffs++ }
}
for (const junk of [null, undefined, '', '1998', '1998-04', 'abc', '0000-00-00', 12345678, '1998-04-26T00:00:00Z']) {
  for (const k of ['dayRootOf', 'lifePathOf', 'rootOfDigits']) { cases++; const nf = { dayRootOf, lifePathOf, rootOfDigits }[k]; if (OLD[k](junk) !== nf(junk)) diffs++ }
}
check(diffs === 0, `old copies vs the engine: ${diffs} diffs over ${cases.toLocaleString()} cases (every value -50..10000, every date 1900-2030, junk inputs)`)

// ── 2. gematria ────────────────────────────────────────────────────────────
check(cipherValue('BASEBALL', 'ordinal') === 54 && cipherValue('BASEBALL', 'fullReduction') === 18, 'BASEBALL: English Ordinal 54, Full Reduction 18 (the plan\'s worked example)')
const judge = gematria('Aaron Judge')
check(judge.first.ordinal.value === 49 && judge.last.ordinal.value === 47 && judge.full.ordinal.value === 96, 'Aaron Judge ordinal: AARON 49, JUDGE 47, full 96 (by hand)')
check(judge.full.fullReduction.value === 42 && judge.full.reverseOrdinal.value === 174 && judge.full.reverseReduction.value === 57, 'Aaron Judge: Full Reduction 42, Reverse Ordinal 174, Reverse Full Reduction 57 (by hand)')
check(judge.full.ordinal.root === 6, 'each value carries its digit root (96 -> 6)')
check(JSON.stringify(nameParts('Pete Crow-Armstrong')) === JSON.stringify({ full: 'PETECROWARMSTRONG', first: 'PETE', last: 'CROWARMSTRONG' }), 'Crow-Armstrong = CROWARMSTRONG (hyphen stripped)')
check(nameParts('Vladimir Guerrero Jr.').last === 'GUERRERO' && nameParts('Ronald Acuña Jr.').last === 'ACUNA', '"Jr." dropped, accents folded (Acuña -> ACUNA)')
check(gematriaValues('Aaron Judge').length === 12, '3 names x 4 ciphers = 12 values per player')
check(gematria('Aaron Judge', { withSumerian: true }).full.sumerian.value === 96 * 6, 'Sumerian (off by default) = ordinal x 6')
const L = letters('Pete Crow-Armstrong')
check(L.initials === 'PC' && L.sum === 16 + 3 && L.firstLetter === 'P' && L.letters === 17, `letters: initials PC (sum 19), first letter P, 17 letters`)

// ── 3. tonight's numbers ───────────────────────────────────────────────────
const dn = dateNumbers('2026-09-29')
check(dn.full === 48 && dn.short === 64 && dn.md === 38 && dn.root === 3 && dn.dayOfYear === 272 && dn.daysLeft === 93, `9/29/2026: full 48, short 64, md 38, root 3, day 272, 93 left`)
const u = universal('2026-09-29')
check(u.year.value === 1 && u.month.value === 1 && u.day.value === 3, 'universal year 1 (2026 -> 10 -> 1), month 1 (9+1), day 3 (9/29/2026 -> 30 -> 3)')
check(reduceKeepMaster(29).value === 11 && reduceKeepMaster(29).root === 2 && reduceKeepMaster(38).value === 11, 'master numbers kept: 29 -> 11 (root 2), 38 -> 11')
// three real birthdays, by hand, on 2026-09-29
const pj = personal('1992-04-26', '2026-09-29')   // Aaron Judge: 4 + (2+6) + (2+0+2+6) = 22 master; 4+9 = 13 -> 4; 4+29 = 33 master
check(pj.year.value === 22 && pj.month.root === 4 && pj.day.value === 33 && pj.day.root === 6, 'Aaron Judge (1992-04-26): personal year 22, month 4, day 33 (root 6)')
check(lifePathOf('1992-04-26') === 6, 'Judge life path: 1+9+9+2+0+4+2+6 = 33 -> 6 (matching uses the root)')
const po = personal('1994-07-05', '2026-09-29')   // Shohei Ohtani: 7 + 5 + 10 = 22; 4 + 9 = 13 -> 4; 4 + 29 = 33
check(po.year.value === 22 && po.day.value === 33, 'Shohei Ohtani (1994-07-05): personal year 22, day 33')
const pm = personal('1997-01-13', '2026-09-29')   // Connor McDavid: 1 + (1+3) + 10 = 15 -> 6; 6 + 9 = 15 -> 6; 6 + 29 = 35 -> 8
check(pm.year.root === 6 && pm.month.root === 6 && pm.day.root === 8, 'Connor McDavid (1997-01-13): personal year 6, month 6, day 8')

// ── 4. Fibonacci ───────────────────────────────────────────────────────────
const FIB = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]
const wrong = []
for (let n = 0; n <= 987; n++) if (isFib(n) !== FIB.includes(n)) wrong.push(n)
check(!wrong.length, `isFib agrees with the sequence for every n 0..987${wrong.length ? ` (wrong: ${wrong.slice(0, 5)})` : ''}`)
check(fibNeighbours(21, 34) && fibNeighbours(55, 34) && !fibNeighbours(21, 55) && !fibNeighbours(22, 34), 'fib pairs: 21 & 34, 34 & 55 yes; 21 & 55, 22 & 34 no')
check(!isFib(64) && !isFib(38) && isFib(144), 'date numbers 64 / 38 are not Fibonacci; 144 is')

// ── 5. the lanes (step 5) ──────────────────────────────────────────────────
const { matchLanes, eligibleLanes, ageOn } = await import('../lib/numerology/lanes.js')
const { fromNfl } = await import('../lib/numerology/adapters.js')
const has = (p, date, key) => matchLanes(p, { date }).filter((m) => m.lane === key)
check(has({ name: 'Aaron Judge' }, '2026-09-12', 'gem_date').some((m) => /last name = 47 in English Ordinal; tonight's short date number is 47/.test(m.text)), '9/12/26 short = 9+12+26 = 47 = JUDGE (English Ordinal) -> gem_date')
check(has({ name: 'Aaron Judge', jersey: 49 }, '2026-09-29', 'gem_jersey').some((m) => /first name = 49/.test(m.text)) && !has({ name: 'Aaron Judge', jersey: 99 }, '2026-09-29', 'gem_jersey').length, 'AARON = 49 = jersey #49 -> gem_jersey; #99 -> none')
check(has({ name: 'Aaron Judge' }, '2026-04-06', 'letters_date').length === 1, '"Aaron Judge" has 10 letters = 4/6 month+day 10 -> letters_date')
check(has({ jersey: 21 }, '2026-09-29', 'fib_jersey').length === 1 && !has({ jersey: 22 }, '2026-09-29', 'fib_jersey').length, 'jersey 21 Fibonacci, 22 not')
check(has({ next: 34 }, '2026-09-29', 'fib_next').length === 1, 'next #34 is Fibonacci')
check(has({ birthDate: '1992-09-27' }, '2026-09-29', 'birthday_week').length === 1 && !has({ birthDate: '1992-10-05' }, '2026-09-29', 'birthday_week').length && ageOn('1992-09-27', '2026-09-29') === 34, 'birthday 2 days ago -> birthday week (age 34); 6 days away -> none')
check(has({ jersey: 12 }, '2026-09-29', 'jersey_universal').length === 1 && !has({ jersey: 13 }, '2026-09-29', 'jersey_universal').length, '#12 -> 3 = Universal Day 3 (9/29/26); #13 -> 4 no')
check(!matchLanes({ name: 'Aaron Judge' }, { date: '2026-09-29' }).some((m) => m.lane.startsWith('fib_jersey') || m.lane === 'jersey_universal'), 'a missing jersey sits those lanes out (never a 0)')
check(fromNfl({ position: 'DEF', player_id: 'DEF-CHI', name: 'Bears D/ST' }) === null && fromNfl({ position: 'WR', name: 'DJ Moore', jersey_number: 2, season_td: 1 }).next === 2, 'a DEF row is not a name (null); a real player adapts (next = season TD + 1)')
check(eligibleLanes({ name: 'X' }).includes('gem_date') && !eligibleLanes({ name: 'X' }).includes('gem_jersey'), 'eligible lanes follow the fields he has (the denominator)')
// live, read-only: this week's TUDDY players through the lanes
const week = await fetch('https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current/nfl_week.json').then((r) => r.json()).catch(() => null)
if (week) {
  const date = '2026-09-28'
  const players = (week.players || []).map(fromNfl).filter(Boolean)
  const counts = {}
  for (const p of players) for (const m of matchLanes(p, { date })) counts[m.lane] = (counts[m.lane] || 0) + 1
  console.log(`   live, nfl_week (${players.length} players, ${date}):`, JSON.stringify(counts))
}

// ── 6. the record (step 6): rows, the denominator, the lane summary ────────
const { buildRows, laneNights, ELIGIBLE } = await import('../lib/numerology/record.js')
const TEST = [
  { player_id: 'T1', name: 'Aaron Judge', jersey: 49, birthDate: '1992-04-26', next: 34, team: 'NYY', opp: 'BOS' },
  { player_id: 'T2', name: 'Bob Test', jersey: 22, birthDate: null, next: 5, team: 'BOS', opp: 'NYY' },
  { player_id: 'T3', name: '', jersey: null, birthDate: null, next: null },                         // nothing to check -> no rows
]
const built = buildRows('mlb', '2026-09-12', TEST)
const t1 = built.filter((r) => r.player_id === 'T1')
check(built.filter((r) => r.lane === ELIGIBLE).length === 2 && !built.some((r) => r.player_id === 'T3'), 'one _eligible row per checkable player; a player with no fields writes nothing')
check(t1.some((r) => r.lane === 'gem_jersey') && t1.some((r) => r.lane === 'fib_next') && t1.some((r) => r.lane === 'gem_date' && r.matched_to === 'date short 47'), 'T1 (TEST): gem_jersey, fib_next, gem_date short 47 recorded')
check(new Set(built.map((r) => `${r.player_id}|${r.lane}|${r.matched_to}`)).size === built.length, 'no duplicate keys (a lane matching the same target twice is one row)')
// simulate grading: T1 hits, T2 does not
const graded = built.map((r) => ({ ...r, graded_at: '2026-09-13T06:00:00Z', played: true, hit: r.player_id === 'T1' }))
const sum = laneNights('mlb', '2026-09-12', graded)
const fibNext = sum.find((x) => x.lane === 'fib_next'); const gemJersey = sum.find((x) => x.lane === 'gem_jersey')
check(fibNext.eligible === 2 && fibNext.matched === 2 && fibNext.eligible_hits === 1 && fibNext.matched_hits === 1, `fib_next: eligible 2 (both have next), matched 2 (34, 5), hits 1 / 1`)
check(gemJersey.eligible === 2 && gemJersey.matched === 1 && gemJersey.matched_hits === 1 && gemJersey.eligible_hits === 1, 'gem_jersey: eligible 2, matched 1 (T1), matched hits 1')
check(laneNights('mlb', '2026-09-12', built).every((x) => x.eligible_hits === null && x.graded_at === null), 'ungraded night -> no hit counts, no graded_at (a base rate is never guessed)')
if (week) {
  const players = (week.players || []).map((p) => { const a = fromNfl(p); return a ? { player_id: p.player_id, ...a } : null }).filter(Boolean)
  const rows = buildRows('nfl', '2026-09-28', players)
  console.log(`   live dry run (nothing written): ${players.length} NFL players -> ${rows.length} rows (${rows.filter((r) => r.lane === ELIGIBLE).length} _eligible)`)
}

// ── 7. which lanes run hot (the reader) ────────────────────────────────────
const { laneTable } = await import('../lib/numerology/laneTable.js')
const nights = (n, lane, e, m, eh, mh) => Array.from({ length: n }, (_, i) => ({ lane, day: `2026-10-${String(i + 1).padStart(2, '0')}`, eligible: e, matched: m, eligible_hits: eh, matched_hits: mh, graded_at: 'x' }))
const lt = laneTable([...nights(30, 'fib_next', 100, 20, 10, 2), ...nights(29, 'gem_date', 100, 30, 10, 6), { lane: 'gem_jersey', day: '2026-10-01', eligible: 5, matched: 1, eligible_hits: null, matched_hits: null, graded_at: null }])
const fn = lt.find((l) => l.lane === 'fib_next'); const gd = lt.find((l) => l.lane === 'gem_date')
check(fn.shown && fn.nights === 30 && Math.abs(fn.matchedRate - 0.1) < 1e-9 && Math.abs(fn.baseRate - 0.1) < 1e-9 && Math.abs(fn.z) < 1e-9, 'a lane at 30 graded nights shows; matched 10% vs everyone 10% -> z 0')
check(!gd.shown && gd.needs === 1 && gd.z > 2, 'a lane at 29 nights is hidden (needs 1 more) even with z > 2 -- no early claims')
check(!lt.some((l) => l.lane === 'gem_jersey'), 'ungraded nights never count')

// ── 8. hot numbers (step 6b) ───────────────────────────────────────────────
const { numbersNight, hottest } = await import('../lib/numerology/hotNumbers.js')
const roster = [
  { player_id: 'a', name: 'Aaron Judge', jersey: 3 }, { player_id: 'b', name: 'Bob Test', jersey: 3 }, { player_id: 'c', name: 'Cal Test', jersey: 3 },
  { player_id: 'd', name: 'Dan Test', jersey: 7 }, { player_id: 'e', name: 'Eli Test', jersey: 7 }, { player_id: 'f', name: 'Fay Test', jersey: 9 },
]
const hn = numbersNight(roster, new Set(['a', 'b', 'c']), '2026-09-29')
const j3 = hn.rows.find((r) => r.kind === 'jersey' && r.value === '3')
check(hn.events === 3 && j3.events === 3 && j3.players === 3 && j3.expected === 1.5, 'jersey 3: 3 of 3 events vs 1.5 expected (half the pool wears it)')
check(hottest(hn.rows, 3)[0].kind === 'jersey' && hottest(hn.rows, 3).every((r) => r.events >= 2 && r.events > r.expected), 'hottest: events above chance, 2+ events only')
check(!hn.rows.some((r) => r.kind === 'life_path'), 'no birth dates -> the life path / personal day kinds sit out')
check(numbersNight(roster, new Set(['a', 'a']), '2026-09-29').events === 1, 'a player counts once per night (who, not how many)')

// ── 9. the posts (step 7): the 🔢 gematria line and the Moment's GEMATRIA tier ──
// Worked by hand: AARON JUDGE in Full Reduction = (1+1+9+6+5) + (1+3+4+7+5) = 42.
// 9/23/2026 full = 9+23+2+0+2+6 = 42. Ordinal 96, Reverse Ordinal 174 (no hit).
const { fullNameEquals, dateWritten, dateGematriaLine } = await import('../lib/numerology/gematria.js')
check(fullNameEquals('Aaron Judge', 42)?.cipher === 'fullReduction' && fullNameEquals('Aaron Judge', 96)?.cipher === 'ordinal' && fullNameEquals('Aaron Judge', 43) === null, 'Aaron Judge: 42 Full Reduction, 96 Ordinal, 43 nothing')
check(dateWritten('2026-09-29')?.full === '9/29/2026' && dateWritten('2026-09-29')?.short === '9/29/26' && dateWritten('9/29') === null, 'date written as 9/29/2026 and 9/29/26')
check(dateGematriaLine('Aaron Judge', '2026-09-23') === '🔢 His name = 42 in Full Reduction. Tonight is 9/23/2026 = 42', 'the date line, exact text')
check(dateGematriaLine('Aaron Judge', '2026-09-24') === null && dateGematriaLine('', '2026-09-23') === null && dateGematriaLine('Aaron Judge', '') === null, 'no match / no name / no date -> no line')
const { gematriaHook, hooksFor, numerologyMoment, numerologyText } = await import('../lib/dash/homerFeed.js')
check(gematriaHook('Aaron Judge', { day: '2026-09-24', nth: 96 }) === '🔢 HR #96, and his name = 96 in English Ordinal', 'HR number = his name')
check(gematriaHook('Aaron Judge', { day: '2026-09-24', jersey: 42 })?.includes('same as his jersey, #42'), 'jersey = his name')
check(gematriaHook('Aaron Judge', { day: '2026-09-23', nth: 96 })?.includes('Tonight is'), 'the date match comes first')
// hooksFor: one 🔢 line max. TEST ROW (not a real homer): jersey 97, HR #43 share root 7 AND his name = the date.
const testEv = { player_id: 'test-1', name: 'Aaron Judge', hr_n: 1, stats: { season_hr: 42, postseason: false } }
const hk = hooksFor(testEv, { day: '2026-09-23', jersey: 97, history: [] })
check(hk.filter((h) => h.startsWith('🔢')).length === 1 && hk.some((h) => h.includes('Tonight is 9/23/2026 = 42')), 'hooksFor: the gematria line wins, still one 🔢 line')
const hk2 = hooksFor(testEv, { day: '2026-09-24', jersey: 97, history: [] })
check(hk2.filter((h) => h.startsWith('🔢')).length === 1 && hk2.some((h) => h.includes('same digit root')), 'no gematria hit -> the digit-root line as before')
// The Moment. TEST ROWS (not real homers).
const mRow = (id, name, jersey, season_hr, extra = {}) => ({ player_id: id, name, team: 'TST', hr_n: 1, stats: { jersey, season_hr, birthDate: '1990-01-05', postseason: false, ...extra } })
const { gematriaBar } = await import('../lib/dash/homerFeed.js')
check(gematriaBar(30) === 6 && gematriaBar(5) === 2 && gematriaBar(2) === 2, `the bar: 6 of 30 hitters, 2 of 5, 2 of 2 (got ${gematriaBar(30)}, ${gematriaBar(5)}, ${gematriaBar(2)})`)
// Aaron Judge = 42 (Full Reduction) = 9/23/2026. "Bob Test" (20 / 83 / 106 / 43) matches nothing that night.
const gm = numerologyMoment([mRow('t1', 'Aaron Judge', 10, 20), mRow('t2', 'Bob Test', 11, 30)], { day: '2026-09-23' })
check(gm === null || gm.tier !== 'gematria', 'Moment: one matching hitter of 2 is below the bar (2)')
// Two of three TEST hitters match (the same name under two test ids).
const gm2 = numerologyMoment([mRow('t1', 'Aaron Judge', 10, 20), mRow('t3', 'Aaron Judge', 12, 21), mRow('t2', 'Bob Test', 11, 30)], { day: '2026-09-23' })
check(gm2?.tier === 'gematria' && gm2.players.length === 2 && gm2.players[0].gem.value === 42, 'Moment: 2 of 3 hitters on the date number -> GEMATRIA')
check(numerologyText(gm2).includes('Tonight is 9/23/2026 = 42.') && numerologyText(gm2).includes('Full Reduction: Judge 42 · Judge 42'), 'Moment text: the date, then one line per cipher with last names')
check(numerologyMoment([mRow('t1', 'Aaron Judge', 10, 20), mRow('t3', 'Aaron Judge', 12, 21), mRow('t2', 'Bob Test', 11, 30)])?.tier !== 'gematria', 'Moment: no day -> no GEMATRIA tier')
const tri = numerologyMoment([mRow('t1', 'Aaron Judge', 5, 13), mRow('t3', 'Aaron Judge', 12, 21), mRow('t2', 'Bob Test', 11, 30)], { day: '2026-09-23' })
check(tri?.tier === 'trifecta', 'TRIFECTA still outranks GEMATRIA (jersey 5, HR #14, born the 5th)')
const oct = numerologyMoment([mRow('t1', 'Aaron Judge', 10, 20, { postseason: true }), mRow('t3', 'Aaron Judge', 12, 21, { postseason: true })], { day: '2026-09-23' })
check(oct?.tier === 'gematria', 'October (no season number): GEMATRIA still runs')
// TD / goal posts. TEST ROWS.
const { tdPostText } = await import('../lib/nfl/tdFeed.js')
const td = tdPostText({ day: '2026-09-23', scorerName: 'Aaron Judge', team: 'TST', opponent: 'OPP' })
check(td.includes('🔢 His name = 42 in Full Reduction. Today is 9/23/2026 = 42') && td.length <= 280, 'TD post: the date line, under the limit')
check(!tdPostText({ day: '2026-09-23', scorerName: 'Aaron Judge', position: 'DEF', team: 'TST' }).includes('🔢'), 'TD post: a team defense row never gets a name line')
const { postText: goalPost } = await import('../lib/nhl/goalFeed.js')
check(goalPost({ day: '2026-09-23', name: 'Aaron Judge', strength: 'ev', period: 1 }).includes('🔢 His name = 42'), 'goal post: the date line')
check(!goalPost({ day: '2026-09-24', name: 'Aaron Judge', strength: 'ev', period: 1 }).includes('🔢'), 'goal post: no match, no line')


// ── 10. CIPHER LANES (2026-10-10) -- TEST data; known words by hand ──────────
// A=1 ordinal / 26 reverse ordinal / 1 full reduction / 8 reverse reduction; Z=26 / 1 / 8 / 1.
const { LANES: ALL_LANES, LANE_CIPHERS, matchLanes: ml, eligibleLanes: el, displayLanes, LANE_SHORT } = await import('../lib/numerology/lanes.js')
const fsm = await import('node:fs')
check(cipherValue('A', 'ordinal') === 1 && cipherValue('A', 'reverseOrdinal') === 26 && cipherValue('A', 'fullReduction') === 1 && cipherValue('A', 'reverseReduction') === 8, 'A: ordinal 1, reverse ordinal 26, full reduction 1, reverse reduction 8')
check(cipherValue('Z', 'ordinal') === 26 && cipherValue('Z', 'reverseOrdinal') === 1 && cipherValue('Z', 'fullReduction') === 8 && cipherValue('Z', 'reverseReduction') === 1, 'Z: ordinal 26, reverse ordinal 1, full reduction 8, reverse reduction 1')
check(cipherValue('ZA', 'reverseReduction') === 9 && cipherValue('ZA', 'reverseOrdinal') === 27 && cipherValue('ZA', 'ordinal') === 27, 'ZA: 27 ordinal, 27 reverse ordinal, 9 reverse reduction')
const pca = gematria('Pete Crow-Armstrong').full; const vg = gematria('Vladimir Guerrero Jr.').full
check(pca.reverseOrdinal.value === 17 * 27 - pca.ordinal.value, 'hyphen stripped: reverse ordinal = 27 x letters - ordinal (17 letters)')
check(vg.reverseOrdinal.value === 16 * 27 - vg.ordinal.value && gematria('Vladimir Guerrero Jr.').last.ordinal.value === cipherValue('GUERRERO', 'ordinal'), 'suffix dropped: Jr. adds nothing in any cipher (16 letters)')
check(LANE_CIPHERS.join() === 'ordinal,fullReduction,reverseOrdinal,reverseReduction' && !ALL_LANES.some((l) => /sumerian/i.test(l.key + l.label)), 'four ciphers get lanes; Sumerian (off by default) gets none')
const FAM = ['gem_date', 'gem_jersey', 'gem_next', 'fib_name']
check(ALL_LANES.length === 30, `lane count 30 (14 before + 4 families x 4 ciphers = 16 new); got ${ALL_LANES.length}`)
check(new Set(ALL_LANES.map((l) => l.key)).size === ALL_LANES.length, 'lane keys are unique')
const WORD = { ordinal: 'ordinal', fullReduction: 'full reduction', reverseOrdinal: 'reverse ordinal', reverseReduction: 'reverse reduction' }
let shapeOk = true; let labelOk = true
for (const f of FAM) {
  const any = ALL_LANES.find((l) => l.key === f)
  if (!any || !/ · any cipher$/.test(any.label)) labelOk = false
  for (const c of LANE_CIPHERS) {
    const l = ALL_LANES.find((x) => x.key === `${f}_${c}`)
    if (!l || l.group !== any.group || JSON.stringify(l.needs) !== JSON.stringify(any.needs) || l.family !== f || l.cipher !== c) shapeOk = false
    if (!l || !l.label.endsWith(` · ${WORD[c]}`) || !l.label.startsWith(any.label.replace(/ · any cipher$/, ''))) labelOk = false
  }
}
check(shapeOk, 'each cipher lane has the same group and needs as its sibling (and its family + cipher)')
check(labelOk, 'labels name the cipher ("... · ordinal" / "· reverse ordinal" / "· reverse reduction" / "· full reduction"); the old lane says "· any cipher"')
check(ALL_LANES.find((l) => l.key === 'gem_date_ordinal').label === "Name = tonight's date · ordinal" && ALL_LANES.find((l) => l.key === 'gem_date_reverseReduction').group === 'NAMES & LETTERS', 'exact label + group of the first new lanes')
check(FAM.every((f) => LANE_CIPHERS.every((c) => LANE_SHORT[`${f}_${c}`])) && new Set(Object.values(LANE_SHORT)).size === Object.values(LANE_SHORT).length, 'every cipher lane has its own short tag, all tags distinct')
// each cipher lane fires exactly when ITS cipher matches. TEST name "Aaron Judge": ordinal 96 / full red 42 / rev ord 174 / rev red 57.
const J = { name: 'Aaron Judge', jersey: 49, next: 34 }
const only = (p, date, key) => ml(p, { date }).filter((m) => m.lane === key)
check(only(J, '2026-09-23', 'gem_date_fullReduction').length === 1 && !only(J, '2026-09-23', 'gem_date_ordinal').length && !only(J, '2026-09-23', 'gem_date_reverseOrdinal').length && only(J, '2026-09-23', 'gem_date').length >= 1, '9/23/2026 = 42: the full-reduction lane fires, ordinal and reverse ordinal do not, the any-cipher lane fires with it')
check(only(J, '2026-09-23', 'gem_date_fullReduction')[0].matchedTo === only(J, '2026-09-23', 'gem_date')[0].matchedTo && /full name = 42 in Full Reduction/.test(only(J, '2026-09-23', 'gem_date_fullReduction')[0].text), 'a cipher lane records the same matched_to key and text shape as its sibling')
check(only({ name: 'Aaron Judge', jersey: 49 }, '2026-09-29', 'gem_jersey_ordinal').length === 1 && !only({ name: 'Aaron Judge', jersey: 49 }, '2026-09-29', 'gem_jersey_reverseOrdinal').length, 'AARON = 49 ordinal -> jersey #49 only in the ordinal lane')
check(only({ name: 'Aaron Judge', next: 57 }, '2026-09-29', 'gem_next_reverseReduction').length === 1 && !only({ name: 'Aaron Judge', next: 57 }, '2026-09-29', 'gem_next_fullReduction').length, 'full name = 57 reverse reduction -> next #57 only in that lane')
check(!ml({ name: 'Aaron Judge' }, { date: '2026-09-29' }).some((m) => m.lane.startsWith('fib_name')), 'fib_name: 96 / 42 / 174 / 57 are not Fibonacci, no lane fires')
// ZZZK = 26+26+26+11 = 89 in ordinal (Fibonacci)
check(only({ name: 'Zzzk' }, '2026-09-29', 'fib_name_ordinal').length === 1 && only({ name: 'Zzzk' }, '2026-09-29', 'fib_name').length >= 1 && !only({ name: 'Zzzk' }, '2026-09-29', 'fib_name_fullReduction').length, 'ZZZK = 89 ordinal (Fibonacci): the ordinal lane and the any-cipher lane fire, full reduction does not')
// the any-cipher lane is exactly the union of its cipher lanes (same rows, same hit rule)
let union = true
for (const nameX of ['Aaron Judge', 'Zzzk', 'Pete Crow-Armstrong', 'Vladimir Guerrero Jr.']) for (const date of ['2026-09-12', '2026-09-23', '2026-09-29', '2026-04-06']) for (const jersey of [49, 42, 47, 96, 89]) for (const f of FAM) {
  const p = { name: nameX, jersey, next: jersey }
  const a = new Set(ml(p, { date }).filter((m) => m.lane === f).map((m) => `${m.matchedTo}|${m.value}`))
  const u = new Set(LANE_CIPHERS.flatMap((c) => ml(p, { date }).filter((m) => m.lane === `${f}_${c}`).map((m) => `${m.matchedTo}|${m.value}`)))
  if (a.size !== u.size || [...a].some((k) => !u.has(k))) union = false
}
check(union, 'the any-cipher lane equals the union of its four cipher lanes (names x dates x numbers)')
check(el({ name: 'X' }).includes('gem_date_ordinal') && el({ name: 'X' }).includes('fib_name_reverseReduction') && !el({ name: 'X' }).includes('gem_jersey_ordinal') && el({ name: 'X', jersey: 3 }).includes('gem_jersey_reverseOrdinal'), 'eligible lanes follow the fields (the denominator): a cipher lane needs what its sibling needs')
// recording + grading are the existing path: new lane keys flow through buildRows / laneNights unchanged
const rowsT = buildRows('nhl', '2026-09-23', [{ player_id: 'T9', name: 'Aaron Judge', jersey: 49, birthDate: null, next: 34, team: 'TST', opp: 'OPP' }])
check(rowsT.some((r) => r.lane === 'gem_date_fullReduction' && r.matched_to === 'date full 42'), 'buildRows records the new lane with the sibling\'s key shape')
check(rowsT.find((r) => r.lane === ELIGIBLE).value.split(',').includes('gem_date_reverseReduction'), 'the _eligible row lists the new lanes (their own denominator)')
const gradedT = rowsT.map((r) => ({ ...r, graded_at: 'x', played: true, hit: true }))
const nightsT = laneNights('nhl', '2026-09-23', gradedT).find((x) => x.lane === 'gem_date_fullReduction')
check(nightsT.eligible === 1 && nightsT.matched === 1 && nightsT.matched_hits === 1 && nightsT.eligible_hits === 1, 'grading is unchanged: same eligible / matched / hit counts for a cipher lane')
// displayLanes: the any-cipher sibling steps aside when a cipher lane matched
const dm = displayLanes(ml(J, { date: '2026-09-23' }))
check(!dm.some((m) => m.lane === 'gem_date') && dm.some((m) => m.lane === 'gem_date_fullReduction') && ml(J, { date: '2026-09-23' }).some((m) => m.lane === 'gem_date'), 'a surface listing matches shows the cipher, not both; the record keeps both')
const { lanePlayers } = await import('../lib/numerology/lanePlayers.js')
const lpl = lanePlayers([{ id: '1', name: 'Aaron Judge', team: 'NYY', a: { name: 'Aaron Judge', jersey: null, birthDate: null, next: null } }], '2026-09-23')
check(lpl.length === 1 && lpl[0].n === 1 && lpl[0].labels.length === 2 && lpl[0].fullLabels.every((x) => !/any cipher/.test(x)) && lpl[0].fullLabels.some((x) => /full reduction/i.test(x)), 'tonight\'s players on the lanes: two ciphers of one family count as ONE lane, listed under the ciphers (never any-cipher)')

// ── 11. the sample floor, the ranges, the multiple-lanes note, the disclosure ──
const { MIN_MATCHED: MM, multiLaneNote, allLanesBase } = await import('../lib/numerology/laneTable.js')
const fresh = laneTable(nights(6, 'gem_date_ordinal', 100, 4, 15, 1))
check(fresh[0].shown === false && fresh[0].nights === 6 && fresh[0].matched === 24 && fresh[0].range?.length === 2 && fresh[0].baseRange?.length === 2, 'a new cipher lane with 6 nights / 24 matches is TRACKING (not shown) and still carries its n and Wilson ranges')
check(laneTable(nights(40, 'gem_next_reverseOrdinal', 100, 0.5, 15, 0))[0].shown === false && MM === 30, '40 nights but under 30 graded matches stays tracking (the floor is 30 nights AND 30 matches)')
check(laneTable(nights(30, 'gem_date_ordinal', 100, 1, 15, 0))[0].shown === true && laneTable(nights(29, 'gem_date_ordinal', 100, 2, 15, 0))[0].shown === false, '30 nights x 30 matches shows; 29 nights does not')
const ab = allLanesBase([...nights(2, 'a', 100, 5, 10, 1), ...nights(2, 'b', 100, 5, 20, 1), { lane: 'c', day: 'd', eligible: 9, matched: 0, eligible_hits: null, matched_hits: null, graded_at: null }])
check(ab.n === 400 && ab.hits === 60 && Math.abs(ab.rate - 0.15) < 1e-9 && ab.range.length === 2, 'all-lanes base rate pools graded eligible rows only (60/400 = 15%)')
const note = multiLaneNote(29)
// the copy diet (10-17) shortened the note on purpose; the check follows the shipped words
check(note === '29 lanes tested: some look hot by chance. Each shows its own n and the base rate.', 'the multiple-lanes note, exact')
const SRC = (f) => fsm.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const ltSrc = SRC('components/numerology/LaneTable.js')
check(/multiLaneNote\(/.test(ltSrc) && /never a call/.test(ltSrc) && /never part of a score/i.test(ltSrc) && /tracking/.test(ltSrc) && /rng\(l\.range\)/.test(ltSrc) && /allBase/.test(ltSrc), 'LaneTable renders the note, the disclosure, "tracking", n + Wilson range and the all-lanes base rate')
check(['components/lamp/tabs/Numerology.js', 'components/nfl/tabs/Numerology.js', 'components/Alignments.js'].every((f) => /LaneTable/.test(SRC(f))), 'MLB, NFL and NHL Numerology tabs all draw LaneTable (one table, every sport)')
const words = [note, ...ALL_LANES.map((l) => l.label), ltSrc].join(' ')
check(!/\bdue\b|winner|\bwill hit\b|\bguarantee/i.test(words) && !/\d%\s*(chance|probability)/i.test(note), 'no "due", no "winner", no printed probability in the lane words or note')
check(!/matchLanes|LANES|laneTable/.test(SRC('lib/dash/homerFeed.js')) && !/matchLanes|LANES|laneTable/.test(SRC('lib/nhl/goalFeed.js')) && !/matchLanes|LANES|laneTable/.test(SRC('lib/nfl/tdFeed.js')), 'the numerology posts read gematria directly (full name, one line), never the lane list: the new lanes cannot reach X/Discord and no post ranks lanes by hit rate')
check(!/numerolog|laneTable|lane_nights/i.test(SRC('lib/callStatus.js')) && !/numerolog/i.test(SRC('lib/nhl/goalModel.js')), 'numerology is not in callStatus or the NHL goal model (never a call, status, score or rank)')


// ── 12. TODAY'S / YESTERDAY'S NUMBERS and the Ledger (2026-10-10) -- TEST rows, labelled ──
const { dayBefore, chain, dateNumberRows, dayRecap, NUMBERS_NOTE } = await import('../lib/numerology/dayNumbers.js')
check(dayBefore('2026-10-01') === '2026-09-30' && dayBefore('2026-01-01') === '2025-12-31' && dayBefore('2024-03-01') === '2024-02-29' && dayBefore('junk') === null, 'dayBefore: month, year and leap-day boundaries; junk -> null (the game\'s own date, no clock)')
check(chain(48).join() === '48,12,3' && chain(29).join() === '29,11' && chain(7).join() === '7', 'reduction chains stop at one digit or at a master number (29 -> 11)')
const rows929 = dateNumberRows('2026-09-29')
const byK = Object.fromEntries(rows929.map((r) => [r.key, r]))
check(byK.ud.value === 3 && byK.full.value === 48 && byK.full.reduces === '48 → 12 → 3' && byK.short.value === 64 && byK.md.value === 38 && byK.md.reduces === '38 → 11' && byK.md.master === true && byK.root.value === 3 && byK.doy.value === 272 && byK.uy.value === 1, '9/29/2026 rows by hand: UD 3, full 48 (48 -> 12 -> 3), short 64, M+D 38 (-> 11, master), root 3, day 272, universal year 1')
check(byK.full.how === '9 + 29 + 2+0+2+6' && byK.short.how === '9 + 29 + 26', 'each row says the sum that makes it')
check(rows929.length === 8 && rows929[0].key === 'ud' && dateNumberRows('') .length === 0, 'eight rows, Universal Day first; no date -> no rows')
// recap: TEST rows only. Day 2026-09-29 has Universal Day 3.
const nr = [
  { kind: 'jersey_root', value: '3', events: 4, players: 20, expected: '2.5' }, { kind: 'jersey_root', value: '5', events: 1, players: 20, expected: '2.5' },
  { kind: 'life_path', value: '3', events: 2, players: 30, expected: '1.9' }, { kind: 'jersey', value: '3', events: 3, players: 4, expected: '0.5' },
]
const lr = [
  { lane: 'gem_date_ordinal', eligible: 300, matched: 3, eligible_hits: 45, matched_hits: 1, graded_at: 'x' },
  { lane: 'fib_next', eligible: 300, matched: 40, eligible_hits: 45, matched_hits: 5, graded_at: 'x' },
  { lane: 'gem_date_reverseOrdinal', eligible: 300, matched: 0, eligible_hits: 45, matched_hits: 0, graded_at: 'x' },
  { lane: 'letters_date', eligible: 300, matched: 2, eligible_hits: null, matched_hits: null, graded_at: null },
]
const rc = dayRecap('2026-09-29', nr, lr)
check(rc.graded && rc.udRows.length === 2 && rc.udRows.every((r) => r.value === '3') && !rc.udRows.some((r) => r.kind === 'jersey'), 'recap: only recorded rows equal to the Universal Day root (3), jersey-root and life-path, nothing else')
check(rc.lanes.length === 1 && rc.lanes[0].lane === 'gem_date_ordinal' && rc.lanes[0].matched === 3 && rc.lanes[0].hits === 1 && /ordinal/.test(rc.lanes[0].label), 'recap: date lanes with someone matched and graded (not fib_next, not an empty or ungraded lane), cipher lane named')
check(dayRecap('2026-09-29', [], []).graded === false && dayRecap('2026-09-29', null, null).graded === false, 'nothing recorded -> graded false (never invented)')
check(NUMBERS_NOTE === 'Information only: never part of a score, never a call.', 'the disclosure line')
const dsrc = SRC('components/numerology/DayNumbers.js')
check(/TODAY'S NUMBERS/.test(dsrc) && /'YESTERDAY'/.test(dsrc) && /NUMBERS_NOTE/.test(dsrc) && /All \$\{rows\.length\} numbers/.test(dsrc) && !/\bdue\b|winner/i.test(dsrc) && !/easternToday|new Date\(\)|Date\.now/.test(dsrc), 'DayNumbers: both blocks, the disclosure, an All-N preview, no clock, no "due"/"winner"')
check([['components/Alignments.js', 'mlb'], ['components/lamp/tabs/Numerology.js', 'nhl'], ['components/nfl/tabs/Numerology.js', 'nfl']].every(([f, sp]) => new RegExp(`<DayNumbers sport="${sp}"`).test(SRC(f))), 'MLB, NHL and NFL Numerology tabs draw DayNumbers')
// every ledger draws the numbers through one wrapper since 10-18 (components/ledger/NumbersBox.js: DayNumbers + LaneTable)
check(/'align', 'numbers'/.test(SRC('components/ledger/LedgerBody.js')) && /<DayNumbers sport=\{sport\}/.test(SRC('components/ledger/NumbersBox.js')) && /<LaneTable sport=\{sport\}/.test(SRC('components/ledger/NumbersBox.js')) && [['components/HomerLedger.js', 'mlb'], ['lib/sports/nhl/ledger.js', 'nhl'], ['lib/sports/nfl/ledger.js', 'nfl']].every(([f, sp]) => new RegExp(`<NumbersBox sport="${sp}"`).test(SRC(f))), 'the shared Ledger has a numbers section on MLB, NHL and NFL: today/yesterday numbers + the lane scoreboard (cipher lanes)')
check(['lib/sports/nhl/ledger.js', 'lib/sports/nfl/ledger.js', 'lib/sports/nba/ledger.js', 'components/HisNumbers.js', 'components/ledger/InTheLedger.js'].every((f) => /displayLanes\(matchLanes/.test(SRC(f))), 'every Ledger lane chip list goes through displayLanes (cipher shown, no duplicate any-cipher chip)')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
