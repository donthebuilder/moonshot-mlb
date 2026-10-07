#!/usr/bin/env node
// First-pitch split (lib/mlb/firstPitch.js). Offline, TEST ROWS only.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-first-pitch.mjs
import { firstPitchSummary, firstPitchRows, isFirstPitch } from '../lib/mlb/firstPitch.js'
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const r = (balls, strikes, description, events = '', date = '2026-05-01') => ({ balls: String(balls), strikes: String(strikes), description, events, date })
check(firstPitchSummary([]) === null, 'no rows -> null (the card shows nothing)')
check(firstPitchSummary([r(1, 0, 'ball'), r(0, 1, 'foul')]) === null, 'no 0-0 pitch -> null')
check(isFirstPitch(r(0, 0, 'ball')) && !isFirstPitch({ description: 'ball' }), 'missing count is not a first pitch')
const rows = [
  r(0, 0, 'called_strike'), r(0, 0, 'ball'), r(0, 0, 'swinging_strike'), r(0, 0, 'foul'),
  r(0, 0, 'hit_into_play', 'home_run'), r(0, 0, 'hit_into_play', 'field_out'), r(2, 1, 'foul'),
  r(0, 0, 'hit_into_play', 'single', '2025-06-01'),
]
const s = firstPitchSummary(rows)
check(s.pitches === 7, '7 first pitches (the 2-1 foul is excluded)')
check(Math.abs(s.swingPct - (5 / 7) * 100) < 1e-9, 'swing% = swings / first pitches')
check(Math.abs(s.whiffPct - 20) < 1e-9, 'whiff% = whiffs / swings (1 of 5)')
check(s.inPlay === 3 && s.hits === 2 && s.hr === 1, 'in play 3, hits 2, HR 1')
const t = firstPitchRows(rows)
check(t[0].key === 'career' && t.length === 3 && t[1].key === '2026' && t[2].key === '2025', 'career, then seasons newest first')
import { splitsPostText } from '../lib/mlb/splitsPost.js'
const pr = [{ code: 'vl', avg: 0.3, ops: 0.9, hr: 4, pa: 80 }, { code: 'vr', avg: 0.25, ops: 0.7, hr: 9, pa: 300 }, { code: 'risp', avg: 0, ops: 0, hr: 0, pa: 0 }]
const t2 = splitsPostText({ name: 'Test Batter', windowTag: 'season', tonightArm: 'R', rows: pr })
check(t2.includes('vs RHP (tonight\u2019s arm): .250 AVG, .700 OPS, 9 HR in 300 PA') && !t2.includes('RISP'), 'splits post: real rows only, a no-sample split is left out')
check(splitsPostText({ name: 'Test Batter', rows: [] }) === '', 'splits post: nothing true to say -> empty')
process.exit(failed ? 1 : 0)
