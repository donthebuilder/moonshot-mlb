#!/usr/bin/env node
// THE PREGAME STARTING-GOALIE SOURCE (2026-10-09), checked on TEST DATA: made-up clubs, goalies and ids,
// a replaced fetch and a replaced id lookup. Nothing touches the network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-goalie-source.mjs
import assert from 'node:assert/strict'

const GS = await import('../lib/nhl/goalieSource.js')
const GL = await import('../lib/nhl/goalies.js')
const OG = await import('../lib/nhl/oppGoalie.js')

let failed = 0
const ok = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`) } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`) } }

const NOW = Date.parse('2026-10-09T17:00:00Z')
const DROP = '2026-10-09T23:00:00Z'
const prob = (name, type, id = '1') => [{ name: 'probableStartingGoalie', athlete: { id, fullName: name }, status: { type } }]
const event = ({ away = 'AAA', home = 'BBB', date = DROP, status = 'STATUS_SCHEDULED', ap, hp }) => ({
  date, status: { type: { name: status } },
  competitions: [{ date, competitors: [
    { homeAway: 'home', team: { abbreviation: home }, probables: hp },
    { homeAway: 'away', team: { abbreviation: away }, probables: ap },
  ] }],
})
let calls = 0
const feed = (events) => async () => { calls++; return { ok: true, status: 200, json: async () => ({ events }) } }
const game = (over = {}) => ({ id: 101, away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' }, startUtc: DROP, state: 'pre', ...over })
// TEST ids: the league's goalie lists for game 101
const goaliesFor = async () => ({ away: [{ id: 1001, first: 'Test', last: 'Awaygoalie' }, { id: 1002, first: 'Other', last: 'Awaygoalie' }], home: [{ id: 2001, first: 'Test', last: 'Homegoalie' }] })
const reset = () => { GS._resetForTests(); calls = 0 }

await ok('confirmed: ESPN says confirmed -> confirmed true, league id matched, source named', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') })])
  const r = await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  assert.equal(r[101].away.confirmed, true); assert.equal(r[101].away.id, 1001); assert.equal(r[101].away.source, 'espn')
  assert.equal(r[101].home.confirmed, true); assert.equal(r[101].home.id, 2001); assert.equal(r[101].gameId, 101); assert.ok(r[101].asOf)
})
await ok('probable: ESPN "expected" is NOT confirmed (ACCEPT_PROBABLE is off); the name is kept, no id looked up', async () => {
  reset()
  assert.equal(GS.ACCEPT_PROBABLE, false)
  const f = feed([event({ ap: prob('Test Awaygoalie', 'expected'), hp: prob('Test Homegoalie', 'confirmed') })])
  const r = await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  assert.equal(r[101].away.confirmed, false); assert.equal(r[101].away.id, null); assert.equal(r[101].home.confirmed, true)
})
await ok('probable: the switch (acceptProbable) turns "expected" into confirmed -- off by default, on only by the option', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'expected'), hp: prob('Test Homegoalie', 'expected') })])
  const r = await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor, acceptProbable: true })
  assert.equal(r[101].away.confirmed, true); assert.equal(r[101].home.confirmed, true)
})
await ok('missing: a game ESPN does not list, a listed game with no probables, and an unknown status give NO entry', async () => {
  reset()
  const f = feed([event({ away: 'CCC', home: 'DDD', ap: prob('Test X', 'confirmed'), hp: prob('Test Y', 'confirmed') }), event({}), event({ away: 'EEE', home: 'FFF', ap: prob('Test Z', 'maybe') })])
  const r = await GS.goalieSourceFor('2026-10-09', [game(), game({ id: 102, away: { abbrev: 'EEE' }, home: { abbrev: 'FFF' } })], { fetchImpl: f, now: NOW, goaliesFor })
  assert.deepEqual(r, {})
})
await ok('missing: a failed fetch throws out of the source and startersFor answers the empty map (never a guess)', async () => {
  reset()
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) })
  await assert.rejects(() => GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: bad, now: NOW, goaliesFor }))
  const s = await GL.startersFor('2026-10-09', [game()], { fetchImpl: bad, now: NOW, goaliesFor })
  assert.deepEqual(s, { source: null, byGame: {} })
  const boom = async () => { throw new Error('network down') }
  assert.deepEqual(await GL.startersFor('2026-10-09', [game()], { fetchImpl: boom, now: NOW }), { source: null, byGame: {} })
})
await ok('never pregame after the fact: a started game, and an ESPN event that is no longer scheduled, give no entry', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') })])
  assert.deepEqual(await GS.goalieSourceFor('2026-10-09', [game({ state: 'live' })], { fetchImpl: f, now: NOW, goaliesFor }), {})
  assert.deepEqual(await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: Date.parse(DROP) + 60e3, goaliesFor }), {})
  reset()
  const fin = feed([event({ status: 'STATUS_FINAL', ap: prob('Test Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') })])
  assert.deepEqual(await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: fin, now: NOW, goaliesFor }), {})
})
await ok('split squad / two events for one pairing: the start time picks one, an unresolvable pair is no data', async () => {
  reset()
  const early = '2026-10-09T19:00:00Z'
  const f = feed([event({ date: early, ap: prob('Test Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') }), event({ date: DROP, ap: prob('Other Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') })])
  const r = await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  assert.equal(r[101].away.name, 'Other Awaygoalie')
  reset()
  const dup = feed([event({ ap: prob('Test Awaygoalie', 'confirmed') }), event({ ap: prob('Other Awaygoalie', 'confirmed') })])
  assert.deepEqual(await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: dup, now: NOW, goaliesFor }), {})
})
await ok('id match: same last name and first initial, exactly one; ambiguous or absent is null (the name still shows)', () => {
  const gs = [{ id: 1, first: 'Joey', last: 'Daccord' }, { id: 2, first: 'Jon', last: 'Daccord' }]
  assert.equal(GS.matchGoalieId('Joey Daccord', [gs[0], { id: 3, first: 'Sam', last: 'Other' }]), 1)
  assert.equal(GS.matchGoalieId('Joey Daccord', gs), null)       // J. twice
  assert.equal(GS.matchGoalieId('Nobody Here', gs), null)
  assert.equal(GS.matchGoalieId('José Núñez', [{ id: 9, first: 'Jose', last: 'Nunez' }]), 9)
})
await ok('cache: one scoreboard fetch per date inside the TTL (a second call and a second game cost none); refetched after it', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'confirmed'), hp: prob('Test Homegoalie', 'confirmed') })])
  await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  await GS.goalieSourceFor('2026-10-09', [game(), game({ id: 103, away: { abbrev: 'X' } })], { fetchImpl: f, now: NOW + GS.TTL_MS - 1, goaliesFor })
  assert.equal(calls, 1)
  await GS.goalieSourceFor('2026-10-09', [game()], { fetchImpl: f, now: NOW + GS.TTL_MS + 1, goaliesFor })
  assert.equal(calls, 2)
  await GS.goalieSourceFor('2026-10-10', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  assert.equal(calls, 3)                                          // a different date is its own fetch
})
await ok('startersFor: the contract shape, an unconfirmed side is an entry with confirmed false, a game with no data has no entry', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'expected'), hp: prob('Test Homegoalie', 'confirmed') })])
  const s = await GL.startersFor('2026-10-09', [game(), game({ id: 102, away: { abbrev: 'ZZZ' } })], { fetchImpl: f, now: NOW, goaliesFor })
  assert.equal(s.source, 'espn')
  assert.equal(s.byGame[101].away.confirmed, false); assert.equal(s.byGame[101].home.confirmed, true); assert.equal(s.byGame[101].home.playerId, 2001)
  assert.equal(s.byGame[102], undefined)
})
await ok('the posts\' helper (lib/nhl/oppGoalie.js): confirmed passes, expected is pending, no data is a definite no', async () => {
  reset()
  const f = feed([event({ ap: prob('Test Awaygoalie', 'expected'), hp: prob('Test Homegoalie', 'confirmed') })])
  const s = await GL.startersFor('2026-10-09', [game()], { fetchImpl: f, now: NOW, goaliesFor })
  const mk = (starters) => ({ game: { startUtc: new Date(NOW + 6 * 3600e3).toISOString(), state: 'pre' }, starters })
  const homeSkater = { home: true }; const awaySkater = { home: false }
  // a HOME skater faces the AWAY goalie (expected): pending. An AWAY skater faces the HOME goalie (confirmed): clear.
  const held = OG.nhlGoalieProblem(mk(s.byGame[101]), homeSkater, 'h1')
  assert.ok(held && held.pending === true && /goalie/.test(held.reason))
  assert.equal(OG.nhlGoalieProblem(mk(s.byGame[101]), awaySkater, 'a1'), null)
  const none = OG.nhlGoalieProblem(mk(s.byGame[999]), homeSkater, 'h1')
  assert.ok(none && none.pending === false)
})
process.exit(failed ? 1 : 0)
