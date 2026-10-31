// THE #MEMBERS LIST, ONE POST PER SPORT PER SLATE, EDITED IN PLACE (batch member-requests 2B, 2026-10-25: "nowhere to go to see live plays inside
// Discord" · "the plays need to be shown better inside members"). It is the site's Called list (lib/card/listRows.js) as text: the title carries the
// count ("🏈 TUDDY · 7 plays today"), every play on a line with the price the lock froze and its status, and the same message is edited as the
// games go: WAITING -> LIVE -> HIT / MISS / SCRATCHED. That edit IS the live tracker, built once. The WORDS come from listRows (one place); the
// price, market and angle are what the lock froze; nothing is re-derived and no chance is printed.
//   WHERE   #members only: the post goes through postMembers (the validated members webhook, nothing claimed without one) and the edit through
//           lib/dash/discordEdit.js (refuses any URL that is not a #members hook). Kind card_members_list_<sport> is routed members-only
//           (lib/dash/routing.js PREFIX_ROUTES). Never X, never a public channel.
//   WHEN    the card tick's members step, every ten minutes: the first call after the lock posts it; a later call edits it only when the text
//           changed (the stored hash), so a quiet hour costs one select and no request.
//   CLAIM   homer_feed_posts (day = the card date, kind card_members_list_<sport>); needs supabase/migrations/202610260100_members_list_kinds.sql.
//           Until it runs the claim is refused (logged) and the list is skipped; every other #members post is untouched.
// Undo: MEMBERS_LIST_OFF=on stops it (the posts already out stay as they are). Nothing is deleted.
import { createHash } from 'node:crypto'
import { listEntries, listCounts, LIST_STATUS_WORD } from './listRows'
import { CARD_SPORTS } from './core'
import { hasCards } from '../cards/registry'
import { BRAND, POST_POINTER } from '../routes'
import { fmtOdds } from '../format'
import { easternDate } from '../data'
import { buildCard, calledListLink, footerOf } from '../dash/discordCard.js'

export const listKind = (sport) => `card_members_list_${sport}`
export const listOff = () => /^(on|1|true)$/i.test(String(process.env.MEMBERS_LIST_OFF || '').trim())
const DISCORD_MAX = 1900
const MARK = Object.freeze({ waiting: '⏳', live: '🔴', hit: '✅', miss: '❌', pushed: '➖', scratched: '➖' })
const COUNT_ORDER = ['live', 'waiting', 'hit', 'miss', 'scratched', 'pushed']

const prettyDay = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) } catch { return String(d || '') } }
const hashOf = (t) => createHash('sha1').update(String(t)).digest('hex').slice(0, 16)

/** The post's text for one sport's day. `entries` = listEntries(). null when there is nothing to list. Pure. */
export function listText({ sport, day, entries, now = Date.now() }) {
  if (!entries?.length) return null
  const b = BRAND[sport] || { name: String(sport).toUpperCase(), icon: '' }
  const n = entries.length
  const when = day === easternDate(now) ? 'today' : prettyDay(day)
  const counts = listCounts(entries)
  const stateLine = COUNT_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${LIST_STATUS_WORD[k].toLowerCase()}`).join(' · ')
  const head = [`${b.icon} ${b.name} · ${n} ${n === 1 ? 'play' : 'plays'} ${when}`.trim(), stateLine, '']
  const foot = ['', `The same list, on the site ${POST_POINTER.arrow} ${POST_POINTER.home} · ${b.name} · Called list`]
  const lineOf = (e) => `${MARK[e.status]} ${e.name}${e.team ? ` (${e.team})` : ''} · ${e.marketShort || e.marketWords}${e.price != null ? ` · ${fmtOdds(e.price)} at lock` : ''}${e.play && e.product !== 'straight' ? ` · ${e.play}` : ''} · ${LIST_STATUS_WORD[e.status]}`
  // every play keeps its line; the angle lines are dropped from the bottom up when the post would pass Discord's 1,900 (never a line cut in half)
  const keep = entries.map(() => true)
  const build = () => [...head, ...entries.map((e, i) => (keep[i] && e.angle ? `${lineOf(e)}\n   ${e.angle}` : lineOf(e))), ...foot].join('\n')
  for (let i = entries.length - 1; i >= 0 && build().length > DISCORD_MAX; i -= 1) keep[i] = false
  const text = build()
  return text.length <= DISCORD_MAX ? text : null     // even bare lines do not fit: post nothing rather than a cut list
}

/**
 * THE BOX: the same list as one Discord embed (the house card look, lib/dash/discordCard.js buildCard): the sport's accent bar, the count in the title,
 * the state in the description, a section per play kind (Straights / Two-Man / Long Shot) with a mark on every line, the site list as the one link.
 * The words and marks are listText's; the angle lines go (the site and The Day carry them). null when there is nothing to list. Pure.
 */
export function listEmbed({ sport, day, entries, now = Date.now() }) {
  if (!entries?.length) return null
  const b = BRAND[sport] || { name: String(sport).toUpperCase(), icon: '' }
  const n = entries.length
  const when = day === easternDate(now) ? 'today' : prettyDay(day)
  const counts = listCounts(entries)
  const stateLine = COUNT_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${LIST_STATUS_WORD[k].toLowerCase()}`).join(' \u00B7 ')
  const lineOf = (e) => `${MARK[e.status]} **${e.name}**${e.team ? ` (${e.team})` : ''} \u00B7 ${e.marketShort || e.marketWords}${e.price != null ? ` \u00B7 ${fmtOdds(e.price)}` : ''}${e.play && e.product !== 'straight' && e.withName ? ` \u00B7 with ${e.withName}` : ''}`
  const GROUPS = [['straight', 'Straights'], ['two_man', 'Two-Man'], ['n_man', 'N-man'], ['long_shot', 'Long Shot']]
  const sections = GROUPS.map(([product, name]) => ({ name, lines: entries.filter((e) => e.product === product).map(lineOf) })).filter((s) => s.lines.length)
  if (sections.length) sections[sections.length - 1].link = calledListLink(sport, `The called list, on the site`)
  return buildCard({ sport, title: `${b.icon} ${b.name} \u00B7 ${n} ${n === 1 ? 'play' : 'plays'} ${when}`.trim(), description: stateLine, sections, footer: `${footerOf(sport)} \u00B7 edits as games finish`, at: now })
}

/**
 * Post or edit the list of every sport that has locked plays on `day`. `rows` = dayRows(). Returns { [sport]: what happened }.
 * `deps` is the test seam: { membersWebhook, postMembers, edit, cardPaused }.
 */
export async function postMembersList(db, { day, rows, now = Date.now(), deps = {} } = {}) {
  if (listOff()) return 'off'
  const { membersWebhook, postMembers } = await import('../dash/membersPost')
  const hooks = (deps.membersWebhook || membersWebhook)()
  if (!hooks) return 'no-members-webhook'
  const paused = deps.cardPaused || (await import('./post')).cardPaused
  if (paused()) return 'paused'
  const post = deps.postMembers || postMembers
  const edit = deps.edit || (await import('../dash/discordEdit')).editMembersMessage
  const hook = hooks.split(',')[0].trim()
  const out = {}
  for (const sport of CARD_SPORTS) {
    if (!hasCards(sport)) continue
    const mine = (rows || []).filter((r) => r.sport === sport && String(r.card_date).slice(0, 10) === day)
    const entries = listEntries(mine, { now })
    const text = listText({ sport, day, entries, now })
    if (!text) continue
    const embed = listEmbed({ sport, day, entries, now })
    const kind = listKind(sport)
    const hash = hashOf(text)
    const { data: have, error } = await db.from('homer_feed_posts').select('payload').match({ day, kind }).maybeSingle()
    if (error) { out[sport] = `read-failed: ${error.message}`; continue }
    if (!have) { out[sport] = await post(db, { day, kind, envGate: false, build: async () => ({ text, ...(embed ? { embed } : {}), payload: { day, sport, hash, n: entries.length } }) }); continue }
    const pl = have.payload || {}
    if (pl.hash === hash) { out[sport] = 'unchanged'; continue }
    if (!pl.discord_msg?.id) { out[sport] = 'no-message-id'; continue }     // the first post did not keep Discord's id: nothing to edit (never a second post)
    const r = await edit(hook, pl.discord_msg, { text, embed, kind, sportKey: sport })
    if (!r.ok) { out[sport] = `edit-failed: ${r.status || r.error}`; continue }
    const saved = await db.from('homer_feed_posts').update({ payload: { ...pl, hash, edited_at: new Date(now).toISOString() } }).match({ day, kind })
    out[sport] = saved?.error ? `edited, not recorded: ${saved.error.message}` : 'edited'
  }
  return out
}
