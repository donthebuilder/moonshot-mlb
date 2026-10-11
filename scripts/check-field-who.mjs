// Run: node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-field-who.mjs
// WHO LINES UP WHERE (lib/nfl/whoLines.js). Every number below is TEST DATA, labelled: it only proves the rules, it is not a stat.
import assert from 'node:assert/strict'
import { placeOffense, placeDefense, whoInZone, sideFor, sidesOf, MIN_PLAYS, MAX_FACES } from '../lib/nfl/whoLines.js'

const g = (o) => Object.fromEntries(Object.entries(o).map(([z, att]) => [z, { att }]))
// TEST DATA: club "TST"
const P = (id, position, name = `T.${id}`) => ({ player_id: id, name, team: 'TST', position, espn_id: '1' })
const players = [P('qb', 'QB'), P('rb1', 'RB'), P('rb2', 'RB'), P('wr1', 'WR'), P('wr2', 'WR'), P('wr3', 'WR'), P('wrx', 'WR'), P('te1', 'TE'), P('te2', 'TE'), P('out1', 'WR'), P('thin', 'WR'), P('qb2', 'QB')]
const matchup = {
  roles: { qb: 'QB', qb2: 'QB', rb1: 'RB1', rb2: 'RB2', wr1: 'WR1', wr2: 'WR2', wr3: 'WR3', wrx: 'Other WR', te1: 'TE1', te2: 'TE2', out1: 'WR1', thin: 'WR3' },
  snaps: { qb: { snap_pct: 99 }, qb2: { snap_pct: 3 } },
  field: {
    player_pass: {
      wr1: g({ 'left|short': 12, 'left|deep': 6, 'middle|short': 2 }),          // 18 of 20 left: placed by targets
      wr2: g({ 'right|short': 9, 'right|mid': 5, 'left|short': 3 }),            // right
      wr3: g({ 'left|short': 5, 'middle|short': 5, 'right|short': 5 }),         // spread: NOT placed
      thin: g({ 'right|short': 4 }),                                            // 4 plays: not enough
      te1: g({ 'left|short': 4, 'middle|short': 4, 'right|short': 4 }),         // spread TE: by role (right)
      out1: g({ 'left|short': 20 }),                                            // OUT: never placed
      rb1: g({ 'left|behind': 15 }),                                            // a back's targets are not where he stands
    },
    player_rush: { rb1: g({ 'middle|middle': 30, 'left|guard': 6 }), rb2: g({ 'right|tackle': 10, 'left|end': 2 }) },
  },
  pass_game: { corners: { DEF: [{ slot: 'LCB', gsis_id: 'c1', name: 'A. Left', games: 3 }, { slot: 'RCB', gsis_id: 'c2', name: 'B. Right', games: 3 }, { slot: 'NB', gsis_id: 'c3', name: 'C. Slot', games: 3 }] } },
}
const statusOf = (p) => (p.player_id === 'out1' || p.player_id === 'c2' ? { chip: 'OUT', word: 'Out', blocked: true } : null)

// passing
const pass = placeOffense({ matchup, players, off: 'TST', pass: true, statusOf })
const by = Object.fromEntries(pass.placed.map((m) => [m.id, m]))
assert.equal(by.wr1.side, 'left'); assert.equal(by.wr1.basis, 'targets')
assert.equal(by.wr2.side, 'right'); assert.equal(by.wr2.basis, 'targets')
assert.ok(!by.wr3, 'a receiver whose targets go everywhere is not placed'); assert.ok(pass.chips.some((c) => c.id === 'wr3' && c.reason === 'spread'))
assert.ok(!by.thin, 'under MIN_PLAYS is not placed')
assert.equal(by.te1.basis, 'role'); assert.equal(by.te1.side, 'right')
assert.equal(by.qb.basis, 'role'); assert.ok(!by.qb2, 'one QB only')
assert.equal(by.rb1.basis, 'role', 'a back in the passing view is by role, not by his target side')
assert.ok(!by.out1, 'an OUT man is never placed'); assert.ok(pass.chips.find((c) => c.id === 'out1')?.out)
assert.ok(!by.wrx, 'a depth man with no role is not placed')
for (const m of pass.placed) {
  assert.ok(['targets', 'carries', 'role'].includes(m.basis), `${m.id} has a basis`)
  if (m.basis !== 'role') { const s = sidesOf(matchup.field.player_pass[m.id]); assert.ok(s.n >= MIN_PLAYS && s.by[m.side] / s.n >= 0.5, `${m.id}'s side is his own majority`) }
}
assert.ok(pass.placed.length <= MAX_FACES)
// running
const run = placeOffense({ matchup, players, off: 'TST', pass: false, statusOf })
const rb = Object.fromEntries(run.placed.map((m) => [m.id, m]))
assert.equal(rb.rb1.basis, 'carries'); assert.equal(rb.rb1.side, 'middle')
assert.equal(rb.rb2.basis, 'carries'); assert.equal(rb.rb2.side, 'right')
assert.ok(!rb.wr1 && !rb.te1, 'no receivers in the running view')
// defence: only the chart's corners, the OUT one is a dimmed chip
const d = placeDefense({ matchup, def: 'DEF', statusOf })
assert.deepEqual(d.placed.map((m) => m.role).sort(), ['LCB', 'NB']); assert.ok(d.placed.every((m) => m.basis === 'chart'))
assert.ok(d.chips.length === 1 && d.chips[0].out && d.chips[0].role === 'RCB')
assert.equal(placeDefense({ matchup: {}, def: 'DEF' }).placed.length, 0, 'no corners published: nobody invented')
// zone filter, key-players side word
const z = whoInZone({ matchup, players, off: 'TST', pass: true, zone: 'left|short', statusOf })
assert.deepEqual(z.map((r) => r.id), ['wr1', 'wr3', 'te1'])
assert.ok(!z.some((r) => r.id === 'out1'), 'OUT man is not offered')
assert.equal(sideFor({ matchup, id: 'wr1', position: 'WR' }).word, 'Left')
assert.equal(sideFor({ matchup, id: 'wr3', position: 'WR' }).word, 'Spread')
assert.equal(sideFor({ matchup, id: 'te1', position: 'TE' }).basis, 'role')
assert.equal(sideFor({ matchup, id: 'rb1', position: 'RB' }).word, 'Backfield')
assert.equal(sideFor({ matchup, id: 'nobody', position: 'WR' }).word, '—')
console.log('check-field-who: ok')
