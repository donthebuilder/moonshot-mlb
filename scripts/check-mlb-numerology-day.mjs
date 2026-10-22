// MOONSHOT NUMEROLOGY ON A DAY WITHOUT ITS SLATE, CHECKED (2026-10-21). lib/numerology/mlbDay.js numerologyDay on TEST inputs, plus the wiring in
// components/Alignments.js. TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-mlb-numerology-day.mjs
import fs from 'node:fs'
const { numerologyDay } = await import('../lib/numerology/mlbDay.js')
let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const base = { slateDate: '2026-10-20', today: '2026-10-21', slateOver: true }

ok(numerologyDay({ ...base, slateDate: '2026-10-21', next: null }) === null, "today's slate: shown as it is")
ok(numerologyDay({ ...base, slateDate: '', next: null }) === null, 'no slate date: page as it was')
ok(numerologyDay({ ...base, slateOver: false, next: null }) === null, 'a late game on the old slate still on (after midnight ET): shown as it is')
ok(numerologyDay({ ...base, slateOver: null, next: null }) === null, 'slate state unreadable: page as it was')
ok(numerologyDay({ ...base, next: undefined }) === null, 'next game still loading: page as it was')

const wait = numerologyDay({ ...base, next: { date: '2026-10-21', round: null, games: 12 } })
ok(wait?.kind === 'waiting' && wait.numbersDate === '2026-10-21' && /2026-10-20 is final/.test(wait.note), `games today, board not up: waiting (${JSON.stringify(wait)})`)

const ws = numerologyDay({ ...base, next: { date: '2026-10-23', round: 'World Series', games: 1 } })
ok(ws?.kind === 'none' && ws.title === 'NO MLB GAME TODAY' && /World Series starts Fri 10\/23/.test(ws.note) && ws.numbersDate === '2026-10-23' && ws.numbersLabel === 'Fri 10/23', `no game today, World Series Friday (${JSON.stringify(ws)})`)

const off = numerologyDay({ ...base, slateDate: '2026-10-31', today: '2026-11-04', next: null, phase: { phase: 'OFFSEASON' } })
ok(off?.kind === 'none' && /offseason/.test(off.note) && off.numbersDate === null, `offseason: says so, no date numbers (${JSON.stringify(off)})`)
const gap = numerologyDay({ ...base, next: null, phase: null })
ok(gap?.kind === 'none' && /next 10 days/.test(gap.note), 'nothing in 10 days, phase unknown: plain words')

const src = fs.readFileSync(new URL('../components/Alignments.js', import.meta.url), 'utf8')
ok(/numerologyDay\(\{ slateDate, today: etDay/.test(src), 'Alignments asks numerologyDay')
ok(src.indexOf('if (off) {') > src.indexOf('useMemo(() => ({\n    date: todayKey'), 'the early return comes after every hook')

console.log(`${n - bad}/${n} checks ${bad ? 'FAILED' : 'pass'}`)
process.exit(bad ? 1 : 0)
