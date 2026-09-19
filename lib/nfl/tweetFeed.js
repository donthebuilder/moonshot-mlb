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
import { postLimit } from '../dash/postLimit'
// Server-safe half of ScoreAnatomy's component vocabulary -- see
// lib/nfl/scoreLabels.js's own header for why it is not imported from the
// component.
import { LABELS } from './scoreLabels'

// 2026-09-18: shares the MLB side's one budget (lib/dash/postLimit.js), read at
// call time, so X_TEXT_LIMIT lengthens TUDDY's posts and MOONSHOT's together.
// `l != null`, NOT Boolean (2026-09-18). Boolean('') is false, so an
// intentional blank-line spacer was being DELETED before it could reach a
// tweet -- which is why every TUDDY post has been head+lines+tail jammed onto
// consecutive lines while MOONSHOT's read like sports media. lib/dash/
// tweetFeed.js hit exactly this and fixed it on 2026-09-15; the NFL copy of
// the helper never got the fix. Same bug, same file lineage, three days apart.
const fitsLimit = (arr) => arr.filter((l) => l != null).join('\n').length <= postLimit()

// Same shrink-from-the-bottom shape as lib/dash/tweetFeed.js's shrinkToFit:
// drop stories off the end of the list — never announce "+N more" — until
// the post fits X's 280 (270 held for the tail's margin). Whatever doesn't
// fit isn't in the post; the tab still shows every real streak.
// Bookended with one blank line after the headline and one before the tail --
// the same "header / blank / dense list / blank / tail" house shape the MLB
// side has used since 2026-09-15. `spaced` puts a blank line between every
// row, for the short lists where that reads better on a phone.
function shrinkToFit(head, lines, tail, { spaced = false, closer = '' } = {}) {
  const t = tail || null
  for (let n = lines.length; n >= 0; n -= 1) {
    const rows = lines.slice(0, n)
    const mid = spaced ? rows.flatMap((l) => ['', l]).slice(1) : rows
    const body = [
      head,
      mid.length ? '' : null, ...mid,
      closer ? '' : null, closer || null,
      t ? '' : null, t,
    ]
    if (fitsLimit(body)) return body.filter((l) => l != null).join('\n')
  }
  return [head, t].filter((l) => l != null).join('\n')
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

// ── THE WEEKLY CONTENT ENGINE (2026-09-18) ──────────────────────────────────
//
// Donovan brought a seven-format TUDDY plan. "The big mistake would be:
// 'Player projected for a touchdown.' Over and over. Instead, create
// information people actually want during football week."
//
// Three of the seven shipped here -- the three that need NO new bot work,
// verified field by field against the live Week 2 payloads before a line was
// written (see claude/tuddy-content-plan-feasibility-2026-09-18.md):
//
//   RED ZONE / GOAL LINE   players[].stats.RZ and .GL, already published, and
//                          already documented in the slate's own
//                          research_columns ("Red-zone touches per game",
//                          "Goal-line touches -- inside-10 targets, inside-5
//                          carries").
//   TD HISTORY vs OPPONENT nfl_logs' per-player log carries `opp` and `g_td`
//                          per week back to 2024. 67 players on the live Week
//                          2 slate had a TD against the team they were facing,
//                          so this is the MLB matchup-history post ported
//                          one-for-one, not a thinner version of it.
//   WHY HE'S ON THE BOARD  players[].components.TD, the per-component
//                          percentiles the bot already publishes, named
//                          through the same LABELS table the site's own
//                          ScoreAnatomy panel uses.
//
// NFL NOUN FIRST, BRAND SECOND (Donovan: "don't hide behind Tuddy. Use
// standard NFL language first, proprietary language second"). Every head
// below leads with the football concept -- NFL TOUCHDOWN BOARD, RED ZONE
// TARGETS, NFL TOUCHDOWN HISTORY -- because nobody searches "Tuddy."
//
// Deliberately NOT here, and why: a week-by-week TARGETS trend (the published
// game log carries receptions, not targets), and NGS speed/separation
// (separation needs a new nflverse pull, mph needs a scrape). Both are real
// posts once the data lands; neither is faked in the meantime.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
const one = (v) => (num(v) == null ? '' : (Math.round(num(v) * 10) / 10).toFixed(1))

/** Board players, bye weeks and blanks dropped. */
const activePlayers = (data) =>
  (Array.isArray(data?.players) ? data.players : []).filter((p) => p && !p.on_bye && txt(p.player_id))

// ── RED ZONE / GOAL LINE ────────────────────────────────────────────────────
// `stat` is 'RZ' or 'GL'. One row per player, highest first. No floor beyond
// "the number exists": these are per-game rates the bot already computed over
// his real games, so a low one simply ranks low rather than needing a guard.
export function opportunityPicks(data, stat = 'RZ', limit = 8) {
  const out = []
  for (const p of activePlayers(data)) {
    const v = num(p?.stats?.[stat])
    if (v == null || v <= 0) continue
    out.push({
      player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team) || null,
      opp: txt(p.opp) || null, position: txt(p.position) || null, value: v,
    })
  }
  out.sort((a, b) => b.value - a.value)
  return out.slice(0, limit)
}

export function opportunityText(picks, data, stat = 'RZ', { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  // The unit rides the HEAD, not every row. Repeating "red-zone touches/g" on
  // each line cost 19 characters a name and held the post to four; in the head
  // it is said once and six fit. (Donovan, on the MLB side: "make sure for the
  // text tweet we are getting as much names on there as psooible.")
  // THE SEASON THE RATE COMES FROM, SAID OUT LOUD (2026-09-18). Caught before
  // this ever posted: it is Week 2 of 2026, but the slate's own `stat_season`
  // is 2025 -- these per-game rates are LAST season's, which is the right
  // model choice two games into a year and the wrong thing to print unlabelled
  // in September. Read off the payload rather than hardcoded, so it corrects
  // itself the moment the bot rolls `stat_season` forward.
  const yr = num(data?.stat_season)
  const window = yr && yr !== num(data?.season) ? ` (${yr})` : ''
  const head = stat === 'GL'
    ? `🏈 GOAL LINE WATCH — ${weekLabel(data)}\nMost goal-line touches per game${window}:`
    : `🏈 RED ZONE TARGETS — ${weekLabel(data)}\nMost red-zone touches per game${window}:`
  const lines = picks.map((p) =>
    `${p.name} (${p.team || '?'}) ${one(p.value)}${p.opp ? ` vs ${p.opp}` : ''}`)
  return shrinkToFit(head, lines, tail)
}

// ── TD HISTORY vs THIS WEEK'S OPPONENT ──────────────────────────────────────
// The same idea as MLB's "has a HR vs tonight's starter", against a TEAM
// rather than a pitcher, because football has no equivalent of a named
// starter a hitter faces. `logs.logs[player_id].log[]` carries { s, w, opp,
// tm, g_td, ... } -- so this is a filter and a sum, nothing modelled.
//
// MIN_MEETINGS exists because "1 TD in 1 meeting" is not history, it is one
// game. Two is the floor at which the line earns the word "meetings".
const MIN_MEETINGS = 2

export function tdHistoryPicks(logs, data, limit = 8) {
  const byId = logs?.logs || {}
  const out = []
  for (const p of activePlayers(data)) {
    const opp = txt(p.opp)
    if (!opp) continue
    const log = byId[txt(p.player_id)]?.log
    if (!Array.isArray(log) || !log.length) continue
    let tds = 0
    let meetings = 0
    for (const g of log) {
      if (txt(g?.opp) !== opp) continue
      meetings += 1
      tds += num(g?.g_td) || 0
    }
    if (tds < 1 || meetings < MIN_MEETINGS) continue
    out.push({
      player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team) || null,
      opp, tds: Math.round(tds), meetings,
    })
  }
  // Most touchdowns first, then the tighter sample -- 3 in 3 is a better line
  // than 3 in 6, and saying so costs nothing.
  out.sort((a, b) => b.tds - a.tds || a.meetings - b.meetings)
  return out.slice(0, limit)
}

export function tdHistoryText(picks, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎯 NFL TOUCHDOWN HISTORY — ${weekLabel(data)}`
  const lines = picks.map((p) =>
    `${p.name} (${p.team || '?'}) ${p.tds} TD in ${p.meetings} vs ${p.opp}`)
  return shrinkToFit(head, lines, tail)
}

// ── WHY HE'S ON THE BOARD ───────────────────────────────────────────────────
// The board's top TD name, with the components that actually drove his score,
// named through the site's own LABELS table rather than a second copy of the
// vocabulary (lib/nfl/scoreLabels.js -- split out of ScoreAnatomy for exactly
// this, since that file is 'use client' and throws when imported server-side).
//
// This is the post that teaches people how the number is built, so it shows
// the components in the order the model weighted them, and it shows the score
// UNDERNEATH them rather than above -- the evidence leads, the number closes.
const WHY_ROWS = 4

export function whyOnBoardPick(data, { exclude } = {}) {
  const skip = exclude instanceof Set ? exclude : new Set()
  let best = null
  for (const p of activePlayers(data)) {
    if (skip.has(txt(p.player_id))) continue
    const score = num(p?.scores?.TD)
    const comps = p?.components?.TD
    if (score == null || !comps || !Object.keys(comps).length) continue
    if (!best || score > best.score) {
      best = {
        player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team) || null,
        opp: txt(p.opp) || null, position: txt(p.position) || null,
        score: Math.round(score * 10) / 10,
        components: Object.entries(comps)
          .map(([k, v]) => ({ key: k, label: LABELS[k] || k, value: num(v) }))
          .filter((c) => c.value != null)
          .sort((a, b) => b.value - a.value),
      }
    }
  }
  return best
}

export function whyOnBoardText(pick, data, { site = '', handle = '' } = {}) {
  if (!pick || !pick.components?.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🤖 WHY HE'S ON THE NFL TOUCHDOWN BOARD — ${weekLabel(data)}`
  const who = `${pick.name} (${pick.team || '?'})${pick.opp ? ` vs ${pick.opp}` : ''}`
  // Top three PLUS his weakest. Measured on the live board: the top TD name's
  // four best components were all exactly 100 next to a 79.5 score, which
  // reads as a typo and teaches nothing. The weakest one is what actually
  // explains the gap, and a post whose job is "here is how the number is
  // built" has to show the part that held it down.
  const comps = pick.components
  const shown = comps.length > WHY_ROWS
    ? [...comps.slice(0, WHY_ROWS - 1), comps[comps.length - 1]]
    : comps
  const rows = shown.map((c) => `${c.label}: ${Math.round(c.value)}`)
  const close = `Tuddy TD Score: ${pick.score}`
  // Hand-built rather than through shrinkToFit: the closing score line must
  // never be the thing that gets dropped to make room, and shrinkToFit only
  // ever trims from the bottom. Components come off instead, one at a time.
  for (let n = rows.length; n >= 1; n -= 1) {
    const body = [head, '', who, '', ...rows.slice(0, n), '', close, ...(tail ? ['', tail] : [])]
    if (body.join('\n').length <= postLimit()) return body.join('\n')
  }
  return ''
}

// ── BIG WEEK — ONE QB, ONE RB, ONE WR (2026-09-18) ──────────────────────────
//
// Donovan: "same deal for a player that had a big week maybe 1 rb and 1 wr and
// 1 qb who played well this week or had big game for the same type of
// highlight post." The NFL answer to MOONSHOT's HOT STRETCH.
//
// WHERE THE NUMBERS COME FROM, and why it is not the game log. `nfl_logs.json`
// only carries 2024 and 2025 -- there is no 2026 line in it at all, so "who
// had a big week THIS week" cannot come from there. The live box score does:
// `nfl_fantasy_stats.json` (the FRANCHISE scoring feed) carries real per-player
// passing/rushing/receiving yards and touchdowns for the current week, plus a
// `games` array with a `completed` flag per game.
//
// ONLY COMPLETED GAMES COUNT. The file fills as the week goes -- on a Friday it
// held 21 players from Thursday night alone. Ranking a whole week off one game
// would name a "best RB of the week" before Sunday kicked off, so the picker
// refuses below MIN_GAMES and the caller's Monday gate does the rest.
const BIG_WEEK_MIN_GAMES = 8

const bigWeekLine = (st) => {
  const py = num(st?.passing_yards) || 0
  const ry = num(st?.rushing_yards) || 0
  const rc = num(st?.receptions) || 0
  const rcy = num(st?.receiving_yards) || 0
  const td = (num(st?.passing_touchdowns) || 0) + (num(st?.rushing_touchdowns) || 0) + (num(st?.receiving_touchdowns) || 0)
  const bits = []
  if (py > 0) bits.push(`${Math.round(py)} pass yds`)
  if (ry > 0) bits.push(`${Math.round(ry)} rush yds`)
  if (rc > 0) bits.push(`${Math.round(rc)}-${Math.round(rcy)} rec`)
  if (td > 0) bits.push(`${Math.round(td)} TD`)
  return bits.join(', ')
}

// What each position is ranked BY. A quarterback's week is his arm, a back's is
// his legs plus what he caught, a receiver's is what he caught -- touchdowns
// count six for everyone, the same weight the scoreboard gives them.
const BIG_WEEK_RANK = {
  QB: (st) => (num(st?.passing_yards) || 0) + (num(st?.rushing_yards) || 0) + 60 * ((num(st?.passing_touchdowns) || 0) + (num(st?.rushing_touchdowns) || 0)),
  RB: (st) => (num(st?.rushing_yards) || 0) + (num(st?.receiving_yards) || 0) + 60 * ((num(st?.rushing_touchdowns) || 0) + (num(st?.receiving_touchdowns) || 0)),
  WR: (st) => (num(st?.receiving_yards) || 0) + 60 * (num(st?.receiving_touchdowns) || 0),
}

/**
 * One QB, one RB, one WR from the week's completed games. `stats` is the parsed
 * nfl_fantasy_stats.json; `data` is the slate, used only for name/team/position.
 * Returns [] when too little of the week has been played.
 */
export function bigWeekPicks(stats, data) {
  const games = Array.isArray(stats?.games) ? stats.games : []
  const done = games.filter((g) => g?.completed).length
  if (done < BIG_WEEK_MIN_GAMES) return []
  const byId = new Map(activePlayers(data).map((p) => [txt(p.player_id), p]))
  const best = {}
  for (const [pid, st] of Object.entries(stats?.players || {})) {
    const p = byId.get(txt(pid))
    const pos = txt(p?.position)
    const rank = BIG_WEEK_RANK[pos]
    if (!p || !rank) continue
    const v = rank(st)
    if (!(v > 0)) continue
    if (!best[pos] || v > best[pos].v) {
      best[pos] = { v, pos, player_id: txt(pid), name: txt(p.name), team: txt(p.team) || null, line: bigWeekLine(st) }
    }
  }
  return ['QB', 'RB', 'WR'].map((k) => best[k]).filter((x) => x && x.line)
}

export function bigWeekText(picks, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🏈 BIG WEEK — ${weekLabel(data)}`
  const lines = picks.map((p) => `${p.pos} ${p.name} (${p.team || '?'}) — ${p.line}`)
  return shrinkToFit(head, lines, tail)
}

// ── THE ENGAGEMENT + RECEIPTS SET (2026-09-18) ──────────────────────────────
//
// Donovan: "add more nfl tweets like the bot vs people and thinsg like that."
//
// MOONSHOT has four posts TUDDY has never had, and none of them are about
// ranking players -- they are about the AUDIENCE and about being held to
// account:
//
//   THE BOARD          what the model actually called, by position
//   BOT VS THE PEOPLE  a native X poll, the model's own pick shown next to it
//   YOUR TD CALL       an open invitation, no data at all
//   BOARD RESULTS      the same board, graded, the following morning
//
// BOARD RESULTS is the one that matters. CALLED IT's whole proposition is
// "every call graded in public — the misses too," and until now that was an
// MLB-only promise. A football audience arriving in October would have found
// an account that makes touchdown calls and never says how they went.
//
// Same discipline as everything above: no network, no database, no invented
// number. Grading takes the scorers it is given.

/** One name per position group, highest TD score. The board, not a ranking. */
export function nflBoardPicks(data, groups = ['QB', 'RB', 'WR', 'TE']) {
  const best = new Map()
  for (const p of activePlayers(data)) {
    const pos = txt(p.position).toUpperCase()
    if (!groups.includes(pos)) continue
    const score = num(p?.scores?.TD)
    if (score == null) continue
    const cur = best.get(pos)
    if (!cur || score > cur.score) {
      best.set(pos, {
        player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team) || null,
        opp: txt(p.opp) || null, position: pos, score: Math.round(score * 10) / 10,
      })
    }
  }
  return groups.map((g) => best.get(g)).filter(Boolean)
}

export function nflBoardText(picks, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  // NFL language first, TUDDY second -- the SEO rule from the content plan.
  // "NFL TOUCHDOWN BOARD" is a thing people search; "the Tuddy board" is not.
  const head = `🏈 NFL TOUCHDOWN BOARD — ${weekLabel(data)}`
  const lines = picks.flatMap((p) => [
    p.position,
    `${p.name}${p.team ? ` (${p.team})` : ''}${p.opp ? ` vs ${p.opp}` : ''} · ${p.score}`,
    '',
  ])
  if (lines[lines.length - 1] === '') lines.pop()
  const body = [head, '', ...lines, '', 'The board is on record.', ...(tail ? ['', tail] : [])]
  return fitsLimit(body)
    ? body.filter((l) => l != null).join('\n')
    : shrinkToFit(head, lines, tail, { closer: 'The board is on record.' })
}

/**
 * BOT VS THE PEOPLE. The tweet text plus the poll options, which X renders as
 * tappable buttons (see postToX's `poll` option) rather than typed A)/B)/C).
 *
 * 2026-09-18, Donovan on the MLB version: "don't waste the post by making it
 * vague... now you're creating an actual interaction between the model and
 * the audience." So the model's OWN pick is stated in the text. The poll
 * options are the next names down, so a voter is choosing against the bot
 * rather than being asked an open question with no stake.
 */
export function nflBotPollPicks(data, limit = 4) {
  const out = []
  for (const p of activePlayers(data)) {
    const score = num(p?.scores?.TD)
    if (score == null) continue
    out.push({ player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team) || null, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

export function nflBotPollText(picks, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🤖 THE BOT VS THE PEOPLE — ${weekLabel(data)}`
  const top = picks[0]
  const body = [
    head, '',
    'Who finds the end zone today?', '',
    'TUDDY:',
    `${top.name}${top.team ? ` (${top.team})` : ''}`, '',
    'YOU:',
    'Vote below.',
    ...(tail ? ['', tail] : []),
  ]
  return body.join('\n')
}

/** The poll's own buttons: X caps an option at 25 characters. */
export function nflBotPollOptions(picks) {
  return (Array.isArray(picks) ? picks : [])
    .map((p) => String(p.name || '').slice(0, 25))
    .filter(Boolean)
    .slice(0, 4)
}

/** An open invitation. No data dependency at all, on purpose. */
export function nflCommunityPickText({ site = '', handle = '' } = {}) {
  const tail = [site, handle].filter(Boolean).join(' · ')
  const lines = [
    '🏈 YOUR TOUCHDOWN CALL', '',
    'Drop one name before kickoff.', '',
    "We'll put it against the NFL touchdown board today.",
  ]
  if (tail) lines.push('', tail)
  return lines.join('\n')
}

/**
 * BOARD RESULTS. `scorers` is a Set of names that found the end zone -- the
 * caller reads them off nfl_td_feed, the same table the live touchdown alerts
 * are written to, so this grades against what the account itself posted.
 *
 * Never hides a pick: every name on the board gets ✅ or ❌, same rule as the
 * MLB accountability post. A board of four that went one-for-four says so.
 */
export function nflBoardResultsText(picks, scorers, data, { site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const hit = scorers instanceof Set ? scorers : new Set((scorers || []).map((s) => String(s).toLowerCase()))
  const has = (name) => hit.has(String(name || '').toLowerCase())
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `📋 NFL TOUCHDOWN BOARD RESULTS — ${weekLabel(data)}`
  const won = picks.filter((p) => has(p.name)).length
  const record = `${won} of ${picks.length} found the end zone.`
  const rows = picks.map((p) => `${has(p.name) ? '✅' : '❌'} ${p.position}: ${p.name}${p.team ? ` (${p.team})` : ''}`)
  const closer = won ? 'The call was in.' : "Some moments can't be modeled."
  for (let n = rows.length; n >= 1; n -= 1) {
    const body = [head, '', record, '', ...rows.slice(0, n), '', 'No edits. No hindsight.', '', closer, ...(tail ? ['', tail] : [])]
    if (fitsLimit(body)) return body.filter((l) => l != null).join('\n')
  }
  // The record goes out even with room for no names. It is the part that matters.
  return [head, '', record, ...(tail ? ['', tail] : [])].join('\n')
}

// ── WHERE HE SAT ON THE CALL SHEET (2026-09-18) ─────────────────────────────
//
// Donovan, after the MLB version shipped: "same with touch downs."
//
// The MOONSHOT reply, ported with its lessons rather than its code. The MLB
// one took three passes to get the POOL right, and the same two traps exist
// here in the same shapes:
//
//   - lib/nfl/tdFeed.js's boardRankFor() ranks across EVERY rated player on
//     the slate, hundreds of them. "#258 on the Tuddy board. It found the end
//     zone." is the football spelling of the bug MLB shipped past twice.
//   - a player can be real and rated and still never have been CALLED.
//
// So the pool is nfl_picks.json's TD ladder -- the designated calls, the same
// rungs the alert's own "#N on the Tuddy board / TD pick · A+" block reads --
// and a scorer who isn't on it gets no reply. The alert already says he wasn't
// called; this stays quiet rather than inventing a position he never held.
//
// THE LADDER IS FIVE RUNGS, not the thirty-odd MLB's board carries, so a
// window of two either side IS the whole call sheet on most weeks. That is
// better content than a slice: five names is a complete, screenshottable
// object, and the denominator says how short the list is.
const SMALL_LADDER = 6

export function tdCallNeighbors(picksCard, playerId, span = 2) {
  const id = txt(playerId)
  const rungs = (picksCard?.TD?.rungs || [])
    .filter((r) => txt(r?.player_id) && num(r?.rank) != null)
    .slice()
    .sort((a, b) => num(a.rank) - num(b.rank))
  if (!id || !rungs.length) return []
  const at = rungs.findIndex((r) => txt(r.player_id) === id)
  if (at < 0) return []
  // A short ladder shows whole. A long one clamps a window around him --
  // clamped, never wrapped, so #1 gets no phantom rows above.
  const [from, to] = rungs.length <= SMALL_LADDER
    ? [0, rungs.length]
    : [Math.max(0, at - span), Math.min(rungs.length, at + span + 1)]
  return rungs.slice(from, to).map((r) => ({
    rank: num(r.rank),
    total: rungs.length,
    player_id: txt(r.player_id),
    name: txt(r.name),
    team: txt(r.team) || null,
    score: num(r.score) != null ? Math.round(num(r.score) * 10) / 10 : null,
    grade: txt(r.grade) || null,
    him: txt(r.player_id) === id,
  }))
}

export function tdCallNeighborsText(neighbors, { site = '', handle = '' } = {}) {
  if (!Array.isArray(neighbors) || neighbors.length < 2) return ''
  const him = neighbors.find((n) => n.him)
  if (!him) return ''
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  // NFL words first, TUDDY second -- the SEO rule the whole content plan is
  // written on, and the same reason the MLB twin says CALLS rather than a
  // product name.
  const head = "📊 WHERE HE SAT ON THIS WEEK'S TD CALL SHEET"
  // The arrow rather than caps: X strips formatting, and SHOUTING one row in
  // a column of five reads as a different kind of row, not a highlighted one.
  const rows = neighbors.map((n) =>
    `${n.him ? '→ ' : '   '}${n.rank}. ${n.name}${n.team ? ` (${n.team})` : ''}${n.score != null ? ` · ${n.score}` : ''}${n.grade ? ` · ${n.grade}` : ''}`)
  const closer = him.rank === 1
    ? `Top of ${him.total} calls. It found the end zone.`
    : `#${him.rank} of ${him.total} calls. It found the end zone.`
  for (let n = rows.length; n >= 2; n -= 1) {
    // Trim from the OUTSIDE in, keeping him centred -- trimming the tail
    // would leave a window that is all names above him and none below.
    const over = rows.length - n
    const cut = rows.slice(Math.floor(over / 2), rows.length - Math.ceil(over / 2))
    if (!cut.some((l) => l.startsWith('→'))) continue
    const body = [head, '', ...cut, '', closer, tail ? '' : null, tail]
    if (fitsLimit(body)) return body.filter((l) => l != null).join('\n')
  }
  return ''
}
