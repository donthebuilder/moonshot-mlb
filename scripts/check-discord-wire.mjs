#!/usr/bin/env node
// /admin/discord: the wiring report asks Discord with a GET only, catches a deleted webhook (404), and never returns a URL or token. TEST data, no network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-discord-wire.mjs
const W = await import('../lib/dash/discordWire.js')
const calls = []
const f = async (url, init) => { calls.push({ url, method: init?.method }); return url.includes('/dead/') ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ name: 'BUCKETS', token: 'SECRET' }), { status: 200 }) }
process.env.DISCORD_NBA_WEBHOOKS = 'https://discord.com/api/webhooks/1/live'
process.env.DISCORD_OVERVIEW_WEBHOOK = 'https://discord.com/api/webhooks/2/dead/x'
const rep = await W.wiringReport({ fetchImpl: f })
const nba = rep.find((r) => r.key === 'DISCORD_NBA_WEBHOOKS'), ov = rep.find((r) => r.key === 'DISCORD_OVERVIEW_WEBHOOK')
const ok = nba.hooks[0].ok && nba.hooks[0].name === 'BUCKETS' && !JSON.stringify(rep).includes('SECRET') && !JSON.stringify(rep).includes('webhooks/') && ov.hooks[0].status === 404 && calls.every((c) => c.method === 'GET')
console.log(ok ? 'PASS wiring report: GET only, name back, 404 caught, no URL or token in the report' : 'FAIL ' + JSON.stringify(rep))
// the bot: GETs only, its name back, whether it sees #members; never the token
process.env.DISCORD_MEMBERS_WEBHOOK = 'https://discord.com/api/webhooks/3/members'
const TOKEN = `TEST.${'y'.repeat(60)}`
const bcalls = []
const bf = (see) => async (url, init) => { bcalls.push({ url, method: init?.method }); if (url.endsWith('/users/@me')) return new Response(JSON.stringify({ username: 'DASH Network', id: '42' }), { status: 200 }); if (url.includes('/webhooks/3/')) return new Response(JSON.stringify({ channel_id: '777' }), { status: 200 }); return new Response('{}', { status: url.endsWith('/channels/777') && see ? 200 : 403 }) }
const none = await W.probeBot({ fetchImpl: bf(true) })
process.env.DISCORD_BOT_TOKEN = TOKEN
const yes = await W.probeBot({ fetchImpl: bf(true) }), no = await W.probeBot({ fetchImpl: bf(false) })
const bok = !none.set && yes.ok && yes.name === 'DASH Network' && yes.seesMembers && no.ok && !no.seesMembers && bcalls.every((c) => c.method === 'GET') && !JSON.stringify([yes, no]).includes(TOKEN)
console.log(bok ? 'PASS bot probe: GET only, name back, sees #members or not, no token in the report' : 'FAIL bot ' + JSON.stringify({ none, yes, no }))
process.exit(ok && bok ? 0 : 1)
