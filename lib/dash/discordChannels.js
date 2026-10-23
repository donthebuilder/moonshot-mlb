// WHICH DISCORD CHANNEL A POST GOES TO -- ONE PLACE (2026-10-02).
//
// Until now three files each carried their own copy of "the homer webhook plus
// the MLB channels" (homers/tick, nfl/tick, longshotsPost), so a touchdown
// post landed wherever MLB's did. This module is the single answer, and those
// files now ask it. Nothing here posts anything; it only names destinations,
// so it is plain-node testable (scripts/check-discord-channels.mjs).
//
//   DISCORD_HOMER_WEBHOOK       the original public feed (the other server). Its webhook
//                               was deleted 10-10 (the send log has nothing since); unset
//                               it adds nothing. Kept so a re-created feed still works.
//   DISCORD_MLB_WEBHOOKS        #moonshot-mlb. No longer a fallback for NFL/NHL (2026-10-23).
//   DISCORD_OVERVIEW_WEBHOOK    the network room (lib/dash/routeHooks.js 'network'); unset = #moonshot-mlb.
//   DISCORD_NFL_WEBHOOKS        #tuddy-nfl
//   DISCORD_NHL_WEBHOOKS        #lamp-nhl
//   DISCORD_RECEIPTS_WEBHOOK    #called-it: the night's recap, the week and
//                               the month -- what happened, after the fact.
//   DISCORD_MEMBERS_WEBHOOK     #members (read by lib/dash/membersPost.js;
//                               deliberately NOT routable from here).
//
// THE BOARD RULE (project brief, section 14): a moment from a man who was
// NOT on the board is not a story for a channel. `feedHooksFor` therefore
// adds the sport channel only for CALLED / ON THE BOARD; the bare homer feed
// still gets everything, as it always has.

import { bucketsOpen } from '../openSwitch.js'

const split = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

/** Deduped list from any mix of env strings and arrays. */
export const hookList = (...parts) => {
  const seen = new Set()
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : split(p)))
    .map((x) => String(x).trim())
    .filter((x) => x && !seen.has(x) && seen.add(x))
}

const env = (name) => split(process.env[name])

/** A sport's own channel(s) only. No fallback (2026-10-23): a product whose key is unset posts nowhere public, never in another product's room. */
export function sportHooks(sport) {
  if (sport === 'nfl') return env('DISCORD_NFL_WEBHOOKS')
  if (sport === 'nhl') return env('DISCORD_NHL_WEBHOOKS')
  if (sport === 'nba') return env('DISCORD_NBA_WEBHOOKS')
  return env('DISCORD_MLB_WEBHOOKS')
}

/** BUCKETS' own channel(s) ONLY, with NO fallback to the MLB list: a basketball post must never land in #moonshot-mlb (BUCKETS is not public yet). Empty = post nowhere public. */
export const nbaOwnHooks = () => env('DISCORD_NBA_WEBHOOKS')

// the BUCKETS launch switch: lib/openSwitch.js (the one function; gate.js and every poster read it)
export { bucketsOpen }

/** The public homer feed carries a sport's posts, except BUCKETS' while it is hidden. */
const homerFor = (sport) => (sport === 'nba' && !bucketsOpen() ? [] : env('DISCORD_HOMER_WEBHOOK'))

/** Every scheduled/feed post: the homer feed plus the sport's channel. Comma string for postToDiscord. NBA while BUCKETS is hidden: its own channel only. */
export const feedHooks = (sport = 'mlb') => hookList(homerFor(sport), sportHooks(sport)).join(',')

/**
 * A per-event feed post (a touchdown, a goal): the homer feed always, the
 * sport channel only when the man was CALLED or ON THE BOARD.
 * @param status 'called' | 'board' | 'off' (lib/callStatus.js)
 */
export const feedHooksFor = (sport, status) => (
  status === 'called' || status === 'board' ? feedHooks(sport) : hookList(homerFor(sport)).join(',')
)

/** THE NETWORK ROOM: #dash-network (DISCORD_OVERVIEW_WEBHOOK), else #moonshot-mlb while it is unset. Comma string. */
export const networkHooks = () => { const own = env('DISCORD_OVERVIEW_WEBHOOK'); return (own.length ? own : env('DISCORD_MLB_WEBHOOKS')).join(',') }

/** PARTNER SERVERS (2026-10-23): webhooks other servers' admins made for DASH's free feed. Comma string; '' = none. */
export const partnerHooks = () => env('DISCORD_PARTNER_WEBHOOKS').join(',')

/** #called-it (retired 2026-10-23: merged into #dash-network; kept so an old caller still resolves). Empty string when unset. */
export const receiptsHooks = () => env('DISCORD_RECEIPTS_WEBHOOK').join(',')

/** `hooks` plus #called-it, deduped. For the recap, the week and the month. */
export const withReceipts = (hooks) => hookList(hooks, receiptsHooks()).join(',')
