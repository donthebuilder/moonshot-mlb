// WHERE A GAME'S WRITE-UP GOES ON DISCORD -- ONE PLACE (2026-10-09, Donovan's locked FREE / MEMBERS table:
// "Write-ups: FREE = featured game only, MEMBERS = every game").
//
//   #members            EVERY game's write-up, through lib/dash/membersPost.js membersWebhook() only (no members
//                       webhook = nothing sent, nothing falls back to a public channel).
//   free sport channel  ONLY the featured game (NFL slot / NHL night / NBA night; MLB is unchanged: its free post stays per game). A game that is not
//                       featured reaches no free channel and not X; the site's game page still shows it.
//
// The members copy is not a second row: it is a flag on the write-up's own row (payload.members_sent), so no
// members text is ever stored under a separate public-readable kind. A members send that FAILED
// (members_sent === false) is retried on later ticks, at most MEMBERS_TRIES times and only before the game
// starts. The retry takes a compare-and-set on payload->>members_sent ('false' -> 'sending') before it sends, so
// two ticks can never both send, and a crash in the middle leaves 'sending' (never retried: a duplicate is
// worse than a gap).
import { postToDiscord } from '../dash/xPost'
import { membersWebhook } from '../dash/membersPost'

export const MEMBERS_TRIES = 3

/**
 * One members post. Same text as the free post, the members webhook only, logged to discord_sends. Never throws.
 * Returns true only when Discord accepted it.
 */
export async function sendMembers(text, { sport, kind }) {
  const hooks = membersWebhook()
  if (!hooks) return false
  try { return Boolean((await postToDiscord(text, { sport, kind, sportKey: sport }, hooks))?.ok) } catch { return false }
}

/**
 * The free channel send: only for a FEATURED game, only to the hooks given. Returns the postToDiscord result, or
 * null when nothing was tried (not featured / no hook).
 */
export async function sendFree(text, { sport, kind, featured, hooks, plain = false }) {
  if (!featured || !hooks) return null
  return postToDiscord(text, { ...(plain ? {} : { sport }), kind, sportKey: sport }, hooks)
}

/**
 * Retry the members copies that failed. `rows` = homer_feed_posts rows ({ day, kind, payload }) already read by the
 * caller. Only a live row whose members_sent is exactly false, with tries left, a text, and a game that has not
 * started, is touched. Returns how many it sent.
 */
export async function retryMembers(db, rows = [], { sport, now = Date.now() } = {}) {
  if (!membersWebhook()) return 0
  let sent = 0
  for (const r of rows) {
    const p = r?.payload || {}
    const tries = Number(p.members_tries) || 0
    const start = Date.parse(p.kickoff || '')
    if (p.members_sent !== false || p.mode === 'dry' || tries >= MEMBERS_TRIES) continue
    if (!p.text_full || !Number.isFinite(start) || now >= start) continue
    // compare-and-set: only one tick gets to flip 'false' to 'sending'
    const cas = await db.from('homer_feed_posts')
      .update({ payload: { ...p, members_sent: 'sending', members_tries: tries + 1 } })
      .match({ day: r.day, kind: r.kind }).filter('payload->>members_sent', 'eq', 'false').select('day')
    if (cas.error || !cas.data?.length) continue
    const ok = await sendMembers(p.text_full, { sport, kind: r.kind })
    await db.from('homer_feed_posts').update({ payload: { ...p, members_sent: ok, members_tries: tries + 1, ...(ok ? { members_at: new Date(now).toISOString() } : {}) } })
      .match({ day: r.day, kind: r.kind })
    if (ok) sent += 1
  }
  return sent
}
