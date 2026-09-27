#!/usr/bin/env node
// THE FOUR's record (lib/mlbFour.js). Offline, TEST ROWS only (made-up names).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-mlb-four.mjs
// Cross-checked live on 2026-09-27: over 09-13..09-26 each category's #1
// graded the same as the bot's own designed_hit on all 56 picks.
import { fourOfNight, fourRecord, FOUR_BAR } from '../lib/mlbFour.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const row = (o) => ({ is_final: true, actual_ab: 4, actual_bb: 0, actual_hr: 0, actual_hits: 0, actual_runs: 0, actual_rbi: 0, actual_tb: 0, ...o })

check(FOUR_BAR.HR(row({ actual_hr: 1 })) && !FOUR_BAR.HR(row({})), 'HR bar: 1+ HR')
check(FOUR_BAR.HIT(row({ actual_hits: 1 })), 'HIT bar: 1+ hit')
check(FOUR_BAR.HRR(row({ actual_hits: 1, actual_rbi: 1 })) && !FOUR_BAR.HRR(row({ actual_runs: 1 })), 'HRR bar: 2+ H+R+RBI')
check(FOUR_BAR.CONTACT(row({ actual_tb: 2 })) && !FOUR_BAR.CONTACT(row({ actual_tb: 1 })), 'CONTACT bar: 2+ TB')

const night = [
  row({ pick_type: 'HR', player_id: 1, name: 'Test Slugger', hr_score: 90, actual_hr: 1 }),
  row({ pick_type: 'HR', player_id: 2, name: 'Test Second', hr_score: 80 }),
  // the TOP row of the HIT #1 must not stand in for his HIT grade
  row({ pick_type: 'TOP', player_id: 3, name: 'Test Hitter', hr_score: 99, hit_score: 99 }),
  row({ pick_type: 'HIT', player_id: 3, name: 'Test Hitter', hit_score: 70, actual_hits: 2 }),
  row({ pick_type: 'HRR', player_id: 4, name: 'Test Scratch', hrr_score: 95, actual_ab: 0, actual_bb: 0 }),
  row({ pick_type: 'CONTACT', player_id: 5, name: 'Test Void', contact_score: 88, actual_tb: 3, fair_test_void: true }),
]
const f = fourOfNight(night)
check(f.HR?.name === 'Test Slugger' && f.HR.hit === true, 'HR: the top HR score is the #1, and he homered')
check(f.HIT?.name === 'Test Hitter' && f.HIT.hit === true, 'HIT: ranks only HIT rows (the TOP row is not his HIT pick)')
check(f.HRR === null, 'a scratched #1 (no AB, no walk) is no pick, not a miss')
check(f.CONTACT === null, 'a voided #1 is no pick')
const rec = fourRecord([{ date: '2026-09-02', slots: night }, { date: '2026-09-01', slots: [row({ pick_type: 'HR', player_id: 9, name: 'Test Miss', hr_score: 50 })] }])
check(rec.HR.hit === 1 && rec.HR.n === 2 && rec.HR.from === '2026-09-01' && rec.HR.to === '2026-09-02', 'record: HR 1 of 2 nights, dates kept')
check(rec.HRR.n === 0 && rec.CONTACT.n === 0, 'no-pick nights never count')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
