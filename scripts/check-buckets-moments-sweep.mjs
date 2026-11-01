#!/usr/bin/env node
// BUCKETS MOMENTS: pending rows are posted again, stale ones expire (batch 3, 2026-10-26). TEST data.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-buckets-moments-sweep.mjs
import fs from 'node:fs'
let n = 0, bad = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
let S = null
try { S = await import('../lib/nba/momentsSweep.js') } catch { /* before the fix there is no module */ }
const NOW = Date.parse('2026-10-26T23:00:00Z')
const row = (id, o = {}) => ({ game_id: `g${id}`, player_id: `p${id}`, kind: '30_piece', name: `Test ${id}`, season_type: 2, status: 'called', ...o })
const games = [{ id: 'g1', state: 'live', start: '2026-10-26T22:00:00Z' }, { id: 'g2', state: 'final', start: '2026-10-26T16:00:00Z' }, { id: 'g3', state: 'final', start: '2026-10-26T21:00:00Z' }, { id: 'g4', state: 'live', start: '2026-10-26T22:30:00Z' }]
const iso = (min) => new Date(NOW - min * 60e3).toISOString()
const key = (r) => `${r.game_id}|${r.player_id}|${r.kind}`
const run = (derived, stored, written) => S.momentCandidates({ derived, stored: new Map(stored), written: new Set(written), games, now: NOW })

ok(S !== null, 'the sweep module exists')
if (S) {
  const a = row(1), b = row(2), c = row(3), d = row(4)
  let r = run([a], [], [key(a)])
  ok(r.post.length === 1 && r.post[0] === a, 'a NEW row of a live game posts')
  r = run([a], [[key(a), { x_post_id: null, seen_at: iso(5) }]], [])
  ok(r.post.length === 1, 'PENDING: a row stored 5 minutes ago (posting was off, or the tick died before the claim) posts on the next tick')
  r = run([a], [[key(a), { x_post_id: null, seen_at: iso(180) }]], [])
  ok(r.post.length === 0 && r.expired.length === 1 && /too long/.test(r.expired[0].why), 'a pending row older than the late-alert window EXPIRES (closed, never posted late)')
  r = run([b], [], [key(b)])
  ok(r.post.length === 0 && r.expired.length === 1 && /ended long ago/.test(r.expired[0].why), 'a NEW row of a game that ended hours ago does not post (no backlog dump after an outage)')
  r = run([c], [], [key(c)])
  ok(r.post.length === 1, 'a game that ended recently still posts')
  for (const v of ['skipped', 'posting', '123456']) { r = run([d], [[key(d), { x_post_id: v, seen_at: iso(5) }]], []); ok(r.post.length === 0 && r.expired.length === 0, `a row with x_post_id ${v} is never touched`) }
  r = run([row(5, { season_type: 1 })], [], ['g5|p5|30_piece'])
  ok(r.post.length === 0 && r.expired.length === 0, 'preseason is recorded, never posted')
  r = run([a], [], [])
  ok(r.post.length === 0, 'a row the upsert did not insert (a racing tick owns it) is left alone')
}
const route = fs.readFileSync('app/api/buckets/moments/route.js', 'utf8')
ok(/momentCandidates\(/.test(route) && /settleAlert\(/.test(route), 'the route posts from momentCandidates and settles X refusals with xFail.settleAlert')
ok(!/for \(const r of fresh\.filter\(isNew\)\)/.test(route), 'the route no longer posts only the rows it just inserted')
console.log(bad ? `${bad}/${n} FAILED` : `check-buckets-moments-sweep: ${n} checks passed`)
process.exit(bad ? 1 : 0)
