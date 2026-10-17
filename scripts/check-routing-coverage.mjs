#!/usr/bin/env node
// DRIFT GUARD for the routing table. node --import ./scripts/_esm-resolve.mjs scripts/check-routing-coverage.mjs
// Every kind that can reach Discord must be DECIDED: listed in lib/dash/routing.js (ROUTES / PREFIX_ROUTES) or in lib/dash/routingUnrouted.js
// (kept on its poster's old room rule on purpose, with a reason). A new kind added to xSchedule KIND_TAGS or passed to a Discord sender fails here.
// Kinds come from: xSchedule KIND_TAGS (retired ones never post, so they are skipped), MEMBERS_KINDS, the plays_<sport> kinds, and every
// `kind: '<x>'` / `KIND = '<x>'` string literal in an app/ or lib/ file that calls postToDiscord / postOnce / postMembers / sendMembers / sendFree.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { KIND_TAGS } = await import('../lib/dash/xSchedule.js')
const { ROUTES, PREFIX_ROUTES, routeOf } = await import('../lib/dash/routing.js')
const { UNROUTED } = await import('../lib/dash/routingUnrouted.js')
const { MEMBERS_KINDS } = await import('../lib/dash/membersPost.js')
const { playsKind } = await import('../lib/posts/sportPlans.js')
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }

const walk = (d, o = []) => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p, o); else if (/\.(js|mjs)$/.test(n)) o.push(p) } return o }
const SENDER = /\b(postToDiscord|postOnce|postMembers|sendMembers|sendFree)\(/
const found = new Map()   // kind -> where it was found
const add = (k, where) => { if (!found.has(k)) found.set(k, where) }
for (const [k, v] of Object.entries(KIND_TAGS)) if (v.mode !== 'retired') add(k, 'xSchedule KIND_TAGS')
for (const k of Object.values(MEMBERS_KINDS)) add(k, 'membersPost MEMBERS_KINDS')
for (const s of ['mlb', 'nfl', 'nhl', 'nba']) add(playsKind(s), 'sportPlans playsKind')
for (const f of [...walk(join(root, 'app')), ...walk(join(root, 'lib'))]) {
  const s = readFileSync(f, 'utf8')
  if (!SENDER.test(s)) continue
  for (const m of s.matchAll(/\bkind\s*[:=]\s*'([a-z][a-z0-9_]+)'|\b[A-Z_]*KIND[A-Z_]*\s*=\s*'([a-z][a-z0-9_]+)'/g)) add(m[1] || m[2], f.slice(root.length + 1))
}
// a family name (writeup_nfl, moment_mlb ...) is decided by its prefix route
const decided = (k) => Boolean(routeOf(k) || routeOf(`${k}_x`) || UNROUTED[k])
const undecided = [...found].filter(([k]) => !decided(k))
check(`every kind is decided (${found.size} checked)`, undecided.length === 0, undecided.map(([k, w]) => `${k} [${w}]`).join(', '))
// no kind is in both lists, and every unrouted entry has a reason
const both = Object.keys(UNROUTED).filter((k) => ROUTES[k])
check('no kind is both routed and unrouted', both.length === 0, both.join(', '))
const noWhy = Object.entries(UNROUTED).filter(([, v]) => !String(v?.why || '').trim()).map(([k]) => k)
check('every unrouted kind has a reason', noWhy.length === 0, noWhy.join(', '))
// an unrouted entry that nothing sends any more is stale
const stale = Object.keys(UNROUTED).filter((k) => !found.has(k))
check('no stale unrouted entries', stale.length === 0, stale.join(', '))
check('prefix routes still listed', PREFIX_ROUTES.length > 0)
if (undecided.length) console.log(`\nUndecided kinds: add each to lib/dash/routing.js (ROUTES) or lib/dash/routingUnrouted.js (with a reason):\n  ${undecided.map(([k]) => k).join('\n  ')}`)
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
