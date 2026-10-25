// IS EACH DISCORD CHANNEL REALLY WIRED? (2026-10-23, Donovan: "check they're wired" after adding #buckets-nba and #dash-network).
// /admin used to say "wired" when a key was merely non-empty, which is how the old feed webhook stayed "wired" for two weeks after Discord
// deleted it. This asks Discord itself: a GET on a webhook URL returns the webhook (its name, its channel) and posts NOTHING; a deleted one
// answers 404. Server only. Never returns or logs a URL, a token or an id taken from a URL.
//
// sendTest(key) posts ONE short plain message to that channel through postToDiscord (the send log records it, kind 'admin_test'). Only the
// admin page calls it, behind the admin gate, one channel per click.
import { postToDiscord } from './xPost'
import { membersWebhook } from './membersPost'
import { mayPost } from '../openSwitch'
import { botOn, botToken, replyTo } from './discordBot'

const split = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

/** The channels, in the order the map shows them. */
export const DISCORD_ROOMS = Object.freeze([
  { key: 'DISCORD_MEMBERS_WEBHOOK', label: '#members', what: 'paying members' },
  { key: 'DISCORD_MLB_WEBHOOKS', label: '#moonshot-mlb', what: 'MOONSHOT' },
  { key: 'DISCORD_NFL_WEBHOOKS', label: '#tuddy-nfl', what: 'TUDDY' },
  { key: 'DISCORD_NHL_WEBHOOKS', label: '#lamp-nhl', what: 'LAMP' },
  { key: 'DISCORD_NBA_WEBHOOKS', label: '#buckets-nba', what: 'BUCKETS' },
  { key: 'DISCORD_OVERVIEW_WEBHOOK', label: '#dash-network', what: 'every product: the slate, the receipts, the weekly shows' },
  { key: 'DISCORD_PARTNER_WEBHOOKS', label: 'Partner servers', what: 'the free feed in other Discords, one webhook per server' },
  { key: 'DISCORD_RECEIPTS_WEBHOOK', label: '#called-it', what: 'retired: merged into #dash-network, nothing posts here' },
])
export const isRoomKey = (key) => DISCORD_ROOMS.some((r) => r.key === key)

/** Ask Discord about one webhook without posting. { ok, status, name } (name = the webhook's own name), never the URL. */
export async function probeWebhook(url, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  try {
    const res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'DASH Network admin check' } })
    if (!res.ok) return { ok: false, status: res.status, name: null }
    const j = await res.json().catch(() => ({}))
    return { ok: true, status: res.status, name: typeof j?.name === 'string' ? j.name.slice(0, 80) : null }
  } catch (e) {
    return { ok: false, status: 0, name: null, error: /timeout|abort/i.test(String(e?.name || e?.message)) ? 'timed out' : 'unreachable' }
  }
}

/** Every room: is its key set, and does each webhook in it answer? [{ key, label, what, set, hooks: [{ ok, status, name }] }] */
export async function wiringReport({ fetchImpl = fetch } = {}) {
  return Promise.all(DISCORD_ROOMS.map(async (r) => {
    const hooks = r.key === 'DISCORD_MEMBERS_WEBHOOK' ? split(membersWebhook()) : split(process.env[r.key])      // #members through its guard, as every members send
    return { ...r, set: hooks.length > 0, hooks: await Promise.all(hooks.map((h) => probeWebhook(h, { fetchImpl }))) }
  }))
}

export const TEST_TEXT = '🔧 Test from DASH Network: this channel is wired. Nothing to see here.'

/** One test post to one room. #members goes through its guard (membersWebhook). { ok, status } */
export async function sendTest(key) {
  if (!isRoomKey(key)) return { ok: false, status: 0, error: 'not a channel key' }
  if (key === 'DISCORD_NBA_WEBHOOKS' && !mayPost({ sport: 'nba' })) return { ok: false, status: 0, error: 'BUCKETS is not public (BUCKETS_PUBLIC)' }      // the BUCKETS switch, as every poster
  const hooks = key === 'DISCORD_MEMBERS_WEBHOOK' ? membersWebhook() : split(process.env[key]).join(',')
  if (!hooks) return { ok: false, status: 0, error: 'not set' }
  const r = await postToDiscord(TEST_TEXT, { kind: 'admin_test' }, hooks).catch((e) => ({ ok: false, status: 0, error: String(e?.message || e) }))
  return { ok: Boolean(r?.ok), status: r?.status ?? null }
}

/**
 * THE DASH BOT (lib/dash/discordBot.js, 2026-10-25): is DISCORD_BOT_TOKEN a working bot, and can it see #members (the channel it replies in)?
 * GETs only: the bot's own user, the #members webhook (for its channel), that channel as the bot. Posts nothing; never returns the token or an id.
 * { set, ok, name, seesMembers, status }
 */
export async function probeBot({ fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!botOn()) return { set: Boolean(botToken()), ok: false, name: null, seesMembers: false, status: 0 }
  const get = (url, auth) => fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'DASH Network admin check', ...(auth ? { Authorization: `Bot ${botToken()}` } : {}) } })
  try {
    const me = await get('https://discord.com/api/v10/users/@me', true)
    if (!me.ok) return { set: true, ok: false, name: null, seesMembers: false, status: me.status }
    const j = await me.json().catch(() => ({}))
    const name = typeof j?.username === 'string' ? j.username.slice(0, 80) : null
    const hook = split(membersWebhook())[0]
    const w = hook ? await get(hook, false) : null
    const channel = w?.ok ? String((await w.json().catch(() => ({})))?.channel_id || '') : ''
    const ch = /^\d+$/.test(channel) ? await get(`https://discord.com/api/v10/channels/${channel}`, true) : null
    return { set: true, ok: true, name, seesMembers: Boolean(ch?.ok), status: ch?.status ?? 0 }
  } catch (e) {
    return { set: true, ok: false, name: null, seesMembers: false, status: 0, error: /timeout|abort/i.test(String(e?.name || e?.message)) ? 'timed out' : 'unreachable' }
  }
}

export const BOT_TEST_TEXT = '🔧 Test from DASH Network: a picks post.'
export const BOT_TEST_REPLY = '✅ Test: the DASH bot replies under the post.'
/**
 * The bot test (2026-10-25, Donovan: "send a test"): one test line in #members by its webhook (Discord hands back the message), then the bot's
 * reply under it. Two messages, #members only. { ok, step, status } -- step = where it stopped: 'no-bot' | 'no-members' | 'post' | 'reply' | 'done'.
 */
export async function sendBotTest() {
  if (!botOn()) return { ok: false, step: 'no-bot', status: 0 }
  const hooks = membersWebhook()
  if (!hooks) return { ok: false, step: 'no-members', status: 0 }
  const d = await postToDiscord(BOT_TEST_TEXT, { kind: 'admin_test', wait: true }, hooks.split(',')[0]).catch(() => ({ ok: false }))
  const msg = d?.messages?.[0]
  if (!d?.ok || !msg) return { ok: false, step: 'post', status: d?.status ?? 0 }
  const r = await replyTo(msg, BOT_TEST_REPLY, { kind: 'admin_test' })
  return { ok: Boolean(r.ok), step: r.ok ? 'done' : 'reply', status: r.status ?? 0 }
}
