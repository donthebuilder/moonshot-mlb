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
process.exit(ok ? 0 : 1)
