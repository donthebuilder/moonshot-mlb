#!/usr/bin/env node
// EV Log toggles (lib/mlb/evView.js). Offline, TEST ROWS only.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-ev-view.mjs
import { hardHitLine, evDefaults } from '../lib/mlb/evView.js'
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
// 32 balls in the last-10-games window, 10 hard; the arm + mix defaults keep 14 of them, 2 hard (the reproduced case)
const win = Array.from({ length: 32 }, (_, i) => ({ hard: i < 10 ? 1 : 0, k: 0 }))
const kept = win.filter((_, i) => i >= 8 && i < 22)
const w = hardHitLine(win), f = hardHitLine(kept)
check(w.bbe === 32 && w.hard === 10 && Math.round(w.pct) === 31, 'the window: 10 of 32 hard hit (31%)')
check(f.bbe === 14 && f.hard === 2 && Math.round(f.pct) === 14, 'the filtered strip: 2 of 14 (14%) -- now named next to the window, not instead of it')
check(hardHitLine([{ hard: 1, k: 1 }, { hard: 0, k: 0 }]).bbe === 1, 'a strikeout is not a batted ball')
check(hardHitLine([]).pct === null, 'empty window -> no rate')
check(evDefaults({ pitcher_throws: 'L' }).arm === 'L' && evDefaults({ pitcher_throws: 'R' }).arm === 'R' && evDefaults({}).arm === 'ALL', 'arm default follows tonight\'s starter, else All')
process.exit(failed ? 1 : 0)
