#!/usr/bin/env node
// NO BUCKETS (NBA) CONTENT LEAVES THE BUILDING WHILE THE SWITCH IS OFF (2026-10-12, Donovan: "NO NBA posts anywhere until
// BUCKETS is public"). Two halves, both on TEST data (a fake fetch and a fake database; nothing touches X, Discord or a real db):
//   1. a STATIC SCAN of every poster module: the one switch is lib/openSwitch.js (nothing else reads BUCKETS_PUBLIC from the
//      environment), the two send funnels (postToX / postToDiscord) and postOnce ask it, and every module that posts AND can name
//      NBA reaches the switch;
//   2. a FAKE-SEND RUN with the switch OFF and ON: every NBA kind, sport and channel is refused with nothing fetched when off, and
//      the same calls DO reach the (fake) wire when on, so the refusal is the switch and not a broken harness.
// The write-up RUN (runNbaWriteups: stored as a dry row, nothing sent) is held by scripts/check-ddtd.mjs.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-buckets-no-leak.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '.next', 'proto'].includes(e.name)) continue
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) walk(p, out)
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}
// code without comments, so a word in a comment never counts
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
process.env.X_SCHEDULE_OFF = 'on'
Object.assign(process.env, {
  X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST',
  DISCORD_HOMER_WEBHOOK: 'https://discord.test/homer', DISCORD_MLB_WEBHOOKS: 'https://discord.test/mlb', DISCORD_NBA_WEBHOOKS: 'https://discord.test/nba',
  DISCORD_MEMBERS_WEBHOOK: 'https://discord.com/api/webhooks/123456789/TESTTOKEN',
})
for (const k of ['X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_POLLS_PAUSE', 'POST_KINDS_ON', 'BUCKETS_PUBLIC', 'NEXT_PUBLIC_BUCKETS_PUBLIC', 'TOTALS_POSTS_PAUSE']) delete process.env[k]

let wire = []
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  if (u.includes('api.x.com/2/tweets')) { wire.push({ to: 'x', body: opts.body }); return { ok: true, status: 200, json: async () => ({ data: { id: '9001' } }), headers: { get: () => null } } }
  if (u.startsWith('https://discord.test') || u.startsWith('https://discord.com/api/webhooks')) { wire.push({ to: 'discord', url: u, body: opts.body }); return { ok: true, status: 204, json: async () => ({}), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } }
}

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const SW = await import('../lib/openSwitch.js')
const XP = await import('../lib/dash/xPost.js')
const XPOL = await import('../lib/dash/xPolicy.js')
const XS = await import('../lib/dash/xSchedule.js')
const LS = await import('../lib/dash/longshotsPost.js')
const DR = await import('../lib/writeups/discordRoute.js')
const PK = await import('../lib/dash/polls/kinds.js')
const PP = await import('../lib/dash/polls/post.js')
const TP = await import('../lib/totals/post.js')
const SL = await import('../lib/posts/slate.js')
const DC = await import('../lib/dash/discordChannels.js')
const G = await import('../lib/dash/xGate.js')
const PC = await import('../lib/dash/postClaim.js')
const L = await import('../lib/dash/xPostLog.js')

const reset = () => { wire = []; G._resetRecentCache?.(); G._resetPostedCache?.(); PC._resetTakenForTests?.(); L._resetLogForTests?.() }
const open = () => { process.env.BUCKETS_PUBLIC = 'on' }
const shut = () => { delete process.env.BUCKETS_PUBLIC; delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC }
// a database that must never be touched while the switch is off
const deadDb = new Proxy({}, { get: (_t, k) => { throw new Error(`the database was read (${String(k)}) before the switch`) } })

// ── 1. STATIC SCAN ─────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('static: BUCKETS_PUBLIC is read from the environment in ONE place, lib/openSwitch.js (next.config.js copies it for the client build, lib/routes.js reads that copy)', () => {
  const bad = walk('lib').concat(walk('app'), walk('components')).filter((f) => f !== 'lib/openSwitch.js' && /process\.env\.BUCKETS_PUBLIC\b/.test(code(read(f))))
  assert.deepEqual(bad, [], `a second copy of the switch: ${bad.join(', ')}`)
  assert.match(read('lib/openSwitch.js'), /process\.env\.BUCKETS_PUBLIC/)
  assert.match(read('lib/nba/gate.js'), /bucketsOpen\(\)/)   // the site's gate answers from the same function
})

await ok('static: the send funnels ask the switch before anything is sent (postToX, postToDiscord, postOnce)', () => {
  const x = read('lib/dash/xPost.js')
  const iX = x.indexOf('export async function postToX'); const iD = x.indexOf('export async function postToDiscord')
  assert.ok(iX > 0 && iD > 0)
  assert.match(x.slice(iX, iX + 900), /mayPost\(\{ sport, kind \}\)/)
  assert.match(x.slice(iD, iD + 900), /mayPost\(\{ sport, sportKey, kind \}\)/)
  const l = read('lib/dash/longshotsPost.js')
  assert.match(l.slice(l.indexOf('export async function postOnce')), /mayPost\(\{ sport, kind \}\)/)
  const d = read('lib/writeups/discordRoute.js')
  assert.ok((d.match(/mayPost\(/g) || []).length >= 3, 'sendMembers, sendFree and retryMembers each ask the switch')
})

await ok('static: every module that POSTS and can name NBA reaches the switch (a new poster path for NBA fails here until it does)', () => {
  const POSTS = /\b(postToX|postToDiscord|sendMembers|sendFree|postOnce|postMembers)\(/
  const NAMES_NBA = /['"`]nba['"`]|\bnba[A-Z_]\w*|\bbuckets\b|writeup_nba|nba30/i
  const REACHES = /openSwitch|isSportOpen|mayPost|bucketsOpen|bucketsPublic|isPublicSport|bucketsGuard/
  const files = walk('lib').concat(walk('app/api')).filter((f) => !/lib\/dash\/xPost\.js$|lib\/openSwitch\.js$/.test(f))
  const missing = []
  const seen = []
  for (const f of files) {
    const c = code(read(f))
    if (!POSTS.test(c) || !NAMES_NBA.test(c)) continue
    seen.push(f)
    if (!REACHES.test(c)) missing.push(f)
  }
  assert.deepEqual(missing, [], `posts and names NBA but never asks the switch: ${missing.join(', ')}`)
  assert.ok(seen.length >= 5, `the scan found the poster modules (${seen.join(', ')})`)
})

await ok('static: the write-up run stores for the site and sends nothing while the switch is off; the poll tick builds no NBA adapter', () => {
  const w = read('lib/writeups/post.js')
  const i = w.indexOf('export async function runNbaWriteups')
  assert.match(w.slice(i, i + 700), /isSportOpen\('nba'\)/)
  assert.match(w.slice(i), /!open \? \{ on: false/)
  assert.match(w.slice(i), /if \(open\) await retryMembers/)
  assert.match(w.slice(i), /postToX\(r\.x, \{ kind: 'writeup', sport: 'nba' \}\)/)
  assert.match(read('app/api/dash/polls/tick/route.js'), /if \(!isSportOpen\(sport\)\)/)
  assert.match(read('app/api/buckets/moments/route.js'), /if \(!bucketsPublic\(\)\)/)
})

await ok('static: every X post kind that names NBA is one the switch sees (KIND_TAGS, the poll kinds, the card kinds, the write-up kinds)', () => {
  const kinds = [...Object.keys(XS.KIND_TAGS), ...PK.POLL_KINDS, ...PK.POLL_RESULT_KINDS, 'writeup_nba_401810001', 'card_nba', 'card_members_nba', 'card_result_nba', 'card_ls_nba', 'nba30', 'nba_top_totals']
  const nba = kinds.filter((k) => XPOL.sportOfKind(k) === 'nba' || /(^|_)nba(_|\d|$)/.test(k))
  assert.ok(nba.length >= 5, `found NBA kinds: ${nba.join(', ')}`)
  for (const k of nba) assert.equal(SW.hiddenSportOfKind(k), 'nba', `${k} is an NBA kind the switch does not see`)
  // and the switch does not reach the other sports' kinds
  for (const k of ['homer', 'td', 'nhlgoal', 'writeup_mlb_1', 'writeup_nfl_1', 'writeup_nhl_1', 'top_totals', 'nfl_top_totals', 'nhl_top_totals', 'board', 'call_123', 'card_mlb', 'longshot']) assert.equal(SW.hiddenSportOfKind(k), null, `${k} must not be hidden`)
})

// ── 2. FAKE-SEND RUN, SWITCH OFF THEN ON ───────────────────────────────────────────────────────────────────────────────
const NBA_KINDS = ['nba30', 'nba_top_totals', 'writeup_nba_401810001', 'card_nba', ...PK.POLL_KINDS.filter((k) => /^nba_/.test(k))]
const OTHER_KINDS = ['homer', 'writeup_mlb_1', 'top_totals', 'nhlgoal']

await ok('OFF: postToX refuses every NBA kind, and a call that only says sport:nba, with nothing fetched', async () => {
  shut(); reset()
  for (const kind of NBA_KINDS) { const r = await XP.postToX(`TEST ${kind}`, { kind }); assert.equal(r.ok, false, kind); assert.equal(r.blocked, true, kind) }
  const r2 = await XP.postToX('TEST writeup', { kind: 'writeup', sport: 'nba' }); assert.equal(r2.blocked, true)
  assert.equal(wire.length, 0, 'nothing reached the wire')
})
await ok('OFF: postToDiscord refuses NBA by sport, sportKey or kind, on any webhook (the BUCKETS channel, #members, the homer feed)', async () => {
  shut(); reset()
  const hooks = ['https://discord.test/nba', 'https://discord.com/api/webhooks/123456789/TESTTOKEN', 'https://discord.test/homer']
  for (const h of hooks) {
    for (const opt of [{ sport: 'nba' }, { sportKey: 'nba' }, { kind: 'nba30' }, { kind: 'writeup_nba_1', sportKey: 'nba' }]) { const r = await XP.postToDiscord('TEST nba', opt, h); assert.equal(r.blocked, true, JSON.stringify(opt)) }
  }
  assert.equal(wire.length, 0)
})
await ok('OFF: the write-up senders (#members every game, free channel, the retry) send nothing for NBA', async () => {
  shut(); reset()
  assert.equal(await DR.sendMembers('TEST', { sport: 'nba', kind: 'writeup_nba_1' }), false)
  assert.equal(await DR.sendFree('TEST', { sport: 'nba', kind: 'writeup_nba_1', featured: true, hooks: 'https://discord.test/nba' }), null)
  assert.equal(await DR.retryMembers(deadDb, [{ day: '2027-01-14', kind: 'writeup_nba_1', payload: { members_sent: false, text_full: 'TEST', kickoff: '2099-01-01T00:00:00Z' } }], { sport: 'nba' }), 0)
  assert.equal(wire.length, 0)
})
await ok('OFF: postOnce (lists, cards, totals, polls, long shots all go through it) refuses an NBA sport or kind before reading the database', async () => {
  shut(); reset()
  for (const [sport, kind] of [['nba', 'anything'], ['mlb', 'nba_top_totals'], ['nba', 'nba_poll_pick'], ['mlb', 'card_nba']]) {
    assert.equal(await LS.postOnce(deadDb, { day: '2027-01-14', kind, sport, envGate: false, build: async () => ({ text: 'TEST' }) }), 'hidden', `${sport}/${kind}`)
  }
  assert.equal(wire.length, 0)
})
await ok('OFF: the poll tick posts no NBA poll and no reveal (and reads nothing); the totals post is hidden; the Slate / receipt do not list NBA', async () => {
  shut(); reset()
  assert.match(await PP.postPollOnce(deadDb, { sport: 'nba', day: '2027-01-14', adapter: {} }), /^hidden/)
  assert.match(await PP.postRevealsOnce(deadDb, { sport: 'nba', today: '2027-01-14', adapter: {} }), /^hidden/)
  assert.equal(await TP.postTotalsOnce(deadDb, { sport: 'nba', day: '2027-01-14', rows: [] }), 'hidden')
  assert.equal(SL.isPublicSport('nba'), false); assert.equal(SL.isPublicSport('mlb'), true)
  assert.equal(DC.feedHooks('nba').includes('homer'), false, 'the public homer feed carries no NBA while hidden')
  assert.equal(wire.length, 0)
})
await ok('OFF: other sports are untouched (the same calls for MLB reach the wire)', async () => {
  shut(); reset()
  for (const kind of OTHER_KINDS) { const r = await XP.postToX(`TEST ${kind}`, { kind }); assert.equal(r.ok, true, kind) }
  const d = await XP.postToDiscord('TEST mlb', { sport: 'mlb', sportKey: 'mlb' }, 'https://discord.test/mlb'); assert.equal(d.ok, true)
  assert.equal(wire.filter((w) => w.to === 'x').length, OTHER_KINDS.length); assert.equal(wire.filter((w) => w.to === 'discord').length, 1)
})
await ok('ON: the same NBA calls DO reach the (fake) wire, so the refusal above is the switch and not a broken harness', async () => {
  open(); reset()
  try {
    for (const kind of ['nba30', 'nba_top_totals', 'writeup_nba_401810001']) { const r = await XP.postToX(`TEST ${kind}`, { kind }); assert.equal(r.ok, true, kind) }
    const r2 = await XP.postToX('TEST writeup', { kind: 'writeup', sport: 'nba' }); assert.equal(r2.ok, true)
    const d = await XP.postToDiscord('TEST nba', { sport: 'nba', sportKey: 'nba' }, 'https://discord.test/nba'); assert.equal(d.ok, true)
    assert.equal(await DR.sendMembers('TEST', { sport: 'nba', kind: 'writeup_nba_1' }), true)
    assert.equal(SL.isPublicSport('nba'), true)
    assert.equal(SW.isSportOpen('nba'), true)
    assert.ok(wire.length >= 6, `${wire.length} sends`)
  } finally { shut() }
})
await ok('ON means exactly BUCKETS_PUBLIC=on: "yes", "1", "true", "" and an unset value are all still off', () => {
  for (const v of ['yes', '1', 'true', '', 'off', 'ON ']) {
    process.env.BUCKETS_PUBLIC = v
    assert.equal(SW.isSportOpen('nba'), /^on$/i.test(v.trim()), JSON.stringify(v))
  }
  shut(); assert.equal(SW.isSportOpen('nba'), false); assert.equal(SW.isSportOpen('mlb'), true)
})

// ── EARLY ACCESS (2026-10-12): a grant opens the SITE for one account; it never opens a POSTER ─────────────────────────────
await ok('EARLY ACCESS: no poster / push / member path imports early access or the access gate; with a grant holder signed in and the switch OFF every NBA send is still refused with nothing fetched', async () => {
  const POSTS = /\b(postToX|postToDiscord|sendMembers|sendFree|postOnce|postMembers)\(/
  const EA = /earlyAccess|lib\/features|\.\.?\/features|featureAccess|bucketsAccess|grantsOf|ownFeatures/
  const bad = walk('lib').concat(walk('app/api')).filter((f) => !f.startsWith('lib/earlyAccess/') && f !== 'lib/features.js' && f !== 'lib/nba/gate.js' && !/^app\/api\/(buckets\/access|early-access|admin\/early-access)\//.test(f))
    .filter((f) => { const c = code(read(f)); return POSTS.test(c) && EA.test(c) })
  assert.deepEqual(bad, [], `a poster module reaches early access: ${bad.join(', ')}`)
  assert.ok(!/earlyAccess|features/.test(code(read('lib/openSwitch.js'))))
  // behaviour: a signed-in holder (fake database), switch closed
  const G2 = await import('../lib/nba/gate.js'); const A2 = await import('../lib/earlyAccess/access.js')
  process.env.ADMIN_EMAILS = 'admin@test.invalid'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'TEST'
  const fake = { from: () => { const b = { select: () => b, eq: async () => ({ data: [{ feature: 'buckets', expires_at: null, revoked_at: null }], error: null }) }; return b } }
  A2.clearGrantCache(); shut(); reset()
  const acc = await G2.bucketsAccess({ getUser: async () => ({ id: 'holder', email: 'h@test.invalid', email_confirmed_at: '2026-01-01' }), db: fake })
  assert.equal(acc.ok, true); assert.equal(acc.early, true)                  // the site is open to them...
  for (const kind of ['nba30', 'nba_top_totals', 'writeup_nba_401810001', 'card_members_nba']) { const r = await XP.postToX(`TEST ${kind}`, { kind }); assert.equal(r.ok, false, kind) }
  assert.equal((await XP.postToDiscord('TEST nba', { sport: 'nba', sportKey: 'nba' }, 'https://discord.test/nba')).ok, false)
  assert.equal(await DR.sendMembers('TEST', { sport: 'nba', kind: 'writeup_nba_1' }), false)
  assert.equal(SW.isSportOpen('nba'), false); assert.equal(SW.mayPost({ sport: 'nba' }), false)
  assert.equal(wire.length, 0, 'nothing reached the wire')                    // ...and nothing is posted
})

// ── PARITY PASS (2026-10-12): the NBA card parts, the lane writer and the odds flag add no public surface ─────────────────────────────
await ok('PARITY: every card route that can reach a BUCKETS surface asks the BUCKETS gate first (image, recent, binder, earned, special, stamps) and keeps it off the shared CDN', () => {
  for (const r of ['image', 'recent', 'binder', 'earned', 'special', 'stamps']) {
    const c = code(read(`app/api/card/${r}/route.js`))
    assert.match(c, /bucketsGuard/, `app/api/card/${r} must ask bucketsGuard before it serves anything about BUCKETS`)
    assert.match(c, /private,/, `app/api/card/${r}: a BUCKETS answer is private`)
  }
  // the routes that never name BUCKETS stay exactly as they were: no gate import to forget
  for (const r of ['day', 'dual', 'slab', 'nman', 'share']) assert.ok(!/hasPreviewCards|NBA_MOMENTS/.test(code(read(`app/api/card/${r}/route.js`))), `app/api/card/${r} must not reach the preview parts`)
  assert.match(code(read('app/api/buckets/card/route.js')), /bucketsRoute\(/)
})
await ok('PARITY: the PUBLIC card lists never carry NBA: CARD_SPORTS, the public registry, MOMENT_KEYS, the momentEvents rows, the post/push builders', async () => {
  const CORE = await import('../lib/card/core.js'); const REG = await import('../lib/cards/registry.js'); const MOM = await import('../lib/cards/moments.js'); const EV = await import('../lib/cards/momentEvents.js')
  assert.ok(!CORE.CARD_SPORTS.includes('nba')); assert.equal(REG.hasCards('nba'), false); assert.ok(!REG.cardSports().includes('nba'))
  assert.ok(!MOM.MOMENT_KEYS.some((k) => /^nba/.test(k)))
  assert.deepEqual(EV.momentsForEvent({ sport: 'nba', rows: [{ game_id: 1, player_id: 2, name: 'TEST', points: 41 }], minTier: 'base' }), [])
  // no module that posts or pushes imports the NBA moment table or the preview planner
  const bad = walk('lib').concat(walk('app/api')).filter((f) => !/^lib\/cards\/(moments|specialData|momentEvents)\.js$|^lib\/card\/(nbaPreview|sources|core)\.js$|^app\/api\/(card|buckets)\//.test(f)).filter((f) => /NBA_MOMENTS|nbaGameLines|planNbaPreview|loadNbaPreview/.test(code(read(f))))
  assert.deepEqual(bad, [], `a module outside the gated card routes reaches the NBA card parts: ${bad.join(', ')}`)
})
await ok('PARITY: the lane-night writer touches nothing while hidden (a database that throws on any use), and early access does not open it', async () => {
  const LT = await import('../lib/numerology/nbaTick.js')
  const games = [{ id: 'g1', seasonType: 2, state: 'pre', start: new Date(Date.now() + 3600e3).toISOString(), away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' } }]
  shut()
  assert.deepEqual(await LT.recordNbaLanes(deadDb, { date: '2026-11-21', games }), { skipped: 'hidden' })
  assert.deepEqual(await LT.gradeNbaLanes(deadDb, { game: games[0], day: '2026-11-21', box: [] }), { skipped: 'hidden' })
  assert.ok(!/earlyAccess|features|bucketsAccess|bucketsGuard/.test(code(read('lib/numerology/nbaTick.js'))), 'the writer asks the public switch only')
  assert.match(code(read('app/api/buckets/tick/route.js')), /recordNbaLanes\(/)
})
await ok('PARITY: NBA odds capture is its own flag, default OFF, and opens no surface (the odds tables stay service-only; the readers are gated)', async () => {
  const SN = await import('../lib/odds/snap.js')
  delete process.env.NBA_ODDS_CAPTURE
  assert.equal(SN.nbaOddsCapture(), false); assert.ok(!SN.activeLeagues(false, SN.nbaOddsCapture()).includes('NBA'))
  for (const r of ['odds/latest', 'totals', 'stories']) assert.match(code(read(`app/api/${r}/route.js`)), /bucketsGuard/, `app/api/${r} stays gated for nba`)
  assert.ok(!/NBA_ODDS_CAPTURE/.test(code(read('lib/openSwitch.js'))), 'the capture flag is not an open switch')
})

await ok('MEMBERS: the BUCKETS player card hides the call from a free viewer (score, why, legs, share, flip, compare call fields) and stays behind the public switch', async () => {
  const src = code(read('components/buckets/tabs/Player.js'))
  for (const n of ['useCardLock(', 'useCallMask(', 'lock={lockIn}', 'CardLockLine', '!locked && <CardFlip', '!locked && <ShareCardButton', 'rows={compareRows}']) assert.ok(src.includes(n), `the card no longer has ${n}`)
  assert.ok(/strip: \[[^\]]*'score'[^\]]*'why'/.test(src), 'the compare mask strips the score and the why')
})

await ok('MEMBERS: the BUCKETS board, ALL MARKETS and the top ticker read through useGatedBoard (no free four: a free viewer sees plain ON THE BOARD; the ticker never names a hidden pick)', async () => {
  for (const f of ['components/buckets/tabs/Board.js', 'components/buckets/tabs/FullBoard.js', 'components/buckets/BucketsTicker.js']) {
    const src = code(read(f))
    assert.ok(src.includes('useGatedBoard('), `${f} must read the board through useGatedBoard`)
    assert.ok(!/useBucketsBoard\(/.test(src), `${f} reads the raw board`)
  }
  const g = code(read('components/buckets/useGatedBoard.js'))
  for (const n of ['useLockOf()', "status: 'board'", 'role: null', '_callHidden', "g?.state === 'final'"]) assert.ok(g.includes(n), `useGatedBoard lost ${n}`)
  assert.ok(code(read('components/buckets/BucketsTicker.js')).includes('!r._callHidden'), 'the ticker must skip a hidden pick')
})

console.log(`\n${n} groups ok`)
