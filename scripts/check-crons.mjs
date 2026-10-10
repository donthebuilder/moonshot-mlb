#!/usr/bin/env node
// CRON BUDGET + BUCKETS EXPOSURE CHECKS (2026-10-09). Plain node, no network.
//   node scripts/check-crons.mjs [--table]
// 1. every vercel.json cron path is a real route, no entry is listed twice
// 2. the BUCKETS-only entries parked in scripts/cron-restore-buckets.json are NOT also in vercel.json
// 3. invocations per day (a week averaged) are counted per path and in total, under a ceiling
// 4. BUCKETS stays hidden: NBA never falls back to another sport's Discord list, the homer feed carries
//    no NBA post while BUCKETS_PUBLIC is off, the totals post for NBA is held, and the RLS migration
//    closes the anon read of NBA rows (top_totals_calls, writeup_nba_*, nba_* feed kinds)
import fs from 'node:fs'
import assert from 'node:assert/strict'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const cfg = JSON.parse(read('vercel.json'))
const restore = JSON.parse(read('scripts/cron-restore-buckets.json'))
let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`) } }

// ── a five-field cron's count of firings in a week ──
function field(src, lo, hi) {
  const out = new Set()
  for (const part of src.split(',')) {
    const [range, step] = part.split('/')
    let a = lo; let b = hi
    if (range !== '*') { const [x, y] = range.split('-').map(Number); a = x; b = y === undefined ? (step ? hi : x) : y }
    for (let v = a; v <= b; v += step ? Number(step) : 1) out.add(v)
  }
  return out
}
const perWeek = (schedule) => {
  const [mi, h, dom, mo, dow] = schedule.split(/\s+/)
  assert.ok(dom === '*' && mo === '*', `${schedule}: only day-of-week crons are counted here`)
  const days = dow === '*' ? 7 : field(dow, 0, 6).size
  return field(mi, 0, 59).size * field(h, 0, 23).size * days
}
const perDay = (schedule) => perWeek(schedule) / 7

const byPath = new Map()
for (const c of cfg.crons) byPath.set(c.path, (byPath.get(c.path) || 0) + perDay(c.schedule))
const total = [...byPath.values()].reduce((a, b) => a + b, 0)
if (process.argv.includes('--table')) {
  for (const [p, n] of [...byPath].sort((a, b) => b[1] - a[1])) console.log(`${String(Math.round(n)).padStart(6)}/day  ${p}`)
  console.log(`${String(Math.round(total)).padStart(6)}/day  TOTAL`)
}

ok('every cron path is a route', () => {
  for (const c of cfg.crons) assert.ok(fs.existsSync(new URL(`../app${c.path}/route.js`, import.meta.url)), `no route for ${c.path}`)
})
ok('no cron listed twice', () => {
  const seen = new Set()
  for (const c of cfg.crons) { const k = `${c.path} ${c.schedule}`; assert.ok(!seen.has(k), `duplicate ${k}`); seen.add(k) }
})
ok('parked BUCKETS crons are not also live', () => {
  const live = new Set(cfg.crons.map((c) => `${c.path} ${c.schedule}`))
  for (const c of restore.crons) assert.ok(!live.has(`${c.path} ${c.schedule}`), `${c.path} ${c.schedule} is in both files`)
})
ok(`cron invocations a day under the ceiling (now ${Math.round(total)})`, () => {
  assert.ok(total <= 4800, `${Math.round(total)} a day`)
})

// ── BUCKETS stays hidden ──
const dc = await import('../lib/dash/discordChannels.js')
const reset = () => { for (const k of ['DISCORD_HOMER_WEBHOOK', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_NBA_WEBHOOKS', 'DISCORD_RECEIPTS_WEBHOOK', 'BUCKETS_PUBLIC']) delete process.env[k] }
ok('NBA never falls back to the MLB list', () => {
  reset(); process.env.DISCORD_HOMER_WEBHOOK = 'HOMER'; process.env.DISCORD_MLB_WEBHOOKS = 'MLB'
  assert.deepEqual(dc.sportHooks('nba'), [])
  assert.equal(dc.feedHooks('nba'), '')
  assert.equal(dc.feedHooksFor('nba', 'called'), '')
  assert.equal(dc.feedHooksFor('nba', 'off'), '')
  process.env.DISCORD_NBA_WEBHOOKS = 'NBA'
  assert.deepEqual(dc.sportHooks('nba'), ['NBA'])
  assert.equal(dc.feedHooks('nba'), 'NBA')   // its own channel only: not the public homer feed while hidden
  assert.equal(dc.feedHooksFor('nba', 'off'), '')
})
ok('MLB / NFL / NHL routing unchanged', () => {
  reset(); process.env.DISCORD_HOMER_WEBHOOK = 'HOMER'; process.env.DISCORD_MLB_WEBHOOKS = 'MLB'
  assert.equal(dc.feedHooks('mlb'), 'HOMER,MLB'); assert.equal(dc.feedHooks('nfl'), 'HOMER,MLB'); assert.equal(dc.feedHooks('nhl'), 'HOMER,MLB')
  assert.equal(dc.feedHooksFor('nfl', 'off'), 'HOMER')
})
ok('BUCKETS open: the homer feed and its own channel (never MLB)', () => {
  reset(); process.env.DISCORD_HOMER_WEBHOOK = 'HOMER'; process.env.DISCORD_MLB_WEBHOOKS = 'MLB'; process.env.DISCORD_NBA_WEBHOOKS = 'NBA'; process.env.BUCKETS_PUBLIC = 'on'
  assert.equal(dc.feedHooks('nba'), 'HOMER,NBA')
  assert.equal(dc.feedHooksFor('nba', 'off'), 'HOMER')
  reset(); process.env.DISCORD_HOMER_WEBHOOK = 'HOMER'; process.env.DISCORD_MLB_WEBHOOKS = 'MLB'; process.env.BUCKETS_PUBLIC = 'on'
  assert.equal(dc.feedHooks('nba'), 'HOMER')   // no NBA channel set: still never MLB's
})
reset()
ok('NBA totals post is held while BUCKETS is hidden', () => {
  const src = read('lib/totals/post.js').replace(/\/\/.*$/gm, '')
  assert.match(src, /sport === 'nba' && !bucketsOpen\(\)\) return 'hidden'/)
})
ok('every NBA Discord send goes through discordChannels (no raw env webhook, no sport ternary)', () => {
  for (const f of ['app/api/buckets/moments/route.js', 'lib/writeups/post.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '')
    assert.ok(!/DISCORD_(MLB|HOMER)_WEBHOOKS?/.test(src), `${f} reads a public webhook directly`)
  }
  assert.match(read('lib/writeups/post.js'), /nbaOwnHooks\(\)/)
  assert.match(read('app/api/buckets/moments/route.js'), /bucketsPublic\(\)\)/)
})
ok('the RLS migration closes the anon read of NBA rows', () => {
  const sql = read('supabase/migrations/202610092000_buckets_hidden_rls.sql').replace(/^--.*$/gm, '')
  assert.match(sql, /top_totals_calls_read[\s\S]*using \(sport <> 'nba'\)/)
  assert.match(sql, /homer_feed_posts_read_public[\s\S]*not like '%\\_members\\_%'[\s\S]*not like 'writeup\\_nba\\_%'[\s\S]*not like 'nba\\_%'/)
  assert.ok(!/set role/i.test(sql), 'a set role in the file')
})
ok('/api/totals reads NBA only behind the BUCKETS gate', () => {
  const src = read('app/api/totals/route.js')
  assert.match(src, /sport === 'nba'\) \{ const no = await bucketsGuard\(\)/)
})

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
