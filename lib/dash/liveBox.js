// THE LIVE BOX (2026-10-30, Donovan: "I want to clear up a lot of the noise ... the stuff for the basketball"). A sport's live moments of one night
// (BUCKETS 30-point games and double-doubles; LAMP and TUDDY follow) go into ONE Discord message per room per night, edited in place: each new moment is a
// new line, the message is never re-posted. It replaces one post per moment (BUCKETS: 60 in 10 days, 17 on 10-28).
//   WHERE   the same rooms the per-moment post used (the caller passes them); nothing is added to any room. Edits are silent (no ping).
//   CLAIM   homer_feed_posts (day = the game date, kind live_box_<sport>), the claim every post uses. payload.events = the lines so far,
//           payload.msgs = the message Discord made per room ({ hook (the webhook's numeric id, never its token), id, channel_id }).
//           Needs supabase/migrations/202610301200_live_box_kinds.sql; until it runs the claim is refused (logged) and the caller posts the old way.
//   LINES   a line is the moment as it was handed in, in time order; a moment is added once (its key). A long night keeps the newest lines and
//           says how many came before ("+4 earlier").
//   X       untouched: the live box is Discord only.
// LIVE_BOX_ON=on switches it on; off, every caller posts exactly as it always did. Pure parts first, then the poster.
import { buildCard, footerOf } from './discordCard.js'

const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
export const liveBoxOn = () => truthy(process.env.LIVE_BOX_ON)
export const liveKind = (sport) => `live_box_${sport}`
export const LIVE_MIGRATION = 'supabase/migrations/202610301200_live_box_kinds.sql'

/** The box's words per sport: icon + title come from the registry BRAND; here only the nouns. */
const WORDS = { nba: { when: 'tonight' }, nhl: { when: 'tonight' }, nfl: { when: 'today' }, mlb: { when: 'tonight' } }
/** Lines kept per section. A Discord field holds 1,024 characters and a long night has more moments than that. */
export const SECTION_MAX = 12

/** The lines of a section, newest kept: past SECTION_MAX the oldest collapse into one "+N earlier" line. Pure. */
export function trimLines(lines, max = SECTION_MAX) {
  if (lines.length <= max) return lines
  const drop = lines.length - (max - 1)
  return [`+${drop} earlier`, ...lines.slice(drop)]
}

/** Lines grouped into fields of at most `max` characters, never splitting a line (a game stays whole). Pure. */
export function chunkLines(lines, max = 900) {
  const out = []
  let cur = [], size = 0
  for (const l of lines || []) {
    const n = [...String(l)].length + 2
    if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0 }
    cur.push(l); size += n
  }
  if (cur.length) out.push(cur)
  return out
}

/**
 * The embed. `events` = [{ key, at, section, line, (count) }] in the order they happened; `sections` = the section names in display order
 * ([{ name, noun }]; noun is the plural in the count line, e.g. "at 30+"). `descExtra` is an optional last clause ("6 games on"). Pure.
 */
export function liveEmbed({ sport, events, sections, title, descExtra = null, at = Date.now() }) {
  if (!events?.length) return null
  const secs = sections.map((s) => ({ ...s, evs: events.filter((e) => e.section === s.name) })).filter((s) => s.evs.length)
  const desc = [...secs.map((s) => `${s.evs.length} ${s.noun}`), descExtra].filter(Boolean).join(' · ')
  return buildCard({
    sport, title, description: desc,
    // `chunk: true` (the #members night list, 2026-10-31): every game stays, split across fields of <= 900 characters ("name (cont.)"), a blank line between games;
    // a plain section keeps its newest SECTION_MAX lines. A field longer than 1024 characters loses whole games from the bottom, so a long night must be chunked.
    sections: secs.flatMap((s) => (s.chunk
      ? chunkLines(s.evs.map((e) => e.line)).map((ls, i) => ({ name: i ? `${s.name} (cont.)` : s.name, ...(s.plays ? { plays: true } : {}), lines: ls.map((l, j) => (j < ls.length - 1 ? `${l}\n\u200b` : l)) }))
      : [{ name: s.name, lines: trimLines(s.evs.map((e) => e.line)) }])),
    maxSections: 10,
    footer: `${footerOf(sport)} · edits as the ${(WORDS[sport]?.when || 'tonight') === 'today' ? 'day' : 'night'} goes`, at,
  })
}

const hookIdOf = (url) => (String(url || '').match(/webhooks\/(\d+)/) || [])[1] || ''
const splitHooks = (raw) => (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean)

/**
 * Add one moment to the sport's box for `day`, posting the box the first time and editing it after. `hooks` = the rooms (comma string or array), the
 * caller's own list. `kind` is the claim kind (default live_box_<sport>; the #members night box passes members_roundup_<sport>). `deps` is the test seam: { post, edit }. Never throws. Returns:
 *   'posted' | 'edited' | 'already-in' (the key is on the box) | 'claim-failed' (the kinds SQL has not run: the caller posts the old way) | 'no-rooms'
 *   | 'send-failed: <why>' (a refused FIRST post gives the claim back and records nothing; a refused EDIT still records the moment, so the next
 *     edit carries it. The caller's own claim on the moment is final either way: it is never posted a second time)
 */
export async function addLiveEvent(db, { sport, day, event, sections, title, descExtra = null, hooks, kind = liveKind(sport), now = Date.now(), deps = {} }) {
  try {
    const rooms = splitHooks(hooks)
    if (!rooms.length) return 'no-rooms'
    const post = deps.post || (await import('./xPost')).postToDiscord
    const edit = deps.edit || (await import('./discordEdit')).editWebhookMessage
    const { data: have, error } = await db.from('homer_feed_posts').select('payload').match({ day, kind }).maybeSingle()
    if (error) return `read-failed: ${error.message}`
    const pl = have?.payload || {}
    const events = Array.isArray(pl.events) ? pl.events : []
    if (events.some((e) => e.key === event.key)) return 'already-in'
    const next = [...events, event].sort((a, b) => (a.at - b.at) || String(a.key).localeCompare(String(b.key)))
    const embed = liveEmbed({ sport, events: next, sections, title, descExtra, at: now })
    const opts = { embed, kind, sportKey: sport, sport }
    if (!have) {
      // first moment of the night: claim, then post one message per room and keep each message's id
      const claim = await db.from('homer_feed_posts').upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
      if (claim.error) { console.error(`[live box] ${kind} claim failed: ${claim.error.message}`); return 'claim-failed' }
      if (!claim.data?.length) return 'already-in'          // another tick claimed it a moment ago: this moment comes in on the next one
      const msgs = []
      let failed = ''
      for (const hook of rooms) {
        const r = await post(embed.title, { ...opts, wait: true }, hook).catch((e) => ({ ok: false, error: String(e?.message || e) }))
        if (r?.ok && r.messages?.[0]) msgs.push({ hook: hookIdOf(hook), id: r.messages[0].id, channel_id: r.messages[0].channel_id })
        else if (!r?.ok) failed = String(r?.error || r?.status || 'refused')
      }
      if (!msgs.length) { await db.from('homer_feed_posts').delete().match({ day, kind }).then(() => null, () => null); return `send-failed: ${failed || 'no message made'}` }
      const saved = await db.from('homer_feed_posts').update({ payload: { events: next, msgs }, discord_sent: true }).match({ day, kind })
      return saved?.error ? `posted, not recorded: ${saved.error.message}` : 'posted'
    }
    const msgs = Array.isArray(pl.msgs) ? pl.msgs : []
    if (!msgs.length) return 'send-failed: the box has no message id to edit'
    let okAny = false
    for (const m of msgs) {
      const hook = rooms.find((h) => hookIdOf(h) === m.hook)
      if (!hook) continue
      const r = await edit(hook, m, { ...opts, text: embed.title })
      if (r.ok) okAny = true
    }
    // the moment is recorded either way: a refused edit is carried by the next one
    const saved = await db.from('homer_feed_posts').update({ payload: { ...pl, events: next, ...(okAny ? { edited_at: new Date(now).toISOString() } : {}) } }).match({ day, kind })
    if (!okAny) return 'send-failed: edit refused (recorded; the next edit carries it)'
    return saved?.error ? `edited, not recorded: ${saved.error.message}` : 'edited'
  } catch (e) { return `error: ${e?.message || e}` }
}
