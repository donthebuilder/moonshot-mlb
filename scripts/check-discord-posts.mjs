#!/usr/bin/env node
// THE DISCORD HARNESS (2026-10-23, Donovan: "get a harness or something going and really focus down on the discord notifications").
// Renders every Discord post kind from REAL stored data through the real text builders and the exact body postToDiscord sends
// (lib/dash/xPost.js discordPayload), routes it through the real routing table (lib/dash/routing.js) to the channel it would reach,
// and fails on broken text (lib/dash/discordCheck.js: empty, undefined, over-length, cut, wrong product voice, members in a free room).
//
// SENDS NOTHING. Every DISCORD_* webhook in the env is replaced by a fake before anything loads, and fetch refuses discord.com, X and any
// write to the database. Reads only (service role or anon key from the env file, never printed).
//
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-discord-posts.mjs [--env <file>] [--days 7] [--kind <substr>]
//        [--html <file>] [--json <file>] [--all-set] [--quiet]
//   --all-set   pretend every channel's webhook is set (default: only the channels that accepted a post in the last 7 days)
//   --html      a phone-friendly review page of every rendered post (for Donovan)
// Exit 1 when any rendered post has an ERROR, or a kind that can reach Discord has no render case and no reason.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const has = (n) => args.includes(n)
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
// links point at production, whatever the local env says
process.env.NEXT_PUBLIC_SITE_URL = flag('--site') || 'https://dashnetwork.vercel.app'
const DAYS = Number(flag('--days')) || 7
const ONLY = flag('--kind')
const QUIET = has('--quiet')

// ── 1. NOTHING CAN BE SENT ──────────────────────────────────────────────────────────────────────────────────────────────────
const KEYS = ['DISCORD_HOMER_WEBHOOK', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_NBA_WEBHOOKS',
  'DISCORD_RECEIPTS_WEBHOOK', 'DISCORD_MEMBERS_WEBHOOK', 'DISCORD_OVERVIEW_WEBHOOK', 'DISCORD_PARTNER_WEBHOOKS', 'DISCORD_DONOVAN_WEBHOOK', 'DISCORD_OPS_WEBHOOK',
  'DISCORD_ALERTS_WEBHOOKS', 'DISCORD_LIVE_WEBHOOKS']
for (const k of Object.keys(process.env)) if (/^DISCORD_.*WEBHOOK/.test(k)) delete process.env[k]
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'THREADS_ACCESS_TOKEN']) delete process.env[k]
const fakeOf = (k) => `https://discord.com/api/webhooks/0/${k}`
const keyOfFake = (u) => (String(u).startsWith('https://discord.com/api/webhooks/0/') ? String(u).slice(35) : '?')
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === 'string' ? input : input?.url || input)
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
  if (/discord(app)?\.com|(^|\.)x\.com|twitter\.com|graph\.threads\.net/i.test(new URL(url).hostname)) throw new Error(`HARNESS: refused ${method} ${new URL(url).hostname}`)
  if (/supabase\.co/i.test(url) && method !== 'GET' && method !== 'HEAD') throw new Error(`HARNESS: refused a database write (${method})`)
  return realFetch(input, init)
}

const { adminClient } = await import('../lib/supabase/admin.js')
const db = adminClient({ anon: true })
if (!db) { console.log('ERROR no database key in the env file (service role or anon)'); process.exit(1) }

// which channels are wired: the ones that accepted a post in the last 7 days (the send log), or every one with --all-set
let wired = KEYS.filter((k) => !['DISCORD_HOMER_WEBHOOK', 'DISCORD_OVERVIEW_WEBHOOK', 'DISCORD_DONOVAN_WEBHOOK', 'DISCORD_OPS_WEBHOOK', 'DISCORD_ALERTS_WEBHOOKS', 'DISCORD_LIVE_WEBHOOKS'].includes(k))
if (!has('--all-set')) {
  const { data, error } = await db.from('discord_sends').select('channel_key').eq('ok', true).gte('sent_at', new Date(Date.now() - 7 * 864e5).toISOString()).limit(5000)
  if (!error && data) wired = [...new Set(data.map((r) => r.channel_key).filter(Boolean))]
} else wired = KEYS
for (const k of wired) process.env[k] = fakeOf(k)
// the production switches, as the send log shows them on (plays_*, members_roundup_*, moment_*, recap_* all posted 10-16..10-23)
for (const k of ['SPORT_PLANS_ON', 'MEMBERS_FOLDS_ON', 'MOMENT_POSTS_ON', 'RECAP_POSTS_ON', 'BUCKETS_PUBLIC']) process.env[k] = 'on'

const { discordPayload } = await import('../lib/dash/xPost.js')
const { routeHooks } = await import('../lib/dash/routeHooks.js')
const { checkDiscordPost } = await import('../lib/dash/discordCheck.js')
const { CASES, NOT_RENDERED, recentDays } = await import('./discord-posts/cases.mjs')
const { foldedForDiscord } = await import('../lib/posts/sportPlans.js')
const { isCut } = await import('../lib/dash/routing.js')

// ── 2. RENDER ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const days = recentDays(DAYS)
const ctx = { db, days, today: days[0] }
const out = []
let errors = 0
let warnCount = 0
const missing = []
for (const c of CASES) {
  if (ONLY && !c.kinds.some((k) => k.includes(ONLY))) continue
  let renders = []
  try { renders = (await c.load(ctx)) || [] } catch (e) { renders = [{ kind: c.kinds[0], error: `case failed: ${e?.message || e}` }] }
  if (!renders.length) { missing.push({ kinds: c.kinds, why: `no real data in the last ${DAYS} days` }); continue }
  for (const r of renders) {
    if (r.skip) { missing.push({ kinds: [r.kind], why: r.skip }); continue }
    if (r.error) { errors += 1; out.push({ ...r, errors: [r.error], warns: [], words: 0, channels: [] }); continue }
    const opts = { sport: r.embedSport ?? null, kind: r.kind, sportKey: r.sport === 'all' ? null : r.sport, embed: r.embed || null, link: r.link || null, imageUrl: r.imageUrl || null, png: r.png ? new Uint8Array(1) : null }
    const { payload } = discordPayload(r.text || '', opts)
    const hooks = typeof r.hooks === 'function' ? r.hooks() : r.hooks
    const routed = foldedForDiscord(r.kind) ? { cut: true, folded: true, hooks: [] } : routeHooks(r.kind, r.sport === 'all' ? 'mlb' : r.sport, hooks)
    const channels = routed.cut ? [] : routed.hooks.map(keyOfFake)
    const res = checkDiscordPost(payload, { sport: r.sport === 'all' ? null : r.sport, source: r.text, channels: routed.cut ? null : channels, members: Boolean(r.members) })
    if (r.legacy) { const old = res.errors.filter((e) => /^percentile wording/.test(e)); res.errors = res.errors.filter((e) => !old.includes(e)); res.warns.push(...old.map((e) => `${e} (stored before the change; new posts are plain)`)) }
    if (routed.folded) res.warns.push('FOLDED into plays_<sport> (SPORT_PLANS_ON): recorded, not delivered')
    else if (routed.cut) res.warns.push('CUT by the routing table (row recorded, nothing delivered)')
    errors += res.errors.length ? 1 : 0
    warnCount += res.warns.length ? 1 : 0
    out.push({ kind: r.kind, sport: r.sport, day: r.day, label: r.label || '', channels, cut: routed.cut, members: Boolean(r.members), payload, ...res })
  }
}

// every kind that can reach Discord has a case, or a written reason it is not rendered
const { ROUTES } = await import('../lib/dash/routing.js')
const { UNROUTED } = await import('../lib/dash/routingUnrouted.js')
const covered = new Set(CASES.flatMap((c) => c.kinds))
const uncovered = [...new Set([...Object.keys(ROUTES), ...Object.keys(UNROUTED)])].filter((k) => !covered.has(k) && !NOT_RENDERED[k] && !isCut(k))
if (!ONLY) for (const k of uncovered) { errors += 1; out.push({ kind: k, errors: ['no render case and no reason in NOT_RENDERED (scripts/discord-posts/cases.mjs)'], warns: [], words: 0, channels: [] }) }

// ── 3. REPORT ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const short = (k) => k.replace('DISCORD_', '').replace(/_WEBHOOKS?$/, '').toLowerCase()
for (const o of out) {
  const tag = o.errors.length ? 'ERROR' : o.warns.length ? 'WARN ' : 'OK   '
  if (QUIET && tag === 'OK   ') continue
  console.log(`${tag} ${o.kind.padEnd(28)} ${String(o.sport || '').padEnd(4)} ${String(o.day || '').padEnd(10)} -> ${o.cut ? 'CUT' : (o.channels || []).map(short).join(',') || 'nowhere'}  ${o.words}w${o.label ? `  ${o.label}` : ''}`)
  for (const e of o.errors) console.log(`        ERROR ${e}`)
  if (!QUIET) for (const w of o.warns) console.log(`        warn  ${w}`)
}
for (const m of missing) console.log(`SKIP  ${m.kinds.join(', ')}: ${m.why}`)
console.log(`\n${out.length} posts rendered from real data (${days.at(-1)} .. ${days[0]}), wired: ${wired.map(short).join(', ') || 'none'}`)
console.log(`${errors} with errors, ${warnCount} with warnings, ${missing.length} cases with no data, ${Object.keys(NOT_RENDERED).length} kinds not rendered on purpose`)

if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1))
if (flag('--html')) {
  const { reviewPage } = await import('./discord-posts/page.mjs')
  writeFileSync(flag('--html'), reviewPage(out, { days, wired }))
  console.log(`review page: ${flag('--html')}`)
}
process.exit(errors ? 1 : 0)
