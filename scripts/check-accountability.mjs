#!/usr/bin/env node
// THE ACCOUNTABILITY POST MUST NOT FLATTER ITSELF.
//
// accountabilityText is the one automated post whose entire purpose is the
// account grading itself in public. It has to fit 270 characters, and it used
// to get there by dropping names off the END of the card with nothing saying
// so. Picks arrive in ranked order, so the names cut are always the bottom —
// the ones that hit least often. On the real 2026-09-12 card that meant 8 of
// 10 picks shown, both dropped names misses, and a reader counting checkmarks
// saw 3 of 8 where the truth was 3 of 10.
//
// The fix was to print the true record above the list. These checks defend the
// three properties that make that fix real, because every one of them would
// regress silently:
//
//   1. the record counts EVERY pick, not the shown ones
//   2. the record survives at any card size — it is above the truncation point
//   3. a truncated card SAYS it was truncated
//
// SHIP.sh globs scripts/check-*.mjs, so this runs on every ship.
import { accountabilityText } from '../lib/dash/homerFeed.js'

let failed = 0
const ok = (name, cond) => {
  if (!cond) { failed += 1; console.log(`   FAIL  ${name}`) } else { console.log(`   ok    ${name}`) }
}

// The real tail, matching homers/tick's own TAIL: the Called It page on this
// site plus the X handle, and only when X_POST_LINK=1 — never a sportsbook.
// The brand plan dropped book names from tweet TEXT and kept them on the card,
// so a fixture naming one here would quietly teach the next reader otherwise.
const TAIL = { site: 'https://dashnetwork.vercel.app/called', handle: '@dashnetwork' }
const card = (n) => Array.from({ length: n }, (_, i) => ({
  player_id: String(i), name: `Player Nameten ${i}`, team: 'BOS',
}))

console.log('\naccountability post')

// A deliberately oversized card: far more picks than can ever fit.
const big = card(22)
const hitsBig = new Set(['0', '1', '2', '19', '20', '21'])   // hits at BOTH ends
const outBig = accountabilityText(big, hitsBig, TAIL)

ok('fits inside the 270-character limit', outBig.length <= 270)
ok('states the record over every pick, not the shown ones',
   outBig.includes('6 for 22 last night.'))
ok('says so when the card is cut', /\+\d+ more not shown/.test(outBig))

// THE REGRESSION THIS EXISTS FOR: hits at the bottom of a long card must still
// be counted. Counting only the rows that fit would read 3 for 22 here.
ok('counts hits that were truncated away', !outBig.includes('3 for 22'))

// Every card size, including the ones that need no truncation.
for (const n of [1, 3, 6, 8, 10, 14, 22, 40]) {
  const picks = card(n)
  const hits = new Set(picks.filter((_, i) => i % 3 === 0).map((p) => p.player_id))
  const out = accountabilityText(picks, hits, TAIL)
  const want = `${hits.size} for ${n} last night.`
  if (!out.includes(want) || out.length > 270) {
    failed += 1
    console.log(`   FAIL  ${n}-pick card: want "${want}" within 270, got ${out.length} chars`)
  }
}
ok('the true record survives at every card size from 1 to 40', true)

// The record must sit ABOVE the names, or truncation could reach it.
const idxRecord = outBig.indexOf('6 for 22')
const idxFirstRow = Math.min(
  ...['✅', '❌'].map((m) => (outBig.indexOf(m) === -1 ? Infinity : outBig.indexOf(m))),
)
ok('the record is printed above the list, where nothing can cut it',
   idxRecord !== -1 && idxRecord < idxFirstRow)

// A clean card must not claim a cut that did not happen.
const small = card(3)
const outSmall = accountabilityText(small, new Set(['0']), TAIL)
ok('a card that fits whole makes no truncation claim',
   !/more not shown/.test(outSmall) && outSmall.includes('1 for 3 last night.'))

ok('no card at all produces no post', accountabilityText([], new Set(), TAIL) === '')

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('')
