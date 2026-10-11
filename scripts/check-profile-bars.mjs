#!/usr/bin/env node
// THE "WHAT SEPARATES THEM" BARS READ IN ORDER (2026-10-10). Run: node scripts/check-profile-bars.mjs
// The chart numbers its rows 1..N and draws each row's bar from its score; those two must tell the same story.
// TEST DATA below is labelled as test data (the score list is the order Donovan's screenshot arrived in -- the
// board's order, not the score order -- with invented names). Nothing here is a real player or a real score.
import './_esm-resolve.mjs'
import { readFileSync } from 'node:fs'

const { topByScore, barPct } = await import('../lib/profileBars.js')
let bad = 0
const fail = (m) => { bad++; console.log(`FAIL ${m}`) }
const ok = (m) => console.log(`ok   ${m}`)

// TEST DATA: arrival order = board order, scores NOT descending (this is the bug's shape)
const TEST_ROWS = [64.5, 50.4, 39.5, 35.7, 57.5, 23.4, 39.3, 21.2, 43.1, 44.0, 34.1, 31.7, 21.4, 32.6, 21.5, 18.0, 70.2]
  .map((score, i) => ({ id: `test-${i + 1}`, label: `TEST PLAYER ${i + 1}`, score }))

const shown = topByScore(TEST_ROWS, 15)
if (shown.length !== 15) fail(`expected 15 rows, got ${shown.length}`)
else ok('15 rows')
const mono = shown.every((r, i) => i === 0 || shown[i - 1].score >= r.score)
mono ? ok('scores are non-increasing in displayed order') : fail(`not monotone: ${shown.map((r) => r.score).join(', ')}`)
const widths = shown.map((r) => barPct(r.score))
widths.every((w, i) => i === 0 || widths[i - 1] >= w) ? ok('bar widths are non-increasing in displayed order') : fail('bar widths are not monotone')
// membership: the top 15 BY SCORE, so the two lowest scores (18.0, 21.2) are out and 70.2 (arrived last) is in
const out = TEST_ROWS.filter((r) => !shown.includes(r)).map((r) => r.score).sort((a, b) => a - b)
out.length === 2 && out[0] === 18 && out[1] === 21.2 ? ok('membership is the fifteen highest scores') : fail(`wrong members; dropped ${out.join(', ')}`)
shown[0].score === 70.2 ? ok('the highest score leads even though it arrived last') : fail('highest score does not lead')
// ties keep the order they arrived in (the board's)
const ties = topByScore([{ id: 'a', score: 50 }, { id: 'b', score: 50 }, { id: 'c', score: 60 }, { id: 'd', score: NaN }], 15).map((r) => r.id).join('')
ties === 'cab' ? ok('ties keep arrival order; a NaN score is dropped') : fail(`tie order ${ties}`)
// 0-100 scale: the same score is the same width in every row
barPct(50) === 50 && barPct(100) === 100 && barPct(0) === 2 ? ok('bar width is the score on a 0-100 scale') : fail('barPct is not 0-100')
// the component must read the helper (a local sort creeping back is how the order drifted before)
const src = readFileSync(new URL('../components/ProfileBars.js', import.meta.url), 'utf8')
;/topByScore\(rows/.test(src) && /barPct\(r\.score\)/.test(src) ? ok('ProfileBars reads lib/profileBars.js') : fail('ProfileBars no longer reads lib/profileBars.js')
process.exit(bad ? 1 : 0)
