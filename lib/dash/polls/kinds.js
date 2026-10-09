// X POLLS: THE KINDS, ONE PLACE (X overhaul stage 3 piece 2, 2026-10-09). No imports.
//
// Five fun/board formats, one reveal. Each post is a row in homer_feed_posts
// (day, kind), so the kind carries the sport: MLB has the bare name, the others
// a prefix (the same convention as nfl_board / nhl_longshots, and what
// lib/dash/xPolicy.sportOfKind reads).
//   poll_pick     PICK ONE        two real players on tonight's slate
//   poll_over     OVER OR UNDER   one real market bar, his real L10 count as context
//   poll_guess    GUESS THE STAT  three players, a REVEAL post after the games
//   poll_streak   STREAK WATCH    three players on a real streak: who makes it N+1
//   poll_board    BOARD QUESTION  the CALLED names from the public pregame post
//   poll_result   the reveal (INFO, quotes the poll; only a real stored outcome)
export const POLL_SPORTS = Object.freeze(['mlb', 'nfl', 'nhl', 'nba'])
export const POLL_FORMATS = Object.freeze(['pick', 'over', 'guess', 'streak', 'board'])
/** board = a question about the model's own calls; fun = an opinion/stat question. Polls alternate. */
export const CATEGORY = Object.freeze({ pick: 'fun', over: 'fun', guess: 'fun', streak: 'fun', board: 'board' })
export const FUN_ORDER = Object.freeze(['pick', 'over', 'guess', 'streak'])

// MLB is the bare name; the other sports are prefixed with their registry key
const prefixOf = (sport) => (POLL_SPORTS.includes(sport) && POLL_SPORTS[0] !== sport ? `${sport}_` : '')
/** 'poll_pick' for MLB, 'nfl_poll_pick' for the NFL, and so on. */
export const kindFor = (sport, format) => `${prefixOf(sport)}poll_${format}`
export const resultKindFor = (sport) => `${prefixOf(sport)}poll_result`

export const POLL_KINDS = Object.freeze(POLL_SPORTS.flatMap((s) => POLL_FORMATS.map((f) => kindFor(s, f))))
export const POLL_RESULT_KINDS = Object.freeze(POLL_SPORTS.map((s) => resultKindFor(s)))
export const pollKindsOf = (sport) => POLL_FORMATS.map((f) => kindFor(sport, f))
export const isPollKind = (kind) => POLL_KINDS.includes(String(kind || ''))
export const isPollResultKind = (kind) => POLL_RESULT_KINDS.includes(String(kind || ''))
/** { sport, format } for a poll kind, or null. */
export function parsePollKind(kind) {
  for (const s of POLL_SPORTS) for (const f of POLL_FORMATS) if (kindFor(s, f) === kind) return { sport: s, format: f }
  return null
}

/** How many days the same format + the same players may not repeat for a sport (NFL 7, the rest 3). */
const QUESTION_WINDOW = { nfl: 7 }     // days; any other sport 3 (lib/dash/xPolicy X_POLICY.repeatDays)
export const questionWindowDays = (sport) => QUESTION_WINDOW[sport] ?? 3

/** The 24-hour native poll. */
export const POLL_DURATION_MIN = 1440

/** X cuts a poll option at 25 characters; a name longer than that is never put in one. */
export const OPTION_MAX = 25
