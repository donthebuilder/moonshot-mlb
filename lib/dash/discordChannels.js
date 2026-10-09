// WHICH DISCORD CHANNEL A POST GOES TO -- ONE PLACE (2026-10-02).
//
// Until now three files each carried their own copy of "the homer webhook plus
// the MLB channels" (homers/tick, nfl/tick, longshotsPost), so a touchdown
// post landed wherever MLB's did. This module is the single answer, and those
// files now ask it. Nothing here posts anything; it only names destinations,
// so it is plain-node testable (scripts/check-discord-channels.mjs).
//
//   DISCORD_HOMER_WEBHOOK       the original public feed (the other server).
//                               Every feed post still goes here, unchanged.
//   DISCORD_MLB_WEBHOOKS        #moonshot-mlb. Also the FALLBACK for NFL/NHL
//                               while theirs is unset -- exactly today's
//                               behaviour, so setting nothing changes nothing.
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

/** A sport's own channel(s); NFL and NHL fall back to the MLB list while unset. */
export function sportHooks(sport) {
  const mlb = env('DISCORD_MLB_WEBHOOKS')
  if (sport === 'nfl') { const own = env('DISCORD_NFL_WEBHOOKS'); return own.length ? own : mlb }
  if (sport === 'nhl') { const own = env('DISCORD_NHL_WEBHOOKS'); return own.length ? own : mlb }
  // BUCKETS (2026-10-03): #buckets-nba, falling back like the other two
  if (sport === 'nba') { const own = env('DISCORD_NBA_WEBHOOKS'); return own.length ? own : mlb }
  return mlb
}

/** BUCKETS' own channel(s) ONLY, with NO fallback to the MLB list: a basketball post must never land in #moonshot-mlb (BUCKETS is not public yet). Empty = post nowhere public. */
export const nbaOwnHooks = () => env('DISCORD_NBA_WEBHOOKS')

/** Every scheduled/feed post: the homer feed plus the sport's channel. Comma string for postToDiscord. */
export const feedHooks = (sport = 'mlb') => hookList(process.env.DISCORD_HOMER_WEBHOOK, sportHooks(sport)).join(',')

/**
 * A per-event feed post (a touchdown, a goal): the homer feed always, the
 * sport channel only when the man was CALLED or ON THE BOARD.
 * @param status 'called' | 'board' | 'off' (lib/callStatus.js)
 */
export const feedHooksFor = (sport, status) => (
  status === 'called' || status === 'board' ? feedHooks(sport) : hookList(process.env.DISCORD_HOMER_WEBHOOK).join(',')
)

/** #called-it. Empty string when unset. */
export const receiptsHooks = () => env('DISCORD_RECEIPTS_WEBHOOK').join(',')

/** `hooks` plus #called-it, deduped. For the recap, the week and the month. */
export const withReceipts = (hooks) => hookList(hooks, receiptsHooks()).join(',')
