#!/usr/bin/env node
// LAMP v5 (2026-10-23): the injury report. TEST DATA only: made-up skaters, made-up report entries.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-v5.mjs
import { VERSIONS, V4_FROM, V5_FROM, isV4, isV5, versionsFor } from '../lib/nhl/versions.js'
import { scoreNight } from '../lib/nhl/goalModel.js'
import { injuryLegs } from '../lib/nhl/injuryRule.js'
import { indexEntries } from '../lib/injuries/lookup.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// ── versions by date ──
eq('V5_FROM', V5_FROM, '2026-10-23')
eq('10-22 stays v4', [versionsFor('2026-10-22').goal, versionsFor('2026-10-22').sog, versionsFor('2026-10-22').pts, versionsFor('2026-10-22').ast], ['lamp-goal-v4', 'lamp-sog-v3', 'lamp-pts-v3', 'lamp-ast-v3'])
eq('10-23 -> v5', [versionsFor('2026-10-23').goal, versionsFor('2026-10-23').sog, versionsFor('2026-10-23').pts, versionsFor('2026-10-23').ast], ['lamp-goal-v5', 'lamp-sog-v4', 'lamp-pts-v4', 'lamp-ast-v4'])
eq('10-23 shadows bump', [versionsFor('2026-10-23').goalpos, versionsFor('2026-10-23').goalw, versionsFor('2026-10-23').goal2, versionsFor('2026-10-23').comp, versionsFor('2026-10-23').comp2], ['lamp-goalpos-v3', 'lamp-goalw-v3', 'goal2_site_v3', 'lamp-goal-comp-v1b', 'lamp-goal-comp-v2b'])
eq('every version name is new (no v5 name reused from an older era)', Object.values(VERSIONS).every((a) => !a.slice(0, 3).includes(a[3])), true)
eq('isV4 stays true on v5 dates; isV5 only from V5_FROM', [isV4(V5_FROM), isV5('2026-10-22'), isV5('2026-10-23'), isV5(null)], [true, false, true, false])
eq('V4_FROM unchanged', V4_FROM, '2026-10-18')

// ── the rule (TEST report) ──
const idx = indexEntries('nhl', [
  { sport: 'nhl', team: 'MTL', name: 'Test Centre', status: 'OUT', note: 'Upper body' },
  { sport: 'nhl', team: 'MTL', name: 'Test Winger', status: 'IL', note: 'Knee' },
  { sport: 'nhl', team: 'MTL', name: 'Test Defence', status: 'DAY_TO_DAY', note: 'Lower body' },
])
const out = injuryLegs(idx, { playerId: 1, name: 'Test Centre', team: 'MTL' })
eq('OUT -> not scored, reason printed', [out?.ok, out?.injury, out?.reason], [false, 'OUT', 'Out (upper body) on the injury report: not scored'])
eq('injured reserve -> not scored', injuryLegs(idx, { playerId: 2, name: 'Test Winger', team: 'MTL' })?.ok, false)
eq('day-to-day -> scored as usual', injuryLegs(idx, { playerId: 3, name: 'Test Defence', team: 'MTL' }), null)
eq('not on the report -> scored', injuryLegs(idx, { playerId: 4, name: 'Test Healthy', team: 'MTL' }), null)
eq('same name, other club -> scored', injuryLegs(idx, { playerId: 5, name: 'Test Centre', team: 'CHI' }), null)
eq('no report -> nobody dropped', injuryLegs(null, { playerId: 1, name: 'Test Centre', team: 'MTL' }), null)

// ── the pool: an injured man is not ranked and does not move anyone's percentile ──
const legs = (s, g, t) => ({ ok: true, shotsPg: s, goalsPg: g, toi: t })
const base = [
  { gameId: 1, playerId: 10, name: 'A', team: 'MTL', opp: 'CHI', legs: legs(3, 0.5, 1200) },
  { gameId: 1, playerId: 11, name: 'B', team: 'MTL', opp: 'CHI', legs: legs(2, 0.3, 1000) },
  { gameId: 1, playerId: 12, name: 'C', team: 'CHI', opp: 'MTL', legs: legs(1, 0.1, 900) },
]
const withOut = [...base, { gameId: 1, playerId: 13, name: 'Hurt', team: 'MTL', opp: 'CHI', legs: injuryLegs(idx, { playerId: 1, name: 'Test Centre', team: 'MTL' }) }]
const a = scoreNight(base.map((c) => ({ ...c }))), b = scoreNight(withOut.map((c) => ({ ...c })))
eq('the injured man is NOT ON THE BOARD with the reason', [b.find((r) => r.playerId === 13).status, b.find((r) => r.playerId === 13).score, b.find((r) => r.playerId === 13).reason], ['off', null, 'Out (upper body) on the injury report: not scored'])
eq('the others score exactly as without him', b.filter((r) => r.playerId !== 13).map((r) => [r.playerId, r.score, r.status]), a.map((r) => [r.playerId, r.score, r.status]))

console.log(fail ? `\n${fail} FAILED` : '\nlamp v5: all ok')
process.exit(fail ? 1 : 0)
