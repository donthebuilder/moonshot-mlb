// REPLYING TO @MLBHR — getting the board in front of somebody else's audience.
//
// 2026-09-22, Donovan, with a screenshot of @TheStarTool replying to an
// @MLBHR home run post: "do this on twitter."
//
// It is the best distribution idea this project has had. @MLBHR posts every
// home run in baseball to 424,000 followers, and the post Donovan screenshotted
// had 154,000 views. CALLED IT has fifty followers. A reply under their post is
// the difference between publishing into an empty room and publishing into
// somebody else's full one — and it costs $0.015.
//
// VERIFIED BEFORE BUILDING (2026-09-22, live against the real API):
//   GET /2/users/by/username/MLBHR   200, 424,071 followers
//   GET /2/users/612985010/tweets    200, x-rate-limit-limit: 900 / 15 min
// Polling once a minute is 60 requests per 15 minutes against a 900 ceiling,
// so the read budget is not a constraint. The numeric id is hardcoded below
// precisely so the lookup does not have to be spent every tick.
//
// THEIR FORMAT, WHICH IS WHY THIS IS POSSIBLE AT ALL:
//
//   Dane Myers - Cincinnati Reds (8) Solo 410 feet
//   +1000
//
//   CJ Abrams - Washington Nationals (33) 2-run 404 feet
//   +650
//   2 today
//
// Name, full team name, season HR count, kind, distance, and the pregame odds.
// Everything needed to tie it to the homer_feed row this site wrote seconds
// earlier off MLB's own feed.
//
// MATCH ON PLAYER AND TEAM, NEVER ON TIME. Their post and our detection can be
// minutes apart in either direction, and on a busy night four homers land in
// the same two minutes. Timing is not identity.

import { MLB_TEAMS } from '../mlbTeams'

export const MLBHR_USER_ID = '612985010'
export const MLBHR_HANDLE = 'MLBHR'

// "José Ramírez Jr." -> "jose ramirez" — accents, punctuation and suffixes all
// differ between feeds and none of them carry meaning for a match.
export function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Their team string is "City Nickname"; ours is an abbreviation. The NICKNAME
// is the unique part (two clubs share "Sox" but not "Red Sox"/"White Sox"), so
// the match is a suffix test against lib/mlbTeams.js's own names rather than a
// second hand-kept city list.
export function abbrForTeamName(full) {
  const t = String(full || '').toLowerCase().trim()
  if (!t) return null
  let best = null
  for (const [abbr, meta] of Object.entries(MLB_TEAMS)) {
    const nick = String(meta?.name || '').toLowerCase()
    if (!nick) continue
    if (t === nick || t.endsWith(` ${nick}`)) {
      // Longest nickname wins, so "Chicago White Sox" cannot match a bare "Sox".
      if (!best || nick.length > best.nick.length) best = { abbr, nick }
    }
  }
  return best?.abbr || null
}

/**
 * Parse one @MLBHR post. Returns null for anything that isn't a home run post
 * in their standard shape — they also post milestones, recaps and replies, and
 * a post this cannot read is a post this must not act on.
 */
export function parseMlbhr(text) {
  const raw = String(text || '').trim()
  if (!raw || raw.startsWith('RT ') || raw.startsWith('@')) return null
  const first = raw.split('\n')[0].trim()
  // "Name - Team (N) Kind NNN feet"
  const m = first.match(/^(.+?)\s+-\s+(.+?)\s+\((\d+)\)\s+(.+?)\s+(\d+)\s+feet\s*$/i)
  if (!m) return null
  const team = abbrForTeamName(m[2])
  if (!team) return null
  const odds = raw.match(/^\s*([+-]\d+)\s*$/m)
  return {
    name: m[1].trim(),
    key: normName(m[1]),
    teamName: m[2].trim(),
    team,
    seasonHr: Number(m[3]),
    kind: m[4].trim(),
    distance: Number(m[5]),
    odds: odds ? odds[1] : null,
  }
}

/**
 * Find the homer_feed row an @MLBHR post is about.
 *
 * Name AND team both have to agree. Name alone is not enough: this season has
 * had two Pete Alonsos' worth of near-misses in this codebase already, and
 * replying "we had him" under the wrong man's home run is the single most
 * expensive mistake this feature can make -- it would be public, on somebody
 * else's post, in front of their whole audience.
 *
 * `rows` are today's homer_feed rows. A player who homered twice gets matched
 * on the season count when both rows carry one, and otherwise on the earliest
 * row still unclaimed, which is the order their feed posts in.
 */
export function matchHomer(parsed, rows) {
  if (!parsed) return null
  const hits = (rows || []).filter((r) => normName(r.name) === parsed.key && String(r.team || '') === parsed.team)
  if (!hits.length) return null
  if (hits.length === 1) return hits[0]
  const unclaimed = hits.filter((r) => !r.mlbhr_reply_id)
  return (unclaimed.length ? unclaimed : hits).sort((a, b) => (a.hr_n || 0) - (b.hr_n || 0))[0]
}

// ── THE REPLY ──────────────────────────────────────────────────────────────
//
// This is the one post on the account written for people who have never heard
// of it. Every other post assumes you know what a Moonshot score is; this one
// is read by somebody who came for the home run and stayed for two seconds.
//
// So it says the one thing that is actually remarkable -- the name was public
// before the pitch -- and nothing else. No score glossary, no board table, no
// "the bot knew." Rule 8: we noticed something, here is the evidence.
//
// THE LINK BELONGS HERE. A URL costs $0.200 instead of $0.015, and this repo
// spends that on five anchor posts a day. This reply is seen by strangers
// under a post doing six figures of views; if the link is worth $0.20
// anywhere, it is worth it here. That is why 'mlbhr_reply' is an anchor kind.
// ── WHICH CALLS MAY CLAIM A HOME RUN ───────────────────────────────────────
//
// Caught in the first render against real rows, and it is the same mistake
// this repo has now made three times:
//
//   #54 on this morning's Moonshot board · HRR call      (HR score 45.95)
//   #93 on this morning's Moonshot board · HR call       (HR score 36.07)
//   #1  on this morning's Moonshot board · TOP call      (HR score 83.46)
//
// Only the third is a receipt. The first is the Freddie Freeman problem
// again: HRR is the 2+ hits/runs/RBI market, a real call wearing a real
// score, and its rank on the HOME RUN board is meaningless. lib/verdict.js
// already writes the rule down -- A PICK ALWAYS WEARS ITS OWN MARKET'S SCORE
// -- so a reply about a home run may only be claimed by the markets that
// settle on one. TOP and HR. An HRR or HIT hitter going deep is a bonus, and
// the alert itself already says so.
//
// THE RANK IS PRINTED WHEN IT MEANS SOMETHING. "#93 on the board" under a
// post with 154,000 views invites exactly the reading it deserves. Above the
// cutoff the line names the call without the number -- which is not hiding
// anything: the rank is on the alert, on the card, and on /called for every
// homer, called or not. This one post is written for someone who has never
// seen any of those, and a number they cannot scale is worse than no number.
const HOMER_MARKETS = new Set(['TOP', 'HR'])
const RANK_WORTH_PRINTING = 30

export const mayClaimHomer = (role) => HOMER_MARKETS.has(String(role || '').toUpperCase())

const roleLine = (role) => ({
  TOP: 'TOP call',
  HR: 'HR call',
}[String(role || '').toUpperCase()] || 'on the board')

/**
 * `row` is the homer_feed row; `tail` is the usual {site, handle}.
 * Returns '' when there is nothing honest to say -- no role, or a role whose
 * market does not settle on a home run.
 */
export function mlbhrReplyText(row, { site = '', handle = '' } = {}) {
  if (!mayClaimHomer(row?.role)) return ''
  const rank = Number(row?.board_rank)
  const seat = (Number.isFinite(rank) && rank > 0 && rank <= RANK_WORTH_PRINTING)
    ? `#${rank} on this morning\u2019s Moonshot board \u00b7 ${roleLine(row.role)}`
    : `${roleLine(row.role)} on this morning\u2019s Moonshot board`
  const lines = ['\ud83e\udd16 CALLED IT', '', 'We had him before first pitch.', '', seat]
  if (row.hr_score != null) lines.push(`HR score ${row.hr_score}`)
  lines.push('', 'Every call is public before the games. The misses too.')
  const tail = [site, handle].filter(Boolean).join(' \u00b7 ')
  if (tail) lines.push('', tail)
  return lines.join('\n')
}
