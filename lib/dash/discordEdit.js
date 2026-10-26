// EDIT A #MEMBERS MESSAGE IN PLACE (batch member-requests 2B, 2026-10-25). The list post goes out once by the #members webhook (which keeps the message
// Discord made: payload.discord_msg) and is then EDITED as the games go (waiting -> live -> result). A webhook can edit its own message with a
// PATCH to its URL + /messages/<id>; the bot cannot (it may only edit what it posted). So this takes the webhook URL, and ONLY a #members one:
// anything else is refused here, so an edit can never reach a public room. Never pings (allowed_mentions parse []). 8 s timeout, one 429 retry,
// logged like every send (key name only, never the URL).
import { discordPayload } from './xPost'
import { logDiscordSend } from './discordSends'
import { isMembersHook } from './membersPost'

const ID = /^\d{5,}$/

/** The PATCH URL for a webhook's message, or '' when either part is not usable. Pure. */
export function editUrl(hook, id) {
  const h = String(hook || '').split('?')[0].replace(/\/+$/, '')
  return /\/api\/webhooks\/\d+\/[\w-]+$/.test(h) && ID.test(String(id || '')) ? `${h}/messages/${id}` : ''
}

/** Replace the text (or embed) of message `msg` ({ id, channel_id }) made by the #members webhook `hook`. { ok, status, error? }. */
export async function editMembersMessage(hook, msg, { text, embed = null, kind = null, sportKey = null } = {}) {
  if (!isMembersHook(hook)) return { ok: false, status: 0, error: 'not a #members webhook', refused: true }
  const url = editUrl(hook, msg?.id)
  if (!url) return { ok: false, status: 0, error: 'no message to edit', refused: true }
  const { payload } = discordPayload(text, { kind, sportKey, embed })
  const body = JSON.stringify({ ...payload, ...(payload.embeds ? {} : { embeds: [] }) })   // a text edit clears an old embed
  const send = () => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(8000) })
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
  await logDiscordSend({ kind, sport: sportKey, channelKey: 'DISCORD_MEMBERS_EDIT', hookIndex: 0, ok: r.ok, status: r.status, error: r.ok ? null : r.error }).catch(() => false)
  if (!r.ok) console.error(`[members edit] ${kind || ''} failed: ${r.status} ${r.error || ''}`)
  return r
}
