#!/usr/bin/env node
// SHOT MAP MIRROR BUG (2026-10-07): a shot on goal from the shooter's own end must not be mirrored onto the
// near net. Every row below is TEST DATA, written by hand.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-shotnorm.mjs
import { normRow, drawable } from '../lib/nhl/shotNorm.js'
import { xgShot } from '../lib/nhl/xg.js'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const row = (o) => ({ result: 'sog', zone: 'O', goalie_id: 1, strength: 'ev', shot_type: 'wrist', ...o })

// a normal slot shot at the right-hand net, and the same shot at the left-hand net: both land at x = 80
const right = normRow(row({ x: 80, y: 5 })); const left = normRow(row({ x: -80, y: -5 }))
check(right.x === 80 && right.y === 5, 'a shot at the right net stays')
check(left.x === 80 && left.y === 5, 'a shot at the left net turns to the right net')
// the bug: a shot on goal from the shooter's own end, zone D, taken at x = -80 (he is deep in his own end,
// the net he attacks is the OTHER one). It must NOT land at x = +80 (a phantom slot shot).
const own = normRow(row({ x: -80, y: -5, zone: 'D' }))
check(own.x === -80 && !drawable(own), 'an own-end shot on goal stays far from the net it attacked and is not drawn')
const own2 = normRow(row({ x: 80, y: 5, zone: 'D' }))
check(own2.x === -80, 'the same from the other end: also far side')
// a BLOCKED shot is already toward its net, zone or not
const blk = normRow(row({ x: -70, y: 3, zone: 'D', result: 'block' }))
check(blk.x === 70, 'a block keeps the plain flip')
check(normRow({ x: null, y: 1 }) === null, 'no location -> null')
// xG: unchanged by this fix (it reads xgFeatures.normShot, which this file now shares)
check(xgShot(row({ x: -80, y: -5 })) === xgShot(row({ x: 80, y: 5 })), 'xG is symmetric for ordinary shots')
const src = readFileSync(new URL('../lib/nhl/shotMap.js', import.meta.url), 'utf8')
check(/const norm = normRow/.test(src) && !/s\.x < 0 \? \{ \.\.\.s, x: -s\.x/.test(src), 'shotMap.js uses the zone-aware norm')
const sql = readFileSync(new URL('../supabase/migrations/202610071200_lamp_league_shot_grid_zone.sql', import.meta.url), 'utf8')
check(/zone = 'D' and s\.result is distinct from 'block'/.test(sql), 'the league grid migration carries the same rule')
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0)
