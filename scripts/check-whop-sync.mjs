#!/usr/bin/env node
// WHOP SYNC, CHECKED (2026-10-17). lib/members/whop.js. Plain node, TEST DATA only (every email / id / secret below is made up for this check).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-whop-sync.mjs
import { createHmac } from 'node:crypto'
const W = await import('../lib/members/whop.js')
const fails = []
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${msg}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }

// TEST secret + signing (Standard Webhooks)
const SECRET = 'whsec_' + Buffer.from('test-secret-not-real').toString('base64')
const NOW = Date.parse('2030-01-01T12:00:00Z')
const sign = (id, ts, body, secret = SECRET) => 'v1,' + createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')
const body = '{"type":"membership.activated","data":{}}'
const ts = String(NOW / 1000)
const hdr = (o) => ({ 'webhook-id': 'msg_test1', 'webhook-timestamp': ts, 'webhook-signature': sign('msg_test1', ts, body), ...o })
eq(W.verifyWhopSignature(body, hdr(), SECRET, { now: NOW }), true, 'good signature accepted')
eq(W.verifyWhopSignature(body + ' ', hdr(), SECRET, { now: NOW }), false, 'tampered body rejected')
eq(W.verifyWhopSignature(body, hdr({ 'webhook-signature': sign('msg_test1', ts, body, 'whsec_' + Buffer.from('other').toString('base64')) }), SECRET, { now: NOW }), false, 'wrong secret rejected')
eq(W.verifyWhopSignature(body, hdr({ 'webhook-signature': 'v1,AAAA ' + sign('msg_test1', ts, body) }), SECRET, { now: NOW }), true, 'one good of several accepted')
eq(W.verifyWhopSignature(body, hdr(), SECRET, { now: NOW + 10 * 60 * 1000 }), false, 'stale timestamp rejected')
eq(W.verifyWhopSignature(body, { 'webhook-id': 'x' }, SECRET, { now: NOW }), false, 'missing headers rejected')
eq(W.verifyWhopSignature(body, hdr(), '', { now: NOW }), false, 'no secret rejected')
eq(W.verifyWhopSignature(body, new Headers(hdr()), SECRET, { now: NOW }), true, 'Headers object works')

// mapping / decision (TEST memberships)
const mk = (status, extra = {}) => ({ id: 'mem_test', status, user: { email: ' Pat@Example.COM ' }, plan: { id: 'plan_test' }, renewal_period_end: '2030-01-10T00:00:00Z', cancel_at_period_end: false, ...extra })
const yes = (m) => W.isValidMapped(W.mapMembership(m), { now: NOW })
eq(W.mapMembership(mk('active')), { email: 'pat@example.com', status: 'active', plan: 'plan_test', valid_until: '2030-01-10T00:00:00.000Z', whop_membership_id: 'mem_test', cancel_at_period_end: false }, 'mapping')
eq(yes(mk('active')), true, 'active = member')
eq(yes(mk('trialing')), true, 'trialing = member')
eq(yes(mk('active', { cancel_at_period_end: true })), true, 'canceled at period end, period open = member')
eq(yes(mk('canceling')), true, 'canceling = member')
eq(yes(mk('active', { cancel_at_period_end: true, renewal_period_end: '2029-12-31T00:00:00Z' })), false, 'canceled at period end, period over = not')
for (const s of ['expired', 'canceled', 'past_due', 'completed', 'unresolved', 'drafted']) eq(yes(mk(s)), false, `${s} = not member`)
eq(W.mapMembership({ status: 'active', user: { email: 'nope' } }).email, '', 'bad email -> empty')
eq(W.decideFromEvent({ type: 'membership.deactivated', data: mk('active') }, { now: NOW }).valid, false, 'deactivated event = not member')
eq(W.decideFromEvent({ type: 'membership.activated', data: mk('trialing') }, { now: NOW }).valid, true, 'activated trial = member')
eq(W.decideFromEvent({ type: 'payment.succeeded', data: {} }), null, 'non-membership event ignored')
eq(W.emailTag('pat@example.com').length, 8, 'log tag is a short hash')
eq(W.emailTag('pat@example.com').includes('pat'), false, 'log tag hides the address')

// fake site_members table. rows: email -> {source,...}; hasColumns false simulates the SQL not being run.
function fakeDb(rows, hasColumns = true) {
  const colErr = { message: 'column site_members.source does not exist', code: '42703' }
  return { rows, from() {
    const q = { f: [], op: 'select', cols: '', payload: null }
    const run = () => {
      const needs = hasColumns ? false : (/source/.test(q.cols) || q.f.some(([k]) => k === 'source') || (q.payload && 'source' in q.payload))
      if (needs) return { data: null, error: colErr }
      const match = Object.entries(rows).filter(([e, r]) => q.f.every(([k, v]) => (k === 'email' ? e : r[k]) === v))
      if (q.op === 'delete') { for (const [e] of match) delete rows[e]; return { error: null } }
      if (q.op === 'upsert') { rows[q.payload.email] = { ...(rows[q.payload.email] || {}), ...q.payload }; return { error: null } }
      return { data: match.map(([email, r]) => ({ email, source: r.source ?? null })), error: null }
    }
    const api = { select(c) { q.cols = c; return api }, eq(k, v) { q.f.push([k, v]); return api }, delete() { q.op = 'delete'; return api }, upsert(p) { q.payload = p; q.op = 'upsert'; return api },
      maybeSingle() { const r = run(); return Promise.resolve(r.error ? r : { data: r.data[0] || null, error: null }) }, then(res, rej) { return Promise.resolve(run()).then(res, rej) } }
    return api
  } }
}
const dec = (email, valid) => ({ mapped: { ...W.mapMembership(mk('active')), email }, valid })

// idempotent add, then remove
let rows = {}; let db = fakeDb(rows)
eq((await W.applyDecision(db, dec('a@test.example', true))).action, 'added', 'first purchase adds')
eq((await W.applyDecision(db, dec('a@test.example', true))).action, 'updated', 'replay does not add twice')
eq(Object.keys(rows).length, 1, 'still one row')
eq(rows['a@test.example'].source, 'whop', 'row is marked whop')
eq((await W.applyDecision(db, dec('a@test.example', false))).action, 'removed', 'cancel removes')
eq((await W.applyDecision(db, dec('a@test.example', false))).action, 'noop', 'second cancel is a no-op')

// manual rows are never touched
rows = { 'friend@test.example': { source: null, note: 'friend' } }; db = fakeDb(rows)
eq((await W.applyDecision(db, dec('friend@test.example', false))).action, 'kept-manual', 'webhook cancel leaves a hand-added row')
eq((await W.applyDecision(db, dec('friend@test.example', true))).action, 'kept-manual', 'webhook buy does not overwrite a hand-added row')
eq(rows['friend@test.example'], { source: null, note: 'friend' }, 'manual row byte-for-byte unchanged')

// reconcile: fake Whop list
const page = (list) => async () => ({ ok: true, status: 200, json: async () => ({ data: list, page_info: { has_next_page: false } }) })
rows = { 'friend@test.example': { source: null }, 'gone@test.example': { source: 'whop' }, 'keep@test.example': { source: 'whop' } }; db = fakeDb(rows)
let out = await W.reconcileWhop(db, { apiKey: 'k', companyId: 'biz_test', now: new Date(NOW), fetchImpl: page([mk('active', { id: 'm1', user: { email: 'keep@test.example' } }), mk('trialing', { id: 'm2', user: { email: 'new@test.example' } }), mk('expired', { id: 'm3', user: { email: 'friend@test.example' } })]) })
eq([out.ok, out.added, out.removed], [true, 1, 1], 'reconcile adds 1 removes 1')
eq(Object.keys(rows).sort(), ['friend@test.example', 'keep@test.example', 'new@test.example'], 'reconcile result; friend (manual, expired on Whop) survives')
out = await W.reconcileWhop(db, { apiKey: 'k', companyId: 'biz_test', now: new Date(NOW), fetchImpl: page([mk('active', { user: { email: 'keep@test.example' } }), mk('trialing', { user: { email: 'new@test.example' } })]) })
eq([out.added, out.removed], [0, 0], 'reconcile is idempotent')
// failed list removes nobody; empty list removes nobody
out = await W.reconcileWhop(db, { apiKey: 'k', companyId: 'biz_test', fetchImpl: async () => ({ ok: false, status: 500 }) })
eq(out.ok, false, 'failed Whop call reports failure'); eq(Object.keys(rows).length, 3, 'failed Whop call removes nobody')
out = await W.reconcileWhop(db, { apiKey: 'k', companyId: 'biz_test', fetchImpl: page([]) })
eq(out.ok, false, 'empty list refused'); eq(Object.keys(rows).length, 3, 'empty list removes nobody')
eq((await W.reconcileWhop(db, {})).ok, false, 'no key -> not ok')
// columns absent (SQL not run yet): add basic rows, remove nothing
rows = { 'old@test.example': {} }; db = fakeDb(rows, false)
out = await W.reconcileWhop(db, { apiKey: 'k', companyId: 'biz_test', now: new Date(NOW), fetchImpl: page([mk('active', { user: { email: 'n2@test.example' } })]) })
eq([out.ok, out.removed], [true, 0], 'no columns: add-only'); eq(Object.keys(rows).sort(), ['n2@test.example', 'old@test.example'], 'no columns: old row kept, new added')
eq((await W.applyDecision(db, dec('old@test.example', false))).action, 'noop', 'no columns: cancel removes nothing')

if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1) }
console.log('check-whop-sync: ok')
