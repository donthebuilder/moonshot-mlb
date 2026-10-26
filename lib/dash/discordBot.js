// THE DASH BOT: real Discord replies (2026-10-25, Donovan: "when someone on the double goes ... I'd like it to reply to the message ... so our
// users can find the message"; then "just do the bot").
//
// A webhook cannot reply (Discord's Execute Webhook has no message_reference); a bot can. The #members picks post still goes out by webhook,
// which now keeps the message Discord made (postToDiscord `wait`, saved as payload.discord_msg on its homer_feed_posts row). A live check or a
// win post then goes out as the bot, as a reply under that picks post.
//
// Where it can post: only the channel of a message our #members webhook made (the stored channel_id), so it can never reach a free room.
// DISCORD_BOT_TOKEN unset, no stored message, or a refused reply: the caller posts by webhook exactly as before (replyTo -> { ok: false }).
// Never pings anyone (allowed_mentions parse []; replied_user false).
import { discordPayload } from './xPost'
import { logDiscordSend } from './discordSends'
import { mayPost } from '../openSwitch'
import { membersWebhook } from './membersPost'

const API = 'https://discord.com/api/v10'
export const botToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim()
export const botOn = () => /^[\w.-]{50,}$/.test(botToken())

/** The stored picks post a row was shown in: { id, channel_id } or null. `posts` = the day's [{ kind, payload }], `key` = rowKeyOf(row). */
export function msgFor(posts, key) {
  const p = (posts || []).find((x) => (x.payload?.keys || []).includes(key) && x.payload?.discord_msg?.id && x.payload?.discord_msg?.channel_id)
  return p ? p.payload.discord_msg : null
}

/** The reply's body: the post's own Discord payload (text or embed), plus the reply reference. Pure. */
export function replyBody(text, { kind = null, sportKey = null, embed = null, msg }) {
  const { payload } = discordPayload(text, { kind, sportKey, embed })
  return { ...payload, allowed_mentions: { parse: [], replied_user: false }, message_reference: { message_id: msg.id, channel_id: msg.channel_id, fail_if_not_exists: false } }
}

/** Post `text` (or `embed`) as the bot, as a reply under `msg`. { ok, status }. One 429 retry; 8 s timeout; logged like a webhook send. */
export async function replyTo(msg, text, { kind = null, sportKey = null, embed = null } = {}) {
  if (!botOn() || !msg?.id || !/^\d+$/.test(String(msg.channel_id || ''))) return { ok: false, status: 0, skipped: 'no bot or no message' }
  if (!mayPost({ sportKey, kind })) return { ok: false, status: 0, skipped: 'hidden sport' }
  const url = `${API}/channels/${msg.channel_id}/messages`
  const body = JSON.stringify(replyBody(text, { kind, sportKey, embed, msg }))
  const send = () => fetch(url, { method: 'POST', headers: { Authorization: `Bot ${botToken()}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(8000) })
  let r
  try {
    let res = await send()
    if (res.status === 429) {
      const j = await res.json().catch(() => null)
      await new Promise((ok) => setTimeout(ok, Math.min(5000, Math.max(250, Math.round(Number(j?.retry_after ?? 1) * 1000)))))
      res = await send()
    }
    r = res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: res.statusText }
  } catch (e) { r = { ok: false, status: 0, error: String(e?.message || e) } }
  await logDiscordSend({ kind, sport: sportKey, channelKey: 'DISCORD_BOT_REPLY', hookIndex: 0, ok: r.ok, status: r.status, error: r.ok ? null : r.error }).catch(() => false)
  if (!r.ok) console.error(`[bot] reply failed: ${r.status} ${r.error || ''}`)
  return r
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayWordsOf = (day) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? `${MON[+m[1] - 1]} ${+m[2]}` : '' }
const allText = (m) => [m?.content, ...(m?.embeds || []).flatMap((e) => [e.title, e.description, ...(e.fields || []).flatMap((f) => [f.name, f.value])])].filter(Boolean).join('\n')

/**
 * NO STORED MESSAGE (a picks post sent before the bot, or one Discord did not hand back): find it in #members. The bot reads the channel's last
 * 100 messages and takes the newest one our #members webhook posted that is a picks post for `day` ("Today's picks" / "More picks", "Oct 25")
 * naming every one of `names`. { id, channel_id } or null. Reads only; never posts.
 */
export async function findPicksPost({ day, names = [], fetchImpl = fetch } = {}) {
  if (!botOn() || !names.length || !dayWordsOf(day)) return null
  const hook = String(membersWebhook() || '').split(',')[0]
  if (!hook) return null
  try {
    const w = await fetchImpl(hook, { method: 'GET', signal: AbortSignal.timeout(5000) })
    const wj = w.ok ? await w.json().catch(() => ({})) : {}
    const channel = String(wj?.channel_id || ''), hookId = String(wj?.id || '')
    if (!/^\d+$/.test(channel)) return null
    const res = await fetchImpl(`${API}/channels/${channel}/messages?limit=100`, { method: 'GET', headers: { Authorization: `Bot ${botToken()}` }, signal: AbortSignal.timeout(5000) })
    const list = res.ok ? await res.json().catch(() => []) : []
    const words = dayWordsOf(day)
    const hit = (Array.isArray(list) ? list : []).find((m) => {
      if (hookId && String(m?.webhook_id || '') !== hookId) return false
      const t = allText(m)
      return /Today's picks|More picks/.test(t) && new RegExp(`\\b${words}(?!\\d)`).test(t) && names.every((n) => t.includes(n))   // "Oct 2" is not "Oct 25"
    })
    return hit ? { id: String(hit.id), channel_id: channel } : null
  } catch (e) {
    console.error(`[bot] picks post lookup failed: ${e?.message || e}`)
    return null
  }
}
