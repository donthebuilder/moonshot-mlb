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

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
