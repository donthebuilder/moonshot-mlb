#!/usr/bin/env node
// TUDDY TRENDING DVP (lib/nfl/trending.js defenseIndex). ALL DATA IS TEST DATA (made-up men Test A.., clubs AAA/BBB/CCC); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-trending-dvp.mjs
import assert from 'node:assert/strict'
import { defenseIndex, tuddyTrendingRows } from '../lib/nfl/trending.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const NOW = Date.parse('2026-10-30T12:00:00Z')
const data = {
  games: [{ game_id: 'g1', home: 'AAA', away: 'BBB', kickoff: '2026-11-01T18:00:00Z' }],
  players: [
    { player_id: 'p1', name: 'Test A', team: 'AAA', position: 'WR' },
    { player_id: 'p2', name: 'Test B', team: 'CCC', position: 'WR' },     // WR who faced BBB
    { player_id: 'p3', name: 'Test C', team: 'CCC', position: 'RB' },     // RB who faced BBB: must not count for a WR
    { player_id: 'p4', name: 'Test D', team: 'CCC', position: 'WR' },     // WR who faced BBB LAST season: must not count
  ],
}
const row = (s, w, opp, rec) => ({ s, w, opp, g_rec: rec, h: 1 })
const logs = { logs: {
  p1: { log: [row(2026, 1, 'CCC', 3), row(2026, 2, 'CCC', 6), row(2026, 3, 'CCC', 7)] },
  p2: { log: [row(2026, 4, 'BBB', 9), row(2026, 6, 'BBB', 2)] },
  p3: { log: [row(2026, 5, 'BBB', 20)] },
  p4: { log: [row(2025, 9, 'BBB', 15), row(2026, 7, 'BBB', 5)] },
} }

t('defenseIndex: same position, this season only, newest week first', () => {
  const idx = defenseIndex({ data, logs })
  assert.deepEqual(idx.get('BBB|WR').map((x) => x.g_rec), [5, 2, 9])
  assert.deepEqual(idx.get('BBB|RB').map((x) => x.g_rec), [20])
})
t('a trending row carries the defense\'s values at his spot (DVP) for the lane', () => {
  const odds = { by_player_id: { p1: { player_receptions: { line: 4.5, best_over: 110 } } } }
  const rows = tuddyTrendingRows({ data, logs, odds, now: NOW })
  const r = rows.find((x) => x.id === 'p1' && x.lane === 'REC')
  assert.ok(r, 'the row exists')
  assert.equal(r.opp, 'BBB')
  assert.deepEqual([r.dvp.Season.ok, r.dvp.Season.n], [2, 3], 'WRs over 4.5 vs BBB: 5 and 9 of [5,2,9]')
})
t('no defense data for a club -> dvp stays null (the page prints a dash)', () => {
  const odds = { by_player_id: { p2: { player_receptions: { line: 4.5, best_over: 110 } } } }
  const d2 = { ...data, games: [{ game_id: 'g2', home: 'CCC', away: 'ZZZ', kickoff: '2026-11-01T18:00:00Z' }] }
  const r = tuddyTrendingRows({ data: d2, logs, odds, now: NOW }).find((x) => x.id === 'p2')
  assert.equal(r.dvp, null)
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: tuddy trending dvp')
process.exit(failed ? 1 : 0)
