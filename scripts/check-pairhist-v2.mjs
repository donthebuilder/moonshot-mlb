// PAIR HISTORY v2, THE READER (2026-10-07). Checks lib/pairHistV2.js against a hand-built TEST FIXTURE.
// EVERY NUMBER BELOW IS TEST DATA (invented for this check, labelled TEST), never shown on the site.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-pairhist-v2.mjs
import assert from 'node:assert/strict'
import { readPairHistV2, pairHistRows, seasonLabel, coverageLine, daysBetween } from '../lib/pairHistV2.js'

const TEST_FILE = {
  model_version: 'pairhist_v2', sport: 'mlb', generated_at: '2026-10-07T12:00:00+00:00',
  seasons_covered: [2023, 2024, 2025, 2026], active_players: 4,
  pairs: [
    { pair_key: 'TEST1|TEST2', players: [{ player_id: 1, name: 'TEST One', team: 'AAA' }, { player_id: 2, name: 'TEST Two', team: 'BBB' }],
      joint_days: 200, joint_event_days: 12, same_game_event_days: 0, rate: 0.06, expected_joint: 10.5, lift: 1.14,
      seasons: { 2023: [50, 3], 2024: [50, 4], 2025: [50, 3], 2026: [50, 2] }, last_joint_date: '2026-09-30' },
    { pair_key: 'TEST1|TEST3', players: [{ player_id: 1, name: 'TEST One', team: 'AAA' }, { player_id: 3, name: 'TEST Three', team: 'AAA' }],
      joint_days: 180, joint_event_days: 12, same_game_event_days: 5, rate: 0.0667, expected_joint: 9, lift: 1.33,
      seasons: { 2024: [90, 6], 2025: [90, 6] }, last_joint_date: '2026-07-01' },
    { pair_key: 'TEST3|TEST4', players: [{ player_id: 3, name: 'TEST Three', team: 'AAA' }, { player_id: 4, name: 'TEST Four', team: 'CCC' }],
      joint_days: 150, joint_event_days: 20, same_game_event_days: 0, rate: 0.1333, expected_joint: 18, lift: 1.11,
      seasons: { 2023: [75, 10], 2025: [75, 10] }, last_joint_date: '2026-10-07' },
    { pair_key: 'broken', players: [{ player_id: 9, name: 'TEST Nine' }] },
  ],
}
let fails = 0
const t = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fails++; console.log(`FAIL ${name}\n     ${e.message}`) } }

t('reads only a pairhist_v2 file for the right sport', () => {
  assert.equal(readPairHistV2(TEST_FILE, 'mlb'), TEST_FILE)
  assert.equal(readPairHistV2(TEST_FILE, 'nhl'), null)
  assert.equal(readPairHistV2(null, 'mlb'), null)
  assert.equal(readPairHistV2({ ...TEST_FILE, model_version: 'pairhist_v1' }, 'mlb'), null)
  assert.equal(readPairHistV2({ ...TEST_FILE, pairs: 'x' }, 'mlb'), null)
})
t('a missing file gives no rows (the page says not published, never invents)', () => {
  assert.deepEqual(pairHistRows(null), [])
  assert.equal(coverageLine(null, 'mlb'), '')
})
t('rows rank by joint event days, then same game, then rate; a broken pair is dropped', () => {
  const rows = pairHistRows(TEST_FILE)
  assert.deepEqual(rows.map((r) => r._key), ['TEST3|TEST4', 'TEST1|TEST3', 'TEST1|TEST2'])
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3])
})
t('the row carries the bot numbers unchanged; rate is a percent with one decimal', () => {
  const r = pairHistRows(TEST_FILE).find((x) => x._key === 'TEST1|TEST2')
  assert.equal(r.jd, 200); assert.equal(r.je, 12); assert.equal(r.sg, 0)
  assert.equal(r.rate, 6); assert.equal(r.exp, 10.5); assert.equal(r.lift, 1.14)
  assert.equal(r.s2023, 3); assert.equal(r.s2026, 2)
})
t('a season the pair has no shared days in is blank, not zero', () => {
  const r = pairHistRows(TEST_FILE).find((x) => x._key === 'TEST1|TEST3')
  assert.equal(r.s2023, null); assert.equal(r.s2024, 6)
})
t('days before is measured from the file\'s own day, not the wall clock', () => {
  const rows = pairHistRows(TEST_FILE)
  assert.equal(rows.find((x) => x._key === 'TEST3|TEST4').ago, 0)
  assert.equal(rows.find((x) => x._key === 'TEST1|TEST2').ago, 7)
  assert.equal(daysBetween('2026-09-30', '2026-10-07'), 7)
})
t('search matches either name; same-game-only keeps only pairs that did it in one game', () => {
  assert.deepEqual(pairHistRows(TEST_FILE, { query: 'four' }).map((r) => r._key), ['TEST3|TEST4'])
  assert.deepEqual(pairHistRows(TEST_FILE, { sameGameOnly: true }).map((r) => r._key), ['TEST1|TEST3'])
})
t('season labels: calendar year for MLB and NFL, split year for the NHL', () => {
  assert.equal(seasonLabel('mlb', 2025), '2025'); assert.equal(seasonLabel('nfl', 2025), '2025'); assert.equal(seasonLabel('nhl', 2025), '25-26')
})
t('coverage line says how many seasons and how many active players', () => {
  assert.equal(coverageLine(TEST_FILE, 'mlb'), '4 seasons (2023 to 2026) · 4 active players · 4 pairs')
})
console.log(fails ? `\n${fails} failed` : '\nall ok')
process.exit(fails ? 1 : 0)
