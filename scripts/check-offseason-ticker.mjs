// MOONSHOT'S TICKER IN THE OFFSEASON, CHECKED (2026-10-21, KNOWN-ISSUES #18). lib/mlb/offseasonTicker.js on TEST phases, and the header's
// wiring (components/Header.js). TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-offseason-ticker.mjs
import fs from 'node:fs'
const { offseasonItems, FALL_PILLS } = await import('../lib/mlb/offseasonTicker.js')
let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const g = (pk, a, h) => ({ pk, date: '2026-11-05', away: { abbrev: a, name: `Test ${a}` }, home: { abbrev: h, name: `Test ${h}` } })

for (const p of [null, { phase: 'REGULAR' }, { phase: 'POSTSEASON' }, { phase: 'PRESEASON', lane: 'SPRING' }]) ok(offseasonItems(p) === null, `not the offseason (${p?.phase || 'unknown'}): the strip is as before`)
const off = offseasonItems({ phase: 'OFFSEASON', lane: null, laneGames: [], next: null })
ok(off.length === 1 && off[0].value === 'Offseason' && off[0].nav === 'home', 'offseason, fall league over: the one word, to Home')
const fall = offseasonItems({ phase: 'OFFSEASON', lane: 'FALL', laneGames: [g(1, 'TSA', 'TSB'), g(2, 'TSC', 'TSD')] })
ok(fall.map((i) => i.value).join('|') === 'Offseason|TSA @ TSB|TSC @ TSD', `fall league games today (${fall.map((i) => i.value).join('|')})`)
const many = offseasonItems({ phase: 'OFFSEASON', lane: 'FALL', laneGames: [1, 2, 3, 4, 5].map((i) => g(i, `TA${i}`, `TH${i}`)) })
ok(many.length === 1 + FALL_PILLS + 1 && many[many.length - 1].value === '+2 more', 'more than three games: three, then "+2 more"')
const next = offseasonItems({ phase: 'OFFSEASON', lane: 'FALL', laneGames: [], next: g(9, 'TSE', 'TSF') })
ok(next[1]?.label === 'next fall game' && next[1].value === 'Thu, Nov 5', `no game today: the next one (${next[1]?.value})`)
ok([off, fall, many, next].flat().every((i) => !/#1|Expected|lineups|built/i.test(`${i.label} ${i.value}`)), 'no last-slate pill in the offseason')

const src = fs.readFileSync(new URL('../components/Header.js', import.meta.url), 'utf8')
ok(/const offItems = offseasonItems\(useMlbPhase\(\), \{ muted: C\.text3 \}\)\n  if \(!stats\) return/.test(src), 'the header reads the phase before its early return (every hook first)')
ok(/items=\{offItems \? \[\.\.\.offItems, \.\.\.items\.filter\(\(it\) => it\.sport \|\| it\.kind\)\]/.test(src), 'offseason: the word and fall ball, then only real scores')
console.log(bad ? `${bad}/${n} FAILED` : `check-offseason-ticker: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
