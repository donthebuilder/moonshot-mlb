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
const fitsLimit = (arr) => arr.filter(Boolean).join('\n').length <= postLimit()

// Same shrink-from-the-bottom shape as lib/dash/tweetFeed.js's shrinkToFit:
// drop stories off the end of the list — never announce "+N more" — until
// the post fits X's 280 (270 held for the tail's margin). Whatever doesn't
// fit isn't in the post; the tab still shows every real streak.
function shrinkToFit(head, lines, tail) {
  for (let n = lines.length; n >= 0; n -= 1) {
    const body = [head, ...lines.slice(0, n), tail]
    if (fitsLimit(body)) return body.filter(Boolean).join('\n')
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
