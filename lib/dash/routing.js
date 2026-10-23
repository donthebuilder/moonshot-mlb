// THE ROUTING TABLE: WHICH KIND OF POST GOES WHERE, ONE PLACE (2026-10-16, Donovan's night-preview decisions;
// see .claude-notes/ROUTING-DECISIONS.md). Pure data and pure functions: nothing here posts anything, so it is
// plain-node testable (scripts/check-routing.mjs).
//
// A ROOM is a name; lib/dash/discordChannels.js turns a room into the webhook(s) behind it:
//   feed      DISCORD_HOMER_WEBHOOK   the public feed (the other server)
//   sport     the post's own sport channel (#moonshot-mlb / #tuddy-nfl / #lamp-nhl; NBA its own)
//   receipts  DISCORD_RECEIPTS_WEBHOOK  #called-it
//   members   DISCORD_MEMBERS_WEBHOOK   #members (private)
//   donovan   DISCORD_DONOVAN_WEBHOOK   Donovan's own server (unset = nothing is sent there)
//   off       nowhere (the kind is cut)
//
// 'off' MEANS NO DELIVERY, NEVER NO RECORD. The row (homer_feed_posts etc.) is still claimed and written, because
// grading, the receipts and the ledger read it: mlbMembersGrade / nflMembersGrade are built FROM the stored board
// row, a write-up row is what a receipt quotes. A poster must skip the SEND, not the claim or the write.
//
// NEVER CUT WHAT GRADES (Donovan, 2026-10-16): every result / grade / receipt kind stays on. card_ls_result_*,
// card_result_*, card_double_result, card_don_*_result, mlb_members_grade, nfl_members_grade, receipt, weekly, monthly.
// scripts/check-routing.mjs fails if any of them is ever listed as 'off'.
//
// A kind not listed here keeps the route its poster has always given it (the old behaviour), so adding this table
// changes nothing until a kind is listed. `routeOf(kind)` returns null for those.
//
// who: 'everyone' | 'members' | 'me'.  how: a plain-words note on frequency, for the preview page and the admin page.

const R = (rooms, who = 'everyone', how = '') => Object.freeze({ rooms: Object.freeze(rooms), who, how })

export const ROUTES = Object.freeze({
  // ── CUT (Donovan, 2026-10-16): the repeats and the follow-ups
  longshots: R(['off']), nfl_longshots: R(['off']),
  top_totals: R(['off']), nfl_top_totals: R(['off']), nhl_top_totals: R(['off']), nba_top_totals: R(['off']),
  card_members_nfl: R(['off']),
  mlb_members_board: R(['off']), nfl_members_board: R(['off']),

  // ── ROUTED
  multi_club: R(['sport']), nfl_multi_club: R(['sport']), nhl_multi_club: R(['sport']),
  card_today: R(['sport']),

  // ── #MEMBERS FOLDS (lib/dash/membersFolds.js, MEMBERS_FOLDS_ON): card_members_day is THE DAY, the one briefing; its _2.._4 kinds are
  //    now only the short '(added)' post of NEW legs when a later window locks, so they stay on. The nightly write-up roundups are members only.
  members_roundup_nhl: R(['members'], 'members', 'once a night, after the last game starts: every game with a called pick, headline and site link'),
  members_roundup_nfl: R(['members'], 'members', 'once a slate, after the last game starts: every game with a called pick, headline and site link'),
  members_roundup_nba: R(['members'], 'members', 'once a night, after the last game starts: every game with a called pick, headline and site link'),
  nhl_slate: R(['sport'], 'everyone', 'free: the lead pick only; the full slate is members'),
  // #MEMBERS WINS AND THE MORNING GRADE (2026-10-23, lib/card/wins.js): members only
  card_members_graded: R(['members'], 'members', 'the morning after: every pick of THE DAY, hits and misses'),

  // ── THE NIGHT RECAP (2026-10-16, lib/posts/recapPost.js): one post per sport per night, #called-it only (never the feed, #members or X); OFF until RECAP_POSTS_ON
  recap_nfl: R(['receipts'], 'everyone', 'once a night, after every game is final: who was called and cleared, each with a link; misses listed'),
  recap_nhl: R(['receipts'], 'everyone', 'once a night, after every game is final: who was called and cleared, each with a clip link; misses listed'),
})

/** Families whose kind carries an id suffix (writeup_nfl_<game>, moment_nhl_top3_<date>, call_<gamepk> ...). */
export const PREFIX_ROUTES = Object.freeze([
  ['writeup_nfl_', R(['off'])],
  ['call_', R(['off'])],
  ['moment_nfl_top3_', R(['off'])], ['moment_nhl_top3_', R(['off'])], ['moment_nba_top3_', R(['off'])], ['moment_mlb_top3_', R(['off'])],
  ['postseason_mlb_top3_', R(['off'])],
  ['card_members_win_', R(['members'], 'members', 'as the picks grade: the picks of THE DAY that hit')],
])

/** The route for a kind, or null when the table does not speak for it (its poster's old behaviour stands). */
export function routeOf(kind) {
  const k = String(kind || '')
  if (!k) return null
  if (ROUTES[k]) return ROUTES[k]
  for (const [prefix, route] of PREFIX_ROUTES) if (k.startsWith(prefix)) return route
  return null
}

/** True when the table cuts this kind (nothing is sent anywhere). */
export const isCut = (kind) => {
  const r = routeOf(kind)
  return Boolean(r && r.rooms.length === 1 && r.rooms[0] === 'off')
}

/** Rooms a kind goes to under the table, or null to mean "ask the poster's old rule". */
export const roomsOf = (kind) => {
  const r = routeOf(kind)
  return r ? r.rooms.filter((x) => x !== 'off') : null
}

/** Kinds that grade or show a result. The table may never cut these (checked in scripts/check-routing.mjs). */
export const GRADING_KIND = /(^|_)(result|grade|receipt|recap|weekly|monthly|autopsy)(_|$)/
