// CHECK: the MLB calibration table (lib/calibration/mlbCalibration.js).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-calibration.mjs
// Every fixture below is TEST data (labelled), never a real player or game.
// Proves: hit / n per tier on each tier's own bar, voids and not-final set
// aside (never misses), a row stamped at or after first pitch is not a call,
// a tier under MIN_N prints no rate, every tier carries its n, regular and
// postseason are apart, spring is out, the lock lead is first pitch minus the stamp.
await import('./_esm-resolve.mjs')
const { gradeNight, summarize, callsOf, callRolesOf, MIN_N, TIERS } = await import('../lib/calibration/mlbCalibration.js')
const { finalOutcomes, played } = await import('../lib/record/mlbLocked.js')

let fails = 0
const ok = (cond, msg) => { if (!cond) { fails += 1; console.log(`  FAIL ${msg}`) } else console.log(`  ok   ${msg}`) }

const T0 = Date.parse('2026-09-20T23:00:00Z')            // TEST first pitch
const iso = (ms) => new Date(ms).toISOString()
const games = new Map([
  ['9001', { start: T0, type: 'R', state: 'Final', date: '2026-09-20' }],
  ['9002', { start: T0, type: 'D', state: 'Final', date: '2026-09-20' }],        // TEST postseason game
  ['9003', { start: T0, type: 'S', state: 'Final', date: '2026-09-20' }],        // TEST spring game
  ['9004', { start: T0, type: 'R', state: 'Postponed', date: '2026-09-20' }],
])
let seq = 0
const por = (pk, role, o = {}) => { seq += 1; return { game_pk: pk, player_id: 1000 + seq, player: `TEST Hitter ${seq}`, team: 'TST', opp: 'OPP', game_pick_role: role, generated_at: iso(T0 - (o.leadMin ?? 30) * 60000), hr_overlay: { qualified_tiers: o.tiers || [] } } }
const out = (r, line = {}, o = {}) => ({ game_pk: r.game_pk, player_id: r.player_id, is_final: o.final ?? true, revision: o.rev ?? 1, void: o.void ?? false,
  plate_appearances: o.pa ?? 4, home_runs: line.hr ?? 0, hits: line.hits ?? 0, runs: line.runs ?? 0, rbi: line.rbi ?? 0, total_bases: line.tb ?? 0 })

// ── fixture A: 40 TOP calls (10 homered), 3 TOP voids, 2 not final, 1 late ──────────────────
const rowsA = [], outsA = []
for (let i = 0; i < 40; i += 1) { const r = por('9001', 'TOP'); rowsA.push(r); outsA.push(out(r, { hr: i < 10 ? 1 : 0, hits: i < 10 ? 1 : 0, tb: i < 10 ? 4 : 0 })) }
for (let i = 0; i < 3; i += 1) { const r = por('9001', 'TOP'); rowsA.push(r); outsA.push(out(r, {}, { void: true, pa: 0 })) }          // void
{ const r = por('9001', 'TOP'); rowsA.push(r); outsA.push(out(r, { hr: 1 }, { pa: 0 })) }                                           // 0 PA: void even though a stat was keyed
for (let i = 0; i < 2; i += 1) { const r = por('9001', 'TOP'); rowsA.push(r) }                                                     // no outcome yet: pending
{ const r = por('9001', 'TOP', { leadMin: -5 }); rowsA.push(r); outsA.push(out(r, { hr: 1 })) }                                      // stamped 5 min AFTER first pitch
{ const r = por('9001', 'TOP'); rowsA.push(r); outsA.push(out(r, {}, { final: false })) }                                           // outcome not final: pending
// a later FINAL revision wins over an earlier one
{ const r = por('9001', 'HR'); rowsA.push(r); outsA.push(out(r, { hr: 0 }, { rev: 1 })); outsA.push(out(r, { hr: 1 }, { rev: 2 })) }
// slash role: two calls, each on its own bar
{ const r = por('9001', 'HRR/CONTACT/WATCH'); rowsA.push(r); outsA.push(out(r, { hits: 1, runs: 1, rbi: 0, tb: 1 })) }               // HRR cleared (H+R+RBI = 2), CONTACT missed (TB 1)
// a model-tier member
{ const r = por('9001', 'WATCH', { tiers: ['hr_overlay', 'power_overlay', 'not_a_tier'] }); rowsA.push(r); outsA.push(out(r, { hr: 1 })) }
// postseason and spring rows
{ const r = por('9002', 'TOP'); rowsA.push(r); outsA.push(out(r, { hr: 1 })) }
{ const r = por('9003', 'TOP'); rowsA.push(r); outsA.push(out(r, { hr: 1 })) }
{ const r = por('9004', 'TOP'); rowsA.push(r) }                                                                                      // postponed game: set aside as void
// a row for a game the schedule does not know
{ const r = por('9999', 'TOP'); rowsA.push(r) }
// a duplicate player-game row is one call
rowsA.push({ ...rowsA[0] })

const A = gradeNight({ date: '2026-09-20', por: rowsA, outcomes: finalOutcomes(outsA), games })
const S = summarize(A.entries)
const reg = S.regular, post = S.post
const tier = (b, k) => b.tiers.find((t) => t.key === k)

console.log('graded rows and the denominator')
ok(A.other.spring === 1 && A.other.noGame === 1, 'spring row and unknown-game row are out of every table')
ok(tier(reg, 'TOP').n === 40 && tier(reg, 'TOP').hits === 10 && tier(reg, 'TOP').misses === 30, `TOP is 10/40 (got ${tier(reg, 'TOP').hits}/${tier(reg, 'TOP').n})`)
ok(tier(reg, 'TOP').void === 4 + 1, `TOP voids = 3 void + 1 zero-PA + 1 postponed game (got ${tier(reg, 'TOP').void})`)
ok(tier(reg, 'TOP').pending === 3, `TOP pending = 2 no outcome + 1 not final (got ${tier(reg, 'TOP').pending})`)
ok(tier(reg, 'TOP').late === 1, 'TOP late = the one row stamped after first pitch')
ok(tier(reg, 'HR').n === 1 && tier(reg, 'HR').hits === 1, 'a later final revision wins (HR call cleared)')
ok(tier(reg, 'HRR').n === 1 && tier(reg, 'HRR').hits === 1, 'HRR bar = H+R+RBI >= 2')
ok(tier(reg, 'CONTACT').n === 1 && tier(reg, 'CONTACT').hits === 0, 'CONTACT bar = TB >= 2 (1 TB misses); "HRR/CONTACT/WATCH" is two calls')
ok(tier(reg, 'hr_overlay').n === 1 && tier(reg, 'power_overlay').n === 1 && tier(reg, 'premium_power').n === 0, 'model tiers read the row, unknown tier names ignored')
ok(tier(post, 'TOP').n === 1 && tier(post, 'TOP').hits === 1, 'postseason game is its own table')
ok(reg.board === 40 + 1 + 1 + 1, `board = every graded locked hitter in the season (got ${reg.board})`)
ok(callRolesOf('HIT/CONTACT') + '' === 'HIT,CONTACT' && callRolesOf('WATCH') .length === 0 && callRolesOf('TOP15').length === 0, 'WATCH / TOP15 are not calls (lib/callStatus CALL_ROLES)')
ok(played({ plate_appearances: 0 }) === false && played({ plate_appearances: 1, void: true }) === false && played({ plate_appearances: 1 }) === true, 'played(): void or 0 PA is not a game line')

console.log('small-n suppression and n on every row')
ok(MIN_N === 30, 'minimum is 30 calls')
ok(tier(reg, 'TOP').enough && tier(reg, 'TOP').rate === 25, 'TOP (n=40) prints 25%')
ok(tier(reg, 'HR').rate === null && tier(reg, 'HR').enough === false && tier(reg, 'HR').lift === null, 'HR (n=1) prints no rate and no lift')
ok(tier(post, 'TOP').rate === null, 'a postseason tier under 30 prints no rate')
ok(S.regular.tiers.every((t) => Number.isInteger(t.n) && Number.isInteger(t.hits) && Number.isInteger(t.misses) && t.hits + t.misses === t.n), 'every tier carries n, hits, misses (regular)')
ok(S.post.tiers.every((t) => Number.isInteger(t.n)), 'every tier carries n (postseason)')
ok(S.regular.tiers.every((t) => (t.rate === null) === (t.n < MIN_N)), 'a rate exists exactly when n >= MIN_N')
ok(summarize(A.entries, { minN: 1 }).regular.tiers.find((t) => t.key === 'HR').rate === 100, 'the minimum is a parameter, not a typed rate')
{ const t = tier(reg, 'TOP'); ok(t.board.hits === 12 && t.board.n === 43, `board 1+ HR = 10 TOP + the HR call + the model-tier man = 12 of 43 (got ${t.board.hits}/${t.board.n})`) }

console.log('lock time')
ok(tier(reg, 'TOP').lead.median === 30 && tier(reg, 'TOP').lead.min === 30, 'lead = first pitch minus stamp, in minutes (30)')
ok(A.entries.filter((e) => e.status === 'late').every((e) => e.leadMin <= 0), 'every late row is stamped at or after first pitch')
ok(callsOf(A.entries, 'TOP', 'regular').every((c) => c.lockAt < c.firstPitch && c.leadMin > 0), 'every listed call was stamped before first pitch')
ok(callsOf(A.entries, 'TOP', 'regular').length === tier(reg, 'TOP').n, 'the call list is exactly the n in the table')
ok(callsOf(A.entries, 'TOP', 'regular').filter((c) => c.hit).length === tier(reg, 'TOP').hits, 'the call list carries the misses too, and its hits equal the table')
ok(reg.lateNights.length === 0, 'a night with some on-time rows is not a late night')

console.log('a night written entirely after first pitch is not in the table')
{ const rows = [por('9001', 'TOP', { leadMin: -60 }), por('9001', 'HIT', { leadMin: -60 })]
  const o2 = finalOutcomes(rows.map((r) => out(r, { hr: 1, hits: 1 })))
  const B = summarize(gradeNight({ date: '2026-09-20', por: rows, outcomes: o2, games }).entries)
  ok(tier(B.regular, 'TOP').n === 0 && B.regular.lateNights[0] === '2026-09-20', 'every row late -> n=0 and the night is named') }

console.log('proof rule')
{ const { proofOf } = await import('../lib/calibration/proof.js')
  ok(proofOf({ all: { n: 29, hits: 10 }, chosen: '2026-01-01', after: { n: 29, hits: 20 }, boardAfter: { n: 100, hits: 10 } }).state === 'few', 'under 30 calls is "not enough calls yet"')
  ok(proofOf({ all: { n: 100, hits: 40 }, chosen: null }).state === 'testing', 'no chosen date is TESTING by definition')
  ok(proofOf({ all: { n: 100, hits: 40 }, chosen: '2026-01-01', after: { n: 20, hits: 10 }, boardAfter: { n: 200, hits: 20 } }).state === 'testing', 'hold-out under 30 is TESTING')
  ok(proofOf({ all: { n: 100, hits: 40 }, chosen: '2026-01-01', after: { n: 40, hits: 8 }, boardAfter: { n: 400, hits: 80 } }).state === 'testing', 'hold-out that does not beat the board is TESTING')
  ok(proofOf({ all: { n: 100, hits: 40 }, chosen: '2026-01-01', after: { n: 40, hits: 12 }, boardAfter: { n: 400, hits: 40 } }).state === 'proven', '30+ calls and 30+ hold-out calls that beat the board is PROVEN')
  ok(S.regular.tiers.every((t) => t.proof.state !== 'proven'), 'every MLB tier is TESTING or few today (no chosen date)') }
console.log(TIERS.length === 8 ? '  ok   8 tiers (5 calls + 3 model tiers)' : '  FAIL tier count')
if (TIERS.length !== 8) fails += 1
console.log(fails ? `\n${fails} FAILED` : '\nALL OK')
process.exit(fails ? 1 : 0)
