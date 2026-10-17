#!/usr/bin/env node
// LAMP v4 (2026-10-17, Donovan): THIS SEASON ONLY from V4_FROM. TEST DATA only: made-up skaters and lines.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-v4.mjs
import { VERSIONS, CURRENT, V3_FROM, V4_FROM, isV3, isV4, versionsFor } from '../lib/nhl/versions.js'
import { pooledLegs, MODEL_VERSION as GOAL_V, ALL_VERSIONS } from '../lib/nhl/goalModel.js'
import { pointRates, toPtsRow, MODEL_VERSION as PTS_V } from '../lib/nhl/ptsModel.js'
import { toAstRow, MODEL_VERSION as AST_V } from '../lib/nhl/astModel.js'
import { toPropRow as toSogRow, MODEL_VERSION as SOG_V } from '../lib/nhl/sogModel.js'
import { toGoalPosRow } from '../lib/nhl/goalPosModel.js'
import { toGoalWeightedRow } from '../lib/nhl/goalWeightedModel.js'
import { toGoal2Row } from '../lib/nhl/goal2Model.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const near = (name, got, want) => eq(name, Math.abs(got - want) < 1e-9, true)

// ── versions by date ──
eq('V3_FROM / V4_FROM', [V3_FROM, V4_FROM], ['2026-10-03', '2026-10-18'])
eq('every market has three entries', Object.values(VERSIONS).map((a) => a.length), [3, 3, 3, 3, 3, 3, 3])
eq('10-02 -> v2 era', [versionsFor('2026-10-02').goal, versionsFor('2026-10-02').sog, versionsFor('2026-10-02').pts, versionsFor('2026-10-02').ast], ['lamp-goal-v2', 'lamp-sog-v1', 'lamp-pts-v1', 'lamp-ast-v1'])
eq('10-03 -> v3', [versionsFor('2026-10-03').goal, versionsFor('2026-10-03').sog, versionsFor('2026-10-03').pts, versionsFor('2026-10-03').ast], ['lamp-goal-v3', 'lamp-sog-v2', 'lamp-pts-v2', 'lamp-ast-v2'])
eq('10-17 (tonight) stays v3', versionsFor('2026-10-17').goal, 'lamp-goal-v3')
eq('10-18 -> v4', [versionsFor('2026-10-18').goal, versionsFor('2026-10-18').sog, versionsFor('2026-10-18').pts, versionsFor('2026-10-18').ast], ['lamp-goal-v4', 'lamp-sog-v3', 'lamp-pts-v3', 'lamp-ast-v3'])
eq('shadows: v3 dates keep their names, v4 dates bump', [versionsFor('2026-10-17').goalpos, versionsFor('2026-10-17').goalw, versionsFor('2026-10-17').goal2, versionsFor('2026-10-18').goalpos, versionsFor('2026-10-18').goalw, versionsFor('2026-10-18').goal2], ['lamp-goalpos-v1', 'lamp-goalw-v1', 'goal2_site_v1', 'lamp-goalpos-v2', 'lamp-goalw-v2', 'goal2_site_v2'])
eq('isV3 stays true on v4 dates; isV4 only from V4_FROM', [isV3('2026-10-18'), isV4('2026-10-17'), isV4('2026-10-18'), isV4('2027-01-01'), isV4(null)], [true, false, true, true, false])
eq('CURRENT is the last entry of each', CURRENT, Object.fromEntries(Object.entries(VERSIONS).map(([k, v]) => [k, v.at(-1)])))
eq('model constants resolve the current version', [GOAL_V, SOG_V, PTS_V, AST_V], ['lamp-goal-v4', 'lamp-sog-v3', 'lamp-pts-v3', 'lamp-ast-v3'])
eq('ALL_VERSIONS carries v1..v4 for the record', ALL_VERSIONS, ['lamp-goal-v1', 'lamp-goal-v2', 'lamp-goal-v3', 'lamp-goal-v4'])

// ── the pool (goalBoard passes prev only when !isV4(date); this is that rule) ──
const cur = { gp: 20, shots: 60, g: 8, toi: 1000, pts: 14, a: 6 }
const prev = { gp: 82, shots: 246, g: 41, toi: 1100, pts: 70, a: 40 }
const prior = { pos: 'F', shotsPg: 2.0, goalsPg: 0.2, toi: 900, ptsPg: 0.5, astPg: 0.3 }
const lines = (date, c, p = prev) => pooledLegs(c, isV4(date) ? null : p, prior)
const v3 = lines('2026-10-17', cur), v4 = lines('2026-10-18', cur)
eq('v3 date: the old blend (gp = 20 + 82 * (62/82) = 82)', Math.round(v3.gpPooled), 82)
near('v3 date: shots/gp is the pooled rate', v3.shotsPg, (60 + 246 * (62 / 82)) / 82)
near('v4 date: gpPooled == gpCur', v4.gpPooled, 20)
near('v4 date: shots/gp is this season only', v4.shotsPg, 3)
near('v4 date: goals/gp is this season only', v4.goalsPg, 0.4)
eq('v4 date: no last-season weight', [v4.gpPrev, v4.prevWeight, v4.rookie], [0, 0, null])
eq('v4 date: toi is this season (5+ GP)', v4.toi, 1000)
const pr3 = pointRates(v3, cur, prev), pr4 = pointRates(v4, cur, null)
near('v3 date: pts/gp is pooled', pr3.ptsPg, (14 + 70 * (62 / 82)) / 82)
near('v4 date: pts/gp is this season only', pr4.ptsPg, 14 / 20)
near('v4 date: ast/gp is this season only', pr4.astPg, 6 / 20)

// ── the v3 rookie rule, now on this season alone ──
const r8 = lines('2026-10-18', { gp: 8, shots: 24, g: 4, toi: 1000, pts: 6, a: 2 })
eq('8 GP: ok, a rookie line', [r8.ok, r8.rookie?.games, r8.rookie?.priorGames], [true, 8, 10])
near('8 GP: shots/gp pulled toward the position average with 10 games of it', r8.shotsPg, (24 + 10 * 2.0) / 18)
near('8 GP: goals/gp pulled', r8.goalsPg, (4 + 10 * 0.2) / 18)
near('8 GP: pts/gp pulled', pointRates(r8, { gp: 8, pts: 6, a: 2 }, null).ptsPg, (6 + 10 * 0.5) / 18)
const r2 = lines('2026-10-18', { gp: 2, shots: 6, g: 1, toi: 1000 })
eq('2 GP: not ok, reason kept', [r2.ok, /fewer than 3 NHL games on file \(2\)/.test(r2.reason)], [false, true])
eq('2 GP on a v3 date WITH last season is still scored (old blend)', lines('2026-10-17', { gp: 2, shots: 6, g: 1, toi: 1000 }).ok, true)
eq('0 GP: not ok', lines('2026-10-18', null).ok, false)
const r10 = lines('2026-10-18', { gp: 10, shots: 25, g: 3, toi: 1000 })
eq('10 GP: the plain rate, no rookie pull', [r10.ok, r10.rookie, r10.shotsPg, r10.goalsPg], [true, null, 2.5, 0.3])
eq('no prior (position average missing) and 5 GP: not ok', pooledLegs({ gp: 5, shots: 10, g: 1 }, null, null).ok, false)

// ── the writers stamp the version of the GAME'S date ──
const g = { id: 2026020001, season: 20262027, gameType: 2, startUtc: '2026-10-18T23:00:00Z' }
const mk = (over = {}) => ({ playerId: 1, name: 'Test A', pos: 'C', team: 'AAA', opp: 'BBB', home: true, score: 50, rank: 1, status: 'called', pct: { shotsPg: 50, goalsPg: 50, toi: 50 }, legs: { ok: true, shotsPg: 2, goalsPg: 0.2, toi: 900, ptsPg: 0.5, astPg: 0.3, oppSaPg: 30, oppGaPg: 3, shPct: 0.1, gpPooled: 20, gpCur: 20, gpPrev: 0, prevWeight: 0 }, context: {}, ...over })
for (const [date, want] of [['2026-10-17', ['lamp-sog-v2', 'lamp-pts-v2', 'lamp-ast-v2', 'lamp-goalpos-v1', 'lamp-goalw-v1', 'goal2_site_v1']], ['2026-10-18', ['lamp-sog-v3', 'lamp-pts-v3', 'lamp-ast-v3', 'lamp-goalpos-v2', 'lamp-goalw-v2', 'goal2_site_v2']]]) {
  const day = { date }, at = `${date}T22:00:00Z`
  eq(`rows written for ${date}`, [toSogRow(mk(), g, day, at), toPtsRow(mk(), g, day, at), toAstRow(mk(), g, day, at), toGoalPosRow(mk(), g, day, at), toGoalWeightedRow(mk(), g, day, at), toGoal2Row(mk(), g, day, at)].map((r) => r.model_version), want)
}
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
