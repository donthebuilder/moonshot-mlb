// TONIGHT'S PLAYS: ONE POST PER SPORT PER DAY IN THE SPORT ROOMS (2026-10-16, Donovan's "fewer posts so nobody mutes on day one").
//
// Today a sport room gets card_<sport> (the lead straight), the slate (slate / nhl_slate), card_today, list_<sport> and the board (board /
// nfl_board / nhl_board) as separate Discord posts. With SPORT_PLANS_ON the room gets ONE post a day: a header, the FREE lead pick only (free =
// the lead pick; the full slate is members-only and already lives in the #members briefing) and a site link.
//
//   * The lead pick's text is the card_<sport> builder's own text (lib/card/text.js via lib/card/post.js). Nothing here writes a name, a number or a result.
//   * The old kinds are still CLAIMED and RECORDED (grading, the ledger and the repeat guards read the rows); only their Discord DELIVERY stops while the
//     switch is on (lib/dash/longshotsPost.js postOnce, lib/posts/slate.js, lib/posts/lampSlate.js ask foldedForDiscord(kind)). X is untouched.
//   * The new post is the claim (day, plays_<sport>), made before it is sent, so two ticks never double it. Needs supabase/migrations/202610161950_sport_plans.sql;
//     until that is run the claim fails, the log says so and nothing is sent (the old posts are already held back, so run the SQL BEFORE flipping the switch).
//   * Results and grades are never folded: card_result_*, card_ls_result_*, *_poll_result, mlb_members_grade ... are not in FOLDED.
//
// SWITCH (env):  SPORT_PLANS_ON  default OFF; the old behaviour is untouched until Donovan flips it.
import { BRAND, appHref, sportKey } from '../routes'
import { siteUrl } from '../dash/discordCard'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { postToDiscord } from '../dash/xPost'
import { feedHooks } from '../dash/discordChannels'

export const sportPlansOn = () => /^(on|1|true)$/i.test(String(process.env.SPORT_PLANS_ON || '').trim())

/** The kind of the ONE post. */
export const playsKind = (sport) => `plays_${sportKey(sport)}`
export const isPlaysKind = (kind) => /^plays_(mlb|nfl|nhl|nba)$/.test(String(kind || ''))

/** The kinds the new post replaces in the sport rooms (recorded, not delivered, while the switch is on). */
const FOLDED = /^(card_(mlb|nfl|nhl|nba)|card_today|slate|nhl_slate|list_(mlb|nfl|nhl)|board|nfl_board|nhl_board)$/
export const isFolded = (kind) => FOLDED.test(String(kind || ''))
/** True when this kind's Discord delivery is held back right now. Server callers ask this just before their postToDiscord. */
export const foldedForDiscord = (kind) => sportPlansOn() && isFolded(kind)
/** The kind whose build text IS the free lead pick. */
export const isLeadKind = (kind) => /^card_(mlb|nfl|nhl|nba)$/.test(String(kind || ''))

const prettyDay = (day) => {
  const t = Date.parse(`${day}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '') : String(day)
}

/** The post's text. Pure. '' when there is no lead text to carry. */
export function playsText({ sport, day, leadText }) {
  const lead = String(leadText || '').trim()
  const b = BRAND[sportKey(sport)]
  if (!lead || !b) return ''
  const link = siteUrl(appHref(sport, 'home'))
  // the lead post's own title line ("🎯 LAMP's pick · Oct 22") is not repeated under this one's
  const body = lead.split('\n')
  const rest = /^\u{1F3AF}/u.test(body[0] || '') ? body.slice(body[1] === '' ? 2 : 1) : body
  return [`${b.icon} ${b.name} · Tonight's play · ${prettyDay(day)}`, '', ...rest, '', link ? `Full board: ${link}` : 'Full board on the site.'].join('\n')
}

/**
 * Deliver the day's ONE plays post for a sport: claim (day, plays_<sport>) first, then the sport room's webhooks. Returns what happened.
 * `send` / `hooks` are seams for the test script; the default is the real Discord poster and the sport's free channels.
 */
export async function deliverPlays(db, { sport, day, leadText, send = postToDiscord, hooks = null }) {
  const kind = playsKind(sport)
  const text = playsText({ sport, day, leadText })
  if (!text) return 'plays: no lead text'
  if (knownTaken(day, kind)) return 'plays: already-posted'
  const { data: claimed, error } = await db.from('homer_feed_posts')
    .upsert([{ day, kind, payload: { lead: String(leadText).slice(0, 600) } }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) { console.error(`[plays] ${kind} claim failed (run supabase/migrations/202610161950_sport_plans.sql): ${error.message}`); return 'plays: claim-failed' }
  markTaken(day, kind)
  if (!claimed?.length) return 'plays: already-posted'
  const d = await send(text, { kind, sportKey: sportKey(sport) }, hooks == null ? feedHooks(sport) : hooks)
  if (d?.ok) {
    const { error: e2 } = await db.from('homer_feed_posts').update({ discord_sent: true }).match({ day, kind })
    if (e2) console.error(`[plays] ${kind} sent but the row did not record it: ${e2.message}`)
    return 'plays: posted'
  }
  // nothing went out: release so a later tick may try again (nothing was sent, so no duplicate)
  const del = await db.from('homer_feed_posts').delete().match({ day, kind })
  if (!del?.error) unmarkTaken(day, kind)
  return 'plays: not-sent'
}
