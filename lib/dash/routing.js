// WHERE EVERY POST GOES: THE ONE TABLE (2026-10-16, made complete 2026-10-23, Donovan: "make sure we know what post is going where ... go
// through that system and build it right ... easy to read and easy to understand").
//
// Every kind of post that can reach Discord has ONE row here: the room(s) it goes to, who sees it, and when it posts. Nothing else decides a
// Discord channel: lib/dash/xPost.js postToDiscord sends a listed kind to its rooms (lib/dash/routeHooks.js), whatever webhooks the poster
// passed. scripts/check-routing-coverage.mjs fails on a kind that can reach Discord and is not in this table, and scripts/check-discord-posts.mjs
// renders every row from real data. The readable map is scripts/build-routing-preview.mjs.
//
// THE ROOMS (lib/dash/routeHooks.js turns a room into its webhook):
//   members   #members, paying members       DISCORD_MEMBERS_WEBHOOK (only ever reached by a poster that asked for #members)
//   sport     the product's own free channel #moonshot-mlb DISCORD_MLB_WEBHOOKS · #tuddy-nfl DISCORD_NFL_WEBHOOKS · #lamp-nhl DISCORD_NHL_WEBHOOKS ·
//                                            #buckets DISCORD_NBA_WEBHOOKS. No fallback: an unset room posts nowhere.
//   network   #dash-network                  DISCORD_OVERVIEW_WEBHOOK; until it is set, #moonshot-mlb (where these went before)
//   partner   other servers' free feed       DISCORD_PARTNER_WEBHOOKS (one webhook per server, made by that server's admin)
//   receipts  #called-it (retired 10-23, merged into #dash-network; no row uses it)
//   x         X only: never on Discord, by design
//   chosen    exactly the channel the poster picked (the /admin test button)
//   off       cut: never delivered. The row is still claimed and written (grading, receipts and the ledger read it).
//
// NEVER CUT WHAT GRADES (Donovan, 2026-10-16): no result / grade / receipt kind may be 'off' (scripts/check-routing.mjs). 'x' is allowed:
// LONGSHOT TUESDAY's result is X's own reply.
//
// A ONE-POST, TWO-ROOM KIND (a moment, a write-up): the public send goes to its public rooms, the #members send to #members, each by the
// webhooks its poster passed (a #members-only send never reaches a free room).
//
// who: 'everyone' | 'members' | 'nobody'.  when: plain words for the map.

import { membersBoxOn, BOX_CUT } from '../card/membersBox.js'
import { liveBoxOn } from './liveBox.js'

const R = (rooms, who, when) => Object.freeze({ rooms: Object.freeze(rooms), who, when, how: when })
const each = (kinds, route) => Object.fromEntries(kinds.map((k) => [k, route]))
const SPORTS = ['mlb', 'nfl', 'nhl', 'nba']
const bySport = (fn, route) => each(SPORTS.map(fn), route)

export const ROUTES = Object.freeze({
  // ═══ #MEMBERS ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  card_members_day: R(['members'], 'members', "Today's picks: every pick, line, price and why, at the first lock"),
  ...each(['card_members_day_2', 'card_members_day_3', 'card_members_day_4'], R(['members'], 'members', 'More picks: only the new ones, when a later game locks')),
  card_members_graded: R(['members'], 'members', 'The morning after, 8 AM ET: every pick of the day, hits and misses'),
  members_roundup_nhl: R(['members'], 'members', "After the night's last puck drop: every game with a pick, names and link"),
  members_roundup_nfl: R(['members'], 'members', "After the slate's last kickoff: every game with a pick, names and link"),
  members_roundup_nba: R(['members'], 'members', "After the night's last tip: every game with a pick, names and link"),
  nfl_whyboard: R(['members'], 'members', "Weekends: why TUDDY's top TD pick is the top pick"),
  mlb_members_grade: R(['members'], 'members', 'Paused: graded the MLB top-10 board, which is cut (the morning grade replaces it)'),
  nfl_members_grade: R(['members'], 'members', 'Paused: graded the NFL top-15 board, which is cut (the morning grade replaces it)'),
  ...bySport((s) => `card_members_${s}`, R(['members'], 'members', "Stored, not sent: Today's picks carries it")),

  // ═══ THE PRODUCT CHANNELS (#moonshot-mlb · #tuddy-nfl · #lamp-nhl · #buckets) ══════════════════════════════════════════════════════
  // before the games
  ...bySport((s) => `plays_${s}`, R(['sport'], 'everyone', "Tonight's play: the lead pick, at the first lock")),
  ...bySport((s) => `card_ls_${s}`, R(['sport'], 'everyone', 'The long shot of the day, before its game')),
  ...bySport((s) => `card_don_${s}`, R(['sport'], 'everyone', "Donovan's own entry, once its lock passes")),
  nhl_slate: R(['sport'], 'everyone', "LAMP's slate: the lead picks, inside the lock window"),
  sunday_sheet: R(['sport'], 'everyone', "Sunday morning: TUDDY's ranked sheet"),
  // live
  homer: R(['sport'], 'everyone', 'Live: a CALLED or ON THE BOARD hitter homers'),
  td: R(['sport'], 'everyone', 'Live: a CALLED or ON THE BOARD player scores a TD'),
  nhlgoal: R(['sport'], 'everyone', 'Live: a CALLED skater scores (and a correction if it comes off the board)'),
  nba30: R(['sport'], 'everyone', 'Live: a CALLED or ON THE BOARD player hits 30, a double-double or a triple-double'),
  alert_nflboardred: R(['sport'], 'everyone', 'Live: TUDDY WATCH, a board man in the red zone'),
  alert_scratched: R(['sport'], 'everyone', 'Paused: a board man scratched (DISCORD_BOARD_ROOM_ALERTS=on brings it back)'),
  // after the games
  ...bySport((s) => `card_result_${s}`, R(['sport'], 'everyone', 'Next morning: the Card graded, hits and misses')),
  ...bySport((s) => `card_ls_result_${s}`, R(['sport'], 'everyone', "Next morning: the long shot's result")),
  ...each(SPORTS.flatMap((s) => [1, 2, 3].map((n) => `card_don_${s}_n_man_${n}_result`)), R(['sport'], 'everyone', "Donovan's N-man, graded")),
  nfl_results: R(['sport'], 'everyone', "Monday: Sunday's TUDDY board graded"),
  nhlhardest: R(['sport'], 'everyone', 'After the games: the hardest shot of the night'),
  // a few a week
  multi_club: R(['sport'], 'everyone', 'Monday: the 2+ Club (multi-homer games)'),
  nfl_multi_club: R(['sport'], 'everyone', 'Tuesday: the 2+ Club (multi-TD games)'),
  nhl_multi_club: R(['sport'], 'everyone', 'Monday: the 2+ Club (multi-goal games)'),
  ...each(['poll_pick', 'poll_over', 'poll_guess', 'poll_streak', 'poll_board', ...['nfl', 'nhl', 'nba'].flatMap((s) => ['pick', 'over', 'guess', 'streak', 'board'].map((f) => `${s}_poll_${f}`))], R(['sport'], 'everyone', "A poll question, the day's one")),
  ...each(['poll_result', 'nfl_poll_result', 'nhl_poll_result', 'nba_poll_result'], R(['sport'], 'everyone', "The poll's answer, the next morning (needs the X poll)")),
  ...each(['nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_spotlight', 'nfl_bigweek', 'nfl_milestone'], R(['sport'], 'everyone', 'TUDDY weekday post: spotlight Tue, red zone / goal line Wed, TD history Thu, milestones, big week Mon')),
  ...each(['hotcontact', 'dangercombos', 'backtoback', 'hrleadersdow', 'matchuplines', 'matchup_hr', 'matchup_career', 'matchup_hr_late', 'matchup_career_late', 'storylines', 'storyline_watch_1', 'bestair', 'hot_month', 'hot_week', 'history_watch', 'pairswatch', 'longshot', 'numerology', 'facts'], R(['sport'], 'everyone', 'MOONSHOT stat post: one a day at most, while MLB plays')),
  nhl_longshots: R(['sport'], 'everyone', "LAMP's long shots by price, once a day"),
  // stored, not sent (SPORT_PLANS_ON folds them into Tonight's play)
  ...bySport((s) => `card_${s}`, R(['sport'], 'everyone', "Folded into Tonight's play (recorded, not sent)")),
  ...each(['board', 'nfl_board', 'nhl_board', 'list_mlb', 'list_nfl', 'list_nhl'], R(['sport'], 'everyone', "Folded into Tonight's play (recorded, not sent)")),
  // write-ups and moments: the family names (the posts themselves are matched by prefix below)
  ...each(['writeup', 'writeup_mlb', 'writeup_nhl', 'writeup_nba'], R(['sport', 'members'], 'everyone', "The featured game's write-up (free); every game's goes to the members roundup")),
  ...each(['moment_mlb', 'moment_nfl', 'moment_nhl', 'moment_nba'], R(['sport', 'members'], 'everyone', 'Live: a big moment (hat trick, 100-yard game, 30 points), free channel and #members')),

  // ═══ #DASH-NETWORK (the posts that cover every product) ══════════════════════════════════════════════════════════════════════════
  slate: R(['network'], 'everyone', "Before the first game: THE SLATE, one line per product"),
  the_five: R(['network'], 'everyone', 'Friday afternoon: the five best calls across the network'),
  film_room: R(['network'], 'everyone', 'Wednesday morning: the weekly explainer'),
  by_numbers: R(['network'], 'everyone', 'Before NHL/NBA games: jersey numbers lined up'),
  network_vs_board: R(['network'], 'everyone', "Sunday: the network's poll guesses against the board"),
  card_double_result: R(['network'], 'everyone', "Next morning: the Double's result (it spans two products)"),
  receipt: R(['network', 'partner'], 'everyone', "After the night: THE RECEIPT, every product's graded calls (and the partner servers)"),
  weekly: R(['network'], 'everyone', "Monday morning: the week's record"),
  monthly: R(['network'], 'everyone', "The 1st: the month's record"),

  // (#called-it merged into #dash-network, Donovan 2026-10-23: one post, one room)
  receipt_nocash: R(['network'], 'everyone', 'After the night: a night with calls and no cash, the misses out loud'),
  recap_nfl: R(['network'], 'everyone', 'After the last game: TUDDY recap, who was called and scored, and the misses'),
  recap_nhl: R(['network'], 'everyone', 'After the last game: LAMP recap, who was called and scored, and the misses'),

  // ═══ PARTNER SERVERS (other Discords Donovan is in; DISCORD_PARTNER_WEBHOOKS, one webhook per server, made by that server's admin) ═══
  partner_picks: R(['partner'], 'everyone', "Before the first game: each product's lead pick, as straights and as one parlay, with the site link"),
  partner_top5: R(['partner'], 'everyone', "Before the first game: tonight's top 5 names per product, with the site link"),

  // ═══ X ONLY (never on Discord, by design) ═════════════════════════════════════════════════════════════════════════════════════════
  ...each(['card_ls_tuesday', 'card_ls_tuesday_result'], R(['x'], 'nobody', 'LONGSHOT TUESDAY lives on X; each channel has its own daily long shot')),
  ...each(['story_t3', 'nfl_callsheet_reply', 'homer_board_reply', 'mlbhr_reply', 'miss_reply'], R(['x'], 'nobody', 'A reply under an X post')),

  // ═══ ADMIN ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  admin_test: R(['chosen'], 'everyone', 'A test line from /admin/discord, to the one channel picked there'),

  // ═══ CUT (Donovan, 2026-10-16: the repeats and the follow-ups). Recorded, never delivered. ═══════════════════════════════════════
  ...each(['longshots', 'nfl_longshots'], R(['off'], 'nobody', 'Cut 10-16: a repeat of the long shot of the day')),
  ...each(['top_totals', 'nfl_top_totals', 'nhl_top_totals', 'nba_top_totals'], R(['off'], 'nobody', 'Cut 10-16: X only')),
  ...each(['mlb_members_board', 'nfl_members_board', 'card_members_nfl'], R(['off'], 'nobody', "Cut 10-16: Today's picks replaces it")),
  ...each(['callofnight', 'thefour', 'pregame', 'postseason_mlb'], R(['off'], 'nobody', 'Retired: folded into THE SLATE / the night digest')),
  card_today: R(['off'], 'nobody', "Retired 10-23: the product's own pick post already names the same player (no longer posted, X included)"),
  alert_nflkick: R(['off'], 'nobody', 'Phone only: its words ("3 of your players") are about one follow list, not a room'),
  alert_slate: R(['off'], 'nobody', 'Phone only: the homer alert already carries the moment'),
  alert_gameoff: R(['off'], 'nobody', 'Phone only: its words ("2 of your picks") are about one follow list, not a room'),
})

/** Families whose kind carries an id suffix (writeup_nhl_<game>, moment_nhl_<player>_<game>_<event>, card_members_win_<...>). First match wins. */
export const PREFIX_ROUTES = Object.freeze([
  ['card_members_win_', R(['members'], 'members', 'As picks grade: the picks of the day that hit')],
  ['card_members_list_', R(['members'], 'members', 'The list of the day\'s plays, one post a sport, EDITED IN PLACE as games go: waiting, live, hit, miss, scratched')],
  ['card_members_leg_', R(['members'], 'members', 'Live: a leg of a two-leg pick (Two-Man, The Double) the moment it lands -- "✅ name homered · The Double, 1 of 2 in"')],
  ['moment_nfl_top3_', R(['off'], 'nobody', 'Cut 10-16: the night digest is X only')], ['moment_nhl_top3_', R(['off'], 'nobody', 'Cut 10-16: the night digest is X only')],
  ['moment_nba_top3_', R(['off'], 'nobody', 'Cut 10-16: the night digest is X only')], ['moment_mlb_top3_', R(['off'], 'nobody', 'Cut 10-16: the night digest is X only')],
  ['postseason_mlb_top3_', R(['off'], 'nobody', 'Cut 10-16: the night digest is X only')],
  ...SPORTS.map((s) => [`moment_${s}_`, ROUTES[`moment_${s}`]]),
  ['writeup_nfl_', R(['off'], 'nobody', 'Cut 10-16: TUDDY write-ups reach members through the roundup only')],
  ['writeup_nhl_', ROUTES.writeup_nhl], ['writeup_nba_', ROUTES.writeup_nba],
  // MOONSHOT's per-game call: the free channel keeps it (Donovan 10-09 "keep MLB"); its #members copy was cut 10-16
  ['call_', R(['sport'], 'everyone', "MOONSHOT's per-game call, lineups in, before first pitch")],
])

/** The route for a kind, or null when the table does not speak for it. */
export function routeOf(kind) {
  const k = String(kind || '')
  if (!k) return null
  if (k === 'alert_nflboardred' && liveBoxOn()) return R(['off'])      // LIVE_BOX_ON (Donovan 10-30: the red-zone post "doesn't do that much"; 25 in 10 days): not delivered, the row is still stored
  if (BOX_CUT.test(k) && membersBoxOn()) return R(['off'])      // MEMBERS_BOX_ON: the list box already shows these (lib/card/membersBox.js)
  if (ROUTES[k]) return ROUTES[k]
  for (const [prefix, route] of PREFIX_ROUTES) if (k.startsWith(prefix)) return route
  return null
}

/** True when the table sends this kind nowhere on Discord (cut, or X only). */
export const isCut = (kind) => {
  const r = routeOf(kind)
  return Boolean(r && r.rooms.length === 1 && (r.rooms[0] === 'off' || r.rooms[0] === 'x'))
}

/** Rooms a kind goes to under the table, or null when it is not listed. */
export const roomsOf = (kind) => {
  const r = routeOf(kind)
  return r ? r.rooms.filter((x) => x !== 'off' && x !== 'x') : null
}

/** Kinds that grade or show a result. The table may never cut these (checked in scripts/check-routing.mjs). */
export const GRADING_KIND = /(^|_)(result|grade|receipt|recap|weekly|monthly|autopsy)(_|$)/
