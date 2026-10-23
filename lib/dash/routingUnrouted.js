// KINDS THAT KEEP THEIR POSTER'S OLD ROOM RULE ON PURPOSE (2026-10-17). Pure data, nothing here posts or changes any behaviour.
//
// lib/dash/routing.js lists the kinds Donovan has decided a room for. Every OTHER kind that can reach Discord must be written down here, with a
// one-line reason, so a NEW kind cannot be added without somebody deciding "route it" (add it to ROUTES) or "leave it as its poster has it" (add it
// here). scripts/check-routing-coverage.mjs fails and lists any kind that is in neither place.
//
// Moving a kind from here into ROUTES is how it gets a room; removing it from here without routing it fails the check.
// Retired kinds (xSchedule mode 'retired') never post, so they need no entry.
//
// Shape: { kind: { why, who } }   who = 'everyone' | 'members' | 'me' (who sees it today), why = the plain-words reason it stays as it is.
const U = (who, why, kinds) => Object.fromEntries(kinds.map((k) => [k, Object.freeze({ who, why })]))

export const UNROUTED = Object.freeze({
  // ── live alerts: the feed always, the sport channel only for a CALLED / ON THE BOARD man (lib/dash/discordChannels.js feedHooksFor)
  ...U('everyone', 'live alert: the feed plus the sport room only when the man was called or on the board (feedHooksFor), per event', ['homer', 'td', 'nhlgoal', 'nba30']),
  // ── boards (SPORT_PLANS_ON folds their Discord delivery into plays_<sport>; the row is still written)
  ...U('everyone', 'the board: feed plus sport room; folded into the one plays_<sport> post while SPORT_PLANS_ON is on (row still recorded, X untouched)', ['board', 'nfl_board', 'nhl_board']),
  // ── the card family
  ...U('everyone', "the card post: feed plus sport room; its lead pick is what the one plays_<sport> post carries when SPORT_PLANS_ON is on", ['card_mlb', 'card_nfl', 'card_nhl', 'card_nba']),
  ...U('everyone', 'a result: never cut or narrowed (results and grades stay), goes where its poster sends it', ['card_result_mlb', 'card_result_nfl', 'card_result_nhl', 'card_result_nba', 'card_ls_result_mlb', 'card_ls_result_nfl', 'card_ls_result_nhl', 'card_ls_result_nba', 'card_don_mlb_n_man_1_result', 'card_don_mlb_n_man_2_result', 'card_don_mlb_n_man_3_result', 'card_don_nfl_n_man_1_result', 'card_don_nfl_n_man_2_result', 'card_don_nfl_n_man_3_result', 'card_don_nhl_n_man_1_result', 'card_don_nhl_n_man_2_result', 'card_don_nhl_n_man_3_result', 'card_don_nba_n_man_1_result', 'card_don_nba_n_man_2_result', 'card_don_nba_n_man_3_result', 'poll_result', 'nfl_poll_result', 'nhl_poll_result', 'nba_poll_result', 'nfl_results']),
  ...U('everyone', "the long shot of the day: feed plus sport room, no decision to move it yet", ['card_ls_mlb', 'card_ls_nfl', 'card_ls_nhl', 'card_ls_nba']),
  ...U('everyone', "Donovan's own entry post: feed plus sport room, no decision to move it yet", ['card_don_mlb', 'card_don_nfl', 'card_don_nhl', 'card_don_nba']),
  ...U('members', 'members only: the poster sends it to #members itself (never X)', ['card_members_mlb', 'card_members_nhl', 'card_members_nba', 'card_members_day', 'card_members_day_2', 'card_members_day_3', 'card_members_day_4', 'mlb_members_grade', 'nfl_members_grade']),
  // ── the plays post that replaces the old sport-room posts (lib/posts/sportPlans.js)
  ...U('everyone', "SPORT_PLANS_ON's one post per sport per day: its poster sends it to the feed plus that sport's room", ['plays_mlb', 'plays_nfl', 'plays_nhl', 'plays_nba']),
  // ── slate and write-ups
  ...U('everyone', 'old slate builders that fold into the slate; no decision of their own', ['callofnight', 'thefour', 'pregame']),
  ...U('everyone', 'write-up: the featured game goes to the sport room (sendFree); every-game copies go to #members unless MEMBERS_FOLDS_ON', ['writeup', 'writeup_mlb', 'writeup_nhl', 'writeup_nba']),
  ...U('everyone', 'THE SUNDAY SHEET: X plus the TUDDY free channel, as its poster sends it', ['sunday_sheet']),
  ...U('everyone', 'LONGSHOT TUESDAY and its result reply: X only (each sport\'s free channel already carries its daily long shot), never Discord', ['card_ls_tuesday', 'card_ls_tuesday_result']),
  ...U('everyone', 'a reply under a post that already named the man: goes where the post it answers went', ['story_t3', 'nfl_callsheet_reply', 'homer_board_reply', 'mlbhr_reply', 'miss_reply']),
  // ── the fact engine and scheduled lists
  ...U('everyone', 'fact-tier post: the feed plus the sport room, one a day at most; no decision to move it yet', ['facts', 'hotcontact', 'dangercombos', 'backtoback', 'hrleadersdow', 'matchuplines', 'matchup_hr', 'matchup_career', 'matchup_hr_late', 'matchup_career_late', 'storylines', 'storyline_watch_1', 'bestair', 'hot_month', 'hot_week', 'history_watch', 'pairswatch', 'longshot', 'nhl_longshots', 'nfl_milestone', 'nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_spotlight', 'nfl_bigweek', 'numerology']),
  ...U('everyone', 'the list post: feed plus sport room; folded into plays_<sport> while SPORT_PLANS_ON is on', ['list_mlb', 'list_nfl', 'list_nhl']),
  ...U('members', "the NFL why-board: the paid half, sent to #members only by the NFL tick (never the free feed)", ['nfl_whyboard']),
  // ── polls: the poll posts carry a poll, so they are not folded and keep the feed rule
  ...U('everyone', 'a poll question: feed plus sport room (lib/dash/polls); carries the poll so it is never folded', ['poll_pick', 'poll_over', 'poll_guess', 'poll_streak', 'poll_board', 'nfl_poll_pick', 'nfl_poll_over', 'nfl_poll_guess', 'nfl_poll_streak', 'nfl_poll_board', 'nhl_poll_pick', 'nhl_poll_over', 'nhl_poll_guess', 'nhl_poll_streak', 'nhl_poll_board', 'nba_poll_pick', 'nba_poll_over', 'nba_poll_guess', 'nba_poll_streak', 'nba_poll_board']),
  // ── moment posts
  ...U('everyone', 'a moment card: feed plus sport room, and #members when the poster adds it; the family name stands for moment_<sport>_<event>', ['moment_mlb', 'moment_nfl', 'moment_nhl', 'postseason_mlb']),
})
