#!/usr/bin/env node
// TUDDY WITHOUT (lib/nfl/without.js). ALL DATA IS TEST DATA (made-up men Test Him / Test Star / Test Late, clubs AAA / BBB); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-without.mjs
import assert from 'node:assert/strict'
import { nflMates, gameKey, aggregateWithGp } from '../lib/nfl/without.js'
import { withoutLines, withoutScan, rankMates } from '../lib/nba/without.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const row = (w, tm, o = {}) => ({ s: 2026, w, tm, d: `2026-10-${String(w).padStart(2, '0')}`, g_td: 0, g_recyd: 0, g_ruyd: 0, g_payd: 0, g_rec: 0, g_car: 0, ...o })
const logs = { logs: {
  him: { log: [1, 2, 3, 4, 5, 6].map((w) => row(w, 'AAA', { g_recyd: w <= 2 ? 100 : 40, g_td: w <= 2 ? 1 : 0 })) },
  star: { log: [row(1, 'AAA', { g_recyd: 120 }), row(2, 'AAA', { g_recyd: 120 })] },                 // hurt after week 2: out weeks 3..6
  late: { log: [row(4, 'AAA', { g_recyd: 10 }), row(5, 'AAA', { g_recyd: 10 }), row(6, 'AAA', { g_recyd: 10 })] },   // joined in week 4: not out before
  gone: { log: [row(1, 'AAA', { g_recyd: 30 }), row(2, 'AAA', { g_recyd: 30 }), row(5, 'BBB', { g_recyd: 30 })] },   // traded: the gap is not counted
  sub: { log: [1, 2, 3, 5].map((w) => row(w, 'AAA', { g_recyd: 15 })) },                              // misses weeks 4 and 6
  rival: { log: [1, 2, 3].map((w) => row(w, 'BBB', { g_recyd: 500 })) },                               // another club: never his teammate
} }
const names = { him: 'Test Him', star: 'Test Star', late: 'Test Late', sub: 'Test Sub', gone: 'Test Gone', rival: 'Test Rival' }
const mates = nflMates(logs, names, 'him')
const by = Object.fromEntries(mates.map((m) => [m.name, m]))

t('teammates are the men on his club; a rival club\'s man and he himself are not', () => {
  assert.ok(!by['Test Rival'] && !by['Test Him'])
  assert.equal(mates[0].name, 'Test Star', 'most yards a game first (120)')
  assert.equal(by['Test Star'].ppg, 120); assert.equal(by['Test Star'].team, 'AAA')
})
t('out = the club played (he has a row) and the teammate has none, inside his window', () => {
  assert.deepEqual(by['Test Star'].out, ['2026-3', '2026-4', '2026-5', '2026-6'])
  assert.equal(by['Test Late'].out.length, 0, 'not out before he joined')
  assert.equal(by['Test Gone'].out.length, 0, 'traded away: the gap is not counted')
})
t('his line with / without the star, from his own rows (aggregateNflGames + gp)', () => {
  const games = logs.logs.him.log.map((r) => ({ ...r, id: gameKey(r) }))
  const l = withoutLines(games, [by['Test Star']], aggregateWithGp)
  assert.equal(l.with.gp, 2); assert.equal(l.without.gp, 4)
  assert.equal(l.with.recyd, 100); assert.equal(l.without.recyd, 40)
  assert.equal(l.with.td, 2); assert.equal(l.without.td, 0)
  assert.equal(withoutScan(games, mates, { agg: aggregateWithGp }).length, 2, 'the scan lists only men with games both in and out (the star and the sub)')
})
t('rankMates puts the man the injury layer has out first and labels two of one surname by initial', () => {
  const games = logs.logs.him.log.map((r) => ({ ...r, id: gameKey(r) }))
  const ids = new Set(games.map((g) => g.id))
  assert.equal(rankMates(mates, ids)[0].id, 'star', 'by yards a game when nobody is out')
  const ranked = rankMates(mates, ids, (m) => m.id === 'sub')
  assert.equal(ranked[0].id, 'sub'); assert.equal(ranked[0].tonight, true)
  assert.ok(ranked.every((m) => m.on.length && m.out.length), 'only men with games both in and out get a chip')
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: nfl without')
process.exit(failed ? 1 : 0)
