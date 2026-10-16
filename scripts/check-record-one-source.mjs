#!/usr/bin/env node
// ONE RECORD, ONE SOURCE (Batch 0, 2026-10-15). Run:  node --import ./scripts/_esm-resolve.mjs scripts/check-record-one-source.mjs
// The record a visitor reads must be the locked, pregame record (lib/record/lockedRecord.js), the same on Home, Hits/HRR, the
// pulse and the share cards. The post-game archive (backtest_summary: overall_base_hit_accuracy, hr_rate_pct) reads about twice as
// high on top-of-board rates, so it may only be printed where it is labelled "post-game archive". This check fails when:
//   1. a file outside the allow-list reads one of the archive-rate fields in code (comments do not count);
//   2. an allow-listed file stops saying "post-game archive" next to them;
//   3. Home, Hits/HRR or the pulse stop reading the locked record;
//   4. the range helper (wilson / pickRange) drifts: 110 of 176 must read 55.2-69.3%.
// TEST data only where a number is typed below; nothing here reads the network.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
await import('./_esm-resolve.mjs')
const { wilson, pickRange } = await import('../lib/record/lockedRecord.js')

let fail = 0
const ok = (cond, msg) => { if (!cond) { fail += 1; console.log(`FAIL ${msg}`) } else console.log(`ok   ${msg}`) }

const ARCHIVE_FIELDS = /overall_base_hit_accuracy|hr_rate_pct/
const ALLOW = new Set(['components/tabs/Backtest.js'])   // archive-labelled on purpose
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p)
  }
  return out
}
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l)
const offenders = []
for (const root of ['components', 'lib', 'app']) {
  for (const p of walk(root)) {
    const hits = readFileSync(p, 'utf8').split('\n').filter((l) => ARCHIVE_FIELDS.test(l) && !isComment(l))
    if (hits.length && !ALLOW.has(p)) offenders.push(p)
  }
}
ok(offenders.length === 0, `no archive-rate field read outside the labelled allow-list${offenders.length ? ': ' + offenders.join(', ') : ''}`)
for (const p of ALLOW) ok(/post-game archive/.test(readFileSync(p, 'utf8')), `${p} says "post-game archive" beside the archive rate`)

const has = (p, re) => re.test(readFileSync(p, 'utf8'))
ok(has('components/tabs/Home.js', /useLockedRecord/), 'MLB Home reads the locked record')
ok(has('components/tabs/HitsHRR.js', /useLockedRecord/), 'Hits/HRR reads the locked record')
ok(has('lib/dash/pulse.js', /readLockedRecord/), 'the pulse reads the locked record')

const w = wilson(110, 176)
ok(w && w.lo === 55.2 && w.hi === 69.3, '110 of 176 ranges 55.2 to 69.3 (TEST numbers)')
ok(wilson(0, 0) === null && wilson(5, 3) === null, 'no calls, or more hits than calls, has no range')
ok(pickRange({ ok: 110, n: 176, enough: true }) === '55.2–69.3%', 'pickRange prints the range')
ok(pickRange({ ok: 3, n: 5, enough: false }) === '', 'a tier under the minimum prints no range')

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
