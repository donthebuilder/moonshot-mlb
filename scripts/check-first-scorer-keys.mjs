#!/usr/bin/env node
// lib/ledger/firstScorers.js onePerGame: a game is listed once, so the Ledger's list keys (`day|gameId`) are unique.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-first-scorer-keys.mjs
// TEST rows (made-up players, labelled): the shape that made LAMP log "two children with the same key".
import assert from 'node:assert/strict'
const { onePerGame } = await import('../lib/ledger/firstScorers.js')
const rows = [
  { day: '2026-10-06', gameId: '9990000001', name: 'TEST A' },
  { day: '2026-10-06', gameId: '9990000001', name: 'TEST B (duplicate row for the same game)' },
  { day: '2026-10-06', gameId: '9990000002', name: 'TEST C' },
  { day: '2026-10-07', gameId: '9990000001', name: 'TEST D (same id, another day is another game)' },
]
const out = onePerGame(rows)
assert.deepEqual(out.map((r) => r.name), ['TEST A', 'TEST C', 'TEST D (same id, another day is another game)'])
assert.equal(new Set(out.map((r) => `${r.day}|${r.gameId}`)).size, out.length)
console.log('ok  firstScorers: one row per game, keys unique')
