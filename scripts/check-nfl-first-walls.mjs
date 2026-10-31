#!/usr/bin/env node
// TUDDY'S FIRST-TD WALL FROM opening_games (lib/ledger/firstScorers.js nflOpeningWalls). ALL DATA IS TEST DATA (clubs AAA / BBB, made-up men); a fake db; no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-first-walls.mjs
import assert from 'node:assert/strict'
import { readFirstScorers } from '../lib/ledger/firstScorers.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const GAMES = [
  { sport: 'nfl', game_id: 'g3', game_date: '2026-10-25', season: 2026, season_type: 2, home: 'AAA', away: 'BBB', first_score_team: 'AAA', first_score_player: 'p-a', first_score_name: 'Test Alpha' },
  { sport: 'nfl', game_id: 'g2', game_date: '2026-10-18', season: 2026, season_type: 2, home: 'BBB', away: 'AAA', first_score_team: 'AAA', first_score_player: null, first_score_name: 'Test Nobody' },     // id never resolved
  { sport: 'nfl', game_id: 'g1', game_date: '2025-12-01', season: 2025, season_type: 2, home: 'AAA', away: 'BBB', first_score_team: 'BBB', first_score_player: 'p-b', first_score_name: 'Test Bravo' },
  { sport: 'nfl', game_id: 'g0', game_date: '2025-09-07', season: 2025, season_type: 2, home: 'AAA', away: 'BBB', first_score_team: null, first_score_player: null, first_score_name: null },                 // no TD at all
  { sport: 'nfl', game_id: 'g-old', game_date: '2024-09-07', season: 2024, season_type: 2, home: 'AAA', away: 'BBB', first_score_team: 'AAA', first_score_player: 'p-old', first_score_name: 'Test Old' }, // two seasons back: left out
]
const fakeDb = {
  from: (table) => {
    let rows = table === 'opening_games' ? GAMES.slice() : []
    const q = {
      select: () => q, eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return q }, in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return q },
      order: (k, o) => { rows = rows.slice().sort((a, b) => (a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : 0)); return q }, limit: () => q,
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      then: (res) => res({ data: rows, error: null }),
      gte: () => q, lte: () => q, not: () => q, or: () => q, is: () => q,
    }
    return q
  },
}

await t('the wall reads this season and last from opening_games, each club newest first: [first TD 1|0|null, no ring, the scorer\'s id when it was this club\'s]', async () => {
  const w = (await readFirstScorers(fakeDb, 'nfl', { day: '2026-10-30', since: '2026-10-23', seasonSince: '2026-09-01', walls: true })).walls
  assert.deepEqual(w.teams.AAA, [[1, null, 'p-a'], [1, null, null], [0, null, null], [null, null, null]])
  assert.deepEqual(w.teams.BBB, [[0, null, null], [0, null, null], [1, null, 'p-b'], [null, null, null]])
})
await t('names come from ESPN\'s scoring play, faces only for men whose id resolved; a two-seasons-old game is left out', async () => {
  const w = (await readFirstScorers(fakeDb, 'nfl', { day: '2026-10-30', since: '2026-10-23', seasonSince: '2026-09-01', walls: true })).walls
  assert.equal(w.names['p-a'], 'Test Alpha'); assert.equal(w.names['p-b'], 'Test Bravo')
  assert.ok(!w.names['p-old'] && !w.faces['p-old'])
  assert.deepEqual(Object.keys(w.faces).sort(), ['p-a', 'p-b'])
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: nfl first walls')
process.exit(failed ? 1 : 0)
