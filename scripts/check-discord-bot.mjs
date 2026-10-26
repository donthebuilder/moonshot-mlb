// THE DASH BOT (lib/dash/discordBot.js): #members checks reply under the picks post they belong to. ALL TEST DATA: fake webhook and bot token,
// fetch replaced, nothing leaves this process.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-discord-bot.mjs
import assert from 'node:assert/strict'

const MEM = 'https://discord.com/api/webhooks/111/TEST-members'
const TOKEN = `TEST.${'x'.repeat(60)}`
for (const k of Object.keys(process.env)) if (/^DISCORD_/.test(k)) delete process.env[k]
process.env.DISCORD_MEMBERS_WEBHOOK = MEM
const calls = []
let botStatus = 200
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, auth: init.headers?.Authorization || null, body: init.body ? JSON.parse(init.body) : null })
  if (u.includes('/api/v10/channels/')) return new Response(botStatus === 200 ? '{"id":"9"}' : '{}', { status: botStatus })
  if (u.endsWith('?wait=true')) return new Response('{"id":"555","channel_id":"777"}', { status: 200 })
  return new Response(null, { status: u.includes('discord.com') ? 204 : 503 })
}

const X = await import('../lib/dash/xPost.js')
const B = await import('../lib/dash/discordBot.js')
const P = await import('../lib/card/post.js')

let n = 0, bad = 0
const t = async (name, fn) => { n++; try { await fn(); console.log(`ok    ${name}`) } catch (e) { bad++; console.log(`FAIL  ${name}\n      ${e.message}`) } }
const DAY = '2026-10-25'
// THE DAY's rows: the Double sat in the first picks post (stored message 555 in channel 777); the NHL straight in a post with no stored message
const posts = [
  { kind: 'card_members_day', payload: { keys: ['all|double|1|bot'], discord_msg: { id: '555', channel_id: '777' } } },
  { kind: 'card_members_day_2', payload: { keys: ['nhl|straight|1|bot'] } },
]
const fakeDb = () => ({ from: () => { const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: posts }) }; return q } })
const item = (sport, product) => ({ row: { sport, product, slot: 1, lane: 'bot' }, kind: `TEST_${sport}_${product}`, sport })
const send = (items) => P.sendUnderPicks(fakeDb(), { day: DAY, items, keyOf: (x) => P.rowKeyOf(x.row), hooks: MEM, build: (xs) => ({ text: `TEST ${xs.map((x) => x.kind).join(' ')}`, kind: xs[0].kind, sportKey: 'nhl' }) })

await t('a #members post asks Discord for its message (?wait=true) and hands it back', async () => {
  calls.length = 0
  const d = await X.postToDiscord('TEST picks', { kind: 'card_members_day', wait: true }, MEM)
  assert.equal(calls[0].url, `${MEM}?wait=true`)
  assert.deepEqual(d.messages, [{ id: '555', channel_id: '777' }])
  calls.length = 0
  const plain = await X.postToDiscord('TEST', { kind: 'card_members_day' }, MEM)
  assert.equal(calls[0].url, MEM); assert.deepEqual(plain.messages, [])
})
await t('#members posts carry the DASH Network name and logo; a free room keeps its webhook name', async () => {
  calls.length = 0
  await X.postToDiscord('TEST picks', { kind: 'card_members_day' }, MEM)
  assert.equal(calls[0].body.username, 'DASH Network'); assert.match(calls[0].body.avatar_url, /\/icon-512\.png$/)
  process.env.DISCORD_MLB_WEBHOOKS = 'https://discord.com/api/webhooks/222/TEST-free'
  calls.length = 0
  await X.postToDiscord('TEST', {}, process.env.DISCORD_MLB_WEBHOOKS)
  assert.equal(calls[0].body.username, undefined)
  delete process.env.DISCORD_MLB_WEBHOOKS
})
await t('the reply body: the post itself, a reply reference, no pings', () => {
  const b = B.replyBody('TEST check', { msg: { id: '555', channel_id: '777' } })
  assert.equal(b.content, 'TEST check')
  assert.deepEqual(b.message_reference, { message_id: '555', channel_id: '777', fail_if_not_exists: false })
  assert.deepEqual(b.allowed_mentions, { parse: [], replied_user: false })
})
await t('no bot token: every check goes by webhook, exactly as before (one post)', async () => {
  calls.length = 0
  assert.deepEqual(await send([item('all', 'double'), item('nhl', 'straight')]), [])
  assert.equal(calls.length, 1); assert.equal(calls[0].url, MEM)
})
await t('with the bot: a check whose picks post is stored is a reply under it, in that channel; the rest go by webhook', async () => {
  process.env.DISCORD_BOT_TOKEN = TOKEN; botStatus = 200; calls.length = 0
  assert.deepEqual(await send([item('all', 'double'), item('nhl', 'straight')]), [])
  const bot = calls.filter((c) => c.url.includes('/api/v10/'))
  assert.equal(bot.length, 1); assert.equal(bot[0].url, 'https://discord.com/api/v10/channels/777/messages')
  assert.equal(bot[0].auth, `Bot ${TOKEN}`); assert.equal(bot[0].body.message_reference.message_id, '555')
  assert.match(bot[0].body.content, /TEST_all_double/); assert.doesNotMatch(bot[0].body.content, /TEST_nhl/)
  const hook = calls.filter((c) => c.url === MEM)
  assert.equal(hook.length, 1); assert.match(hook[0].body.content, /TEST_nhl_straight/)
})
await t('a refused reply (403) falls back to the webhook, so the check still goes out', async () => {
  botStatus = 403; calls.length = 0
  assert.deepEqual(await send([item('all', 'double')]), [])
  assert.equal(calls.filter((c) => c.url === MEM).length, 1)
})
await t('the bot posts only where our members webhook posted (a stored channel id), never anywhere else', async () => {
  botStatus = 200; calls.length = 0
  assert.equal((await B.replyTo({ id: '555', channel_id: 'not-a-channel' }, 'TEST')).ok, false)
  assert.equal((await B.replyTo(null, 'TEST')).ok, false)
  assert.equal(calls.length, 0)
  delete process.env.DISCORD_BOT_TOKEN
  assert.equal((await B.replyTo({ id: '555', channel_id: '777' }, 'TEST')).skipped, 'no bot or no message')
})

await t('the admin bot test: one #members line by webhook, then the bot reply under it; no bot = nothing sent', async () => {
  const W = await import('../lib/dash/discordWire.js')
  calls.length = 0
  assert.equal((await W.sendBotTest()).step, 'no-bot'); assert.equal(calls.length, 0)
  process.env.DISCORD_BOT_TOKEN = TOKEN; botStatus = 200
  const r = await W.sendBotTest()
  assert.equal(r.step, 'done'); assert.equal(calls.length, 2)
  assert.equal(calls[0].url, `${MEM}?wait=true`)
  assert.equal(calls[1].url, 'https://discord.com/api/v10/channels/777/messages'); assert.equal(calls[1].body.message_reference.message_id, '555')
  delete process.env.DISCORD_BOT_TOKEN
})

console.log(bad ? `${bad}/${n} FAILED` : `OK: discord bot (${n} checks, TEST data)`)
process.exit(bad ? 1 : 0)
