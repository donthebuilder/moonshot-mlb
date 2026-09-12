// NFL MILESTONE WATCH — the automated NFL sibling of lib/dash/tweetFeed.js.
//
// Donovan, 2026-09-12 ("next please", right after Storylines shipped its two
// on-site surfaces — the tab and the Games-card inline blurb): the third and
// last original Phase 3 piece, automated social posting, "like Called It
// does for MLB." Scoped via three answered questions before any of this was
// written:
//   - same X/Discord account as MLB — lib/dash/xPost.js reused unchanged,
//     no new secrets.
//   - Milestone angle only, for now. Model narrative (lib/nfl/storylines.js's
//     modelNarrativeStories) is deliberately NOT wired in here — reframing a
//     real miss ("missed what the card priced him for, but delivered
//     somewhere else") is a fine sentence with a person reading it on the
//     Games page, but too much editorial spin for a post that goes out with
//     zero review.
//   - "a couple of slots per NFL game day" — one Thursday night, one Sunday
//     morning. Two posts a week, not two identical posts on the same day.
//
// Pure data-selection + text-formatting, same discipline as
// lib/dash/tweetFeed.js's own header note: nothing here talks to a network
// or a database. milestoneStreaks() (lib/nfl/storylines.js) is already the
// single source of truth rendering the Storylines tab and the Games-card
// blurb — this file doesn't add a new definition of "real streak," it only
// turns the same sorted list into a tweet.

import { milestoneStreaks, milestoneHeadline, weekLabel } from './storylines'

const fits270 = (arr) => arr.filter(Boolean).join('\n').length <= 270

// Same shrink-from-the-bottom shape as lib/dash/tweetFeed.js's shrinkToFit:
// drop stories off the end of the list — never announce "+N more" — until
// the post fits X's 280 (270 held for the tail's margin). Whatever doesn't
// fit isn't in the post; the tab still shows every real streak.
function shrinkToFit(head, lines, tail) {
  for (let n = lines.length; n >= 0; n -= 1) {
    const body = [head, ...lines.slice(0, n), tail]
    if (fits270(body)) return body.filter(Boolean).join('\n')
  }
  return [head, tail].filter(Boolean).join('\n')
}

// Same minStreak floor the Storylines tab uses (milestoneStreaks' own
// default) — nothing new invented here, just how many of the sorted list one
// tweet can carry. limit=4 gives shrinkToFit real headroom to drop down to
// whatever actually fits without ever being left with just one.
export function milestonePicks(logs, data, { minStreak = 3, limit = 4 } = {}) {
  return milestoneStreaks(logs, data, { minStreak }).slice(0, limit)
}

export function milestoneText(picks, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎯 MILESTONE WATCH — ${weekLabel(data)}`
  const lines = picks.map((r) => milestoneHeadline(r))
  return shrinkToFit(head, lines, tail)
}
