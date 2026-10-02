// THE POST-TEXT SHAPE, ONCE (R4, 2026-10-02). lib/dash/tweetFeed.js and
// lib/nfl/tweetFeed.js each kept fitsLimit + shrinkToFit; the NFL copy was the
// MLB one without `max` (and had already missed one of its fixes once, 09-15 ->
// 09-18). This is the MLB one; `max` left out behaves exactly as NFL's did.
import { postLimit } from './postLimit'

// l != null (NOT Boolean) — see the 2026-09-15 note on shrinkToFit below for
// why the difference matters here: an intentional blank-line spacer is an
// empty string, and Boolean('') is false.
// 2026-09-18: was a hardcoded 270. Now one shared budget (lib/dash/postLimit.js)
// read at CALL time, not at import time, so X_TEXT_LIMIT moves every post on
// the account at once rather than seven separate constants in three files.
export const fitsLimit = (arr) => arr.filter((l) => l != null).join('\n').length <= postLimit()

// Same shrink-from-the-end-not-the-top shape as pregameText/pairsToWatchText
// in homerFeed.js: drop names off the bottom of the ranking, never off #1,
// until the post fits X's 280 (we hold to 270 for the tail's margin).
//
// NO "+N more on the card" (2026-09-07, Donovan: "drop this +5 more on the
// card"). It cost 19 characters -- a whole extra name -- to announce that the
// list was incomplete, which is the one thing a leaderboard should never do.
// The lines themselves were shortened at the same time (see the formatters
// below), so the post now carries five or six names where it carried three.
// Whatever doesn't fit simply isn't in the post; the card still shows the
// full ranking for anyone who opens it.
// 2026-09-15 (Donovan: "the spacing on the tweets needs to look like the
// home runs" — comparing a cramped MLB HR LEADERS post against postText()'s
// headline/blank/event/blank/data/blank/closer shape). Every post built
// through this function was head+lines+tail jammed onto consecutive lines
// with no room to breathe, and it was never a deliberate look: both this
// function and fitsLimit above filtered the array with Boolean, which drops
// an empty string same as it drops null/undefined -- so even a `''` spacer
// added here would have been silently deleted before it ever reached a
// tweet. postText() in homerFeed.js never had this bug (it filters on
// `l != null`, keeping blank lines on purpose), which is exactly why that
// post already reads like "sports media" and everything through here read
// like a database dump. Now bookends the list with one blank line after
// the headline and one before the tail -- not one between every row, which
// would blow the character budget on a ten-name board -- matching the
// "header / blank / dense list / blank / tail" shape already written down
// as the house style for recap posts (claude/moonshot-tweet-format.md,
// Format 2 "Board recap").
//
// `spaced` (2026-09-15, Donovan: "there needs be space between each name") —
// opt-in, not the default, and only wired up for hrLeadersByDowText below:
// a blank line between every row is the right call on a leaderboard with a
// handful of names, but doing that unconditionally to every shrinkToFit
// caller (Hottest Contact, Danger Combos, Birthdays, ...) would fight the
// documented Format 2 shape above for posts that were never the complaint.
// The shrink loop already drops names off the bottom to hold 270 chars, so
// spacing every row just means fewer names fit before that kicks in --
// same mechanism, no separate length handling needed.
// `lead` and `closer` (2026-09-18, Donovan's post-by-post review: "the
// headline should say WHY", "that last sentence keeps the content honest
// without killing the post"). A labelled window line under the headline
// ("HR/9 over the last 3 starts:") and a human closing line under the list
// ("Who's in the danger zone tonight?") are what turn a ranked dump into a
// post. Both shrink LAST -- names go first, the frame stays -- because a
// list with no label is the thing that confused him about HR LEADERS.
// `max` (2026-09-18, second pass). The shared budget went to 890 and every
// list post immediately ran to the bottom of its pool -- CLOSE TO A MILESTONE
// came out at 847 characters and TWENTY-ONE names, which is the exact thing
// Donovan had just objected to in ANGLES ("874 characters is not a tweet").
//
// The character budget is a CEILING, not a target. How many names a given post
// should carry is an editorial decision per post, and it belongs next to that
// post, not in a global constant. Every caller below names its own; a post
// with no `max` is one where the list length is the point (the graded results
// posts, where hiding a pick would be the whole problem).
export function shrinkToFit(head, lines, tail, { spaced = false, lead = '', closer = '', max = 0 } = {}) {
  const t = tail || null   // '' from an empty site/handle join means "no tail," not a blank line
  const capped = max > 0 ? lines.slice(0, max) : lines
  for (let n = capped.length; n >= 0; n -= 1) {
    const rows = capped.slice(0, n)
    const mid = spaced ? rows.flatMap((l) => ['', l]).slice(1) : rows
    const body = [
      head,
      lead ? '' : null, lead || null,
      mid.length ? '' : null, ...mid,
      closer ? '' : null, closer || null,
      t ? '' : null, t,
    ]
    if (fitsLimit(body)) return body.filter((l) => l != null).join('\n')
  }
  return [head, t].filter((l) => l != null).join('\n')
}
