// node --import ./scripts/_esm-resolve.mjs scripts/check-nba-first-grade.mjs
// BUCKETS first-basket grading (Donovan, 2026-10-06): a first-basket call grades
// by who scored, whatever his minutes; every other market keeps the <10 min void.
// ALL DATA BELOW IS TEST DATA (invented players), not real results.
import { gradeNba } from '../lib/nba/model.js'
let bad = 0
const eq = (name, got, want) => { const ok = Object.entries(want).every(([k, v]) => got[k] === v); if (!ok) { bad++; console.log(`FAIL ${name}`, got) } else console.log(`ok   ${name}`) }
const TEST_FIRSTS = { firstFieldGoal: { player_id: 'T1' }, firstPoints: { player_id: 'T2' } }
const box = (o) => ({ dnp: false, starter: true, min: 30, pts: 20, reb: 5, ast: 5, ...o })
eq('scorer 8 min -> first hit', gradeNba('first', { playerId: 'T1' }, box({ min: 8 }), TEST_FIRSTS), { hit: true, actual: 1, void_reason: null })
eq('scorer no box line -> first hit', gradeNba('first', { playerId: 'T1' }, undefined, TEST_FIRSTS), { hit: true, actual: 1, void_reason: null })
eq('first_pts scorer 8 min -> hit', gradeNba('first', { playerId: 'T2', firstKey: 'firstPoints' }, box({ min: 8 }), TEST_FIRSTS), { hit: true, void_reason: null })
eq('first_pts: T1 (fg scorer, not pts scorer) -> miss', gradeNba('first', { playerId: 'T1', firstKey: 'firstPoints' }, box({ min: 30 }), TEST_FIRSTS), { hit: false, actual: 0 })
eq('same scorer, pts market, 8 min -> void', gradeNba('pts', { playerId: 'T1' }, box({ min: 8 }), TEST_FIRSTS), { hit: null, void_reason: 'played 8 minutes (under 10)' })
eq('non-scorer 8 min -> void', gradeNba('first', { playerId: 'T3' }, box({ min: 8 }), TEST_FIRSTS), { hit: null, void_reason: 'played 8 minutes (under 10)' })
eq('non-scorer 30 min -> miss', gradeNba('first', { playerId: 'T3' }, box(), TEST_FIRSTS), { hit: false, actual: 0 })
eq('non-scorer no box -> did not play', gradeNba('first', { playerId: 'T3' }, undefined, TEST_FIRSTS), { played: false, void_reason: 'did not play' })
eq('non-scorer non-starter -> void', gradeNba('first', { playerId: 'T3' }, box({ starter: false }), TEST_FIRSTS), { void_reason: 'did not start' })
eq('no basket in feed -> void', gradeNba('first', { playerId: 'T3' }, box(), {}), { void_reason: 'no made basket in the feed' })
eq('numeric scorer id vs string row id', gradeNba('first', { playerId: '77' }, box({ min: 5 }), { firstFieldGoal: { player_id: 77 } }), { hit: true })
process.exit(bad ? 1 : 0)
