#!/usr/bin/env node
// nfl_results WAITS FOR THE DAY'S GAMES TO BE FINAL (batch 3, 2026-10-26). TEST data.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nfl-results-final.mjs
import fs from 'node:fs'
let n = 0, bad = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
let F = null
try { F = await import('../lib/nfl/gamesFinal.js') } catch { /* before the fix there is no module */ }
ok(F && F.dayIsFinal([{ state: 'post' }, { state: 'post', completed: true }]).ok === true, 'every game final: go')
ok(F && F.dayIsFinal([{ state: 'post' }, { state: 'in' }]).ok === false && /1 of 2/.test(F.dayIsFinal([{ state: 'post' }, { state: 'in' }]).why), 'one game still on (Sunday night): hold, says how many')
ok(F && F.dayIsFinal([{ state: 'pre' }]).ok === false && F.dayIsFinal([{ completed: true }]).ok === true, 'a game that has not started holds; completed:true counts as final')
ok(F && F.dayIsFinal(null).ok === false && F.dayIsFinal([]).ok === false, 'an unreadable schedule or no games is a HOLD, never "nothing to wait for"')
const route = fs.readFileSync('app/api/dash/nfl/tick/route.js', 'utf8')
const i = route.indexOf("sl.kind === 'nfl_results'"), j = route.indexOf('nflBoardResultsText(', i)
const block = i > 0 && j > i ? route.slice(i, j) : ''
ok(/dayIsFinal\(/.test(block) && /fetchNflGamesOn\(yday\)/.test(block) && /held:/.test(block), 'the route holds the results post until yesterday\'s games are final, before it grades or claims anything')
console.log(bad ? `${bad}/${n} FAILED` : `check-nfl-results-final: ${n} checks passed`)
process.exit(bad ? 1 : 0)
