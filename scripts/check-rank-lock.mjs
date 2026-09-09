#!/usr/bin/env node
// 🔒 THE HR RANK LOCK (2026-08-11)
//
// Donovan: "give me the ranking on the hr board that will show me the order
// the players are in on the results page. and don't change it ever again."
//
// "Don't change it ever again" is not a promise anyone can keep by intending
// to — this codebase reintroduced Number(playerId()) twice in one day before
// check-ids.mjs existed. It is a check. This one fails the build if:
//
//   1. lib/scoring.js loses hrRank, or hrRank stops ranking on hrScore
//   2. Scoreboard's Gone Yard stops reading hrRank (a local sort creeping back)
//   3. RankedBoard's HR view stops reading hrRank (i+1 creeping back)
//
// If a future change NEEDS a different HR ordering, it must change hrRank
// itself — one place, both surfaces, and this comment — not fork a second
// ranking somewhere quiet.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const fails = []

const scoring = read('lib/scoring.js')
if (!/export function hrRank\(/.test(scoring)) fails.push('lib/scoring.js: hrRank export is gone')
const body = scoring.slice(scoring.indexOf('export function hrRank('))
if (!/hrScore\(b\) - hrScore\(a\)/.test(body.slice(0, 600))) fails.push('lib/scoring.js: hrRank no longer sorts on raw hrScore')

const sb = read('components/tabs/Scoreboard.js')
if (!/hrRank\(players\)/.test(sb)) fails.push('Scoreboard.js: Gone Yard no longer uses the shared hrRank')

const rb = read('components/tabs/RankedBoard.js')
if (!/hrRank\(players\)/.test(rb)) fails.push('RankedBoard.js: the HR board no longer uses the shared hrRank')
if (/rank: i \+ 1,\n/.test(rb)) fails.push('RankedBoard.js: a bare i+1 rank came back')

if (fails.length) {
  console.error('✖ HR rank lock violated:')
  fails.forEach((f) => console.error('   ' + f))
  process.exit(1)
}
console.log('ok   hr rank lock: one ordering, both surfaces, still holding')
