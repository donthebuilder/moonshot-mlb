// lib/nfl/tdFeed.js — one touchdown, everything real that can be said about
// it, or nothing at all. Pure data-shaping: no fetch, no database, same
// discipline as lib/nfl/tweetFeed.js's own header note.
//
// 2026-09-13 (Donovan: "tuddy tweets should fire after every touchdown too").
// The input is one entry from lib/nfl/liveSlate.js's fetchNflLive().plays —
// already ESPN-team-normalized, already deduped from box-score parsing. This
// file turns that into a postable event, or returns null rather than guess.
//
// THE JOIN PROBLEM THIS EXISTS TO SOLVE. ESPN's scoring-play text carries no
// player id ("Kyren Williams 5 Yd Rush ..."), and every other NFL file on
// this site (logs, matchup, picks) is keyed by nflverse's gsis_id. The join
// is (normalized name, team) against nfl_roster.json (bots/nfl/nfl_roster.py)
// — normName() is the SAME function lib/nfl/liveSlate.js already uses for
// this exact kind of match, reused rather than reinvented.
//
// A MISS IS SILENCE, NEVER A GUESS. If the parsed scorer doesn't resolve to
// exactly one roster row, or the season log has nothing for him yet, those
// fields are simply omitted from the card — the live play itself (scorer
// name as ESPN wrote it, team, yardage, score, quarter/clock) never depends
// on the join and always posts. Never fabricate the parts that do.
//
// SEASON-TO-DATE MEANS "ENTERING TONIGHT." nfl_logs.json is published by the
// bot on its own schedule and does not include the game the player is
// currently drawing this card page in mid — same one-week lag nfl_pbp.py's
// own docstring already flags for anything ESPN-adjacent-but-nflverse-sourced.
// That is the correct, honest framing for this field, not a bug to chase.

import { normName } from './oddsMatch'
import { matchupTag } from './dvpSignal'

// ── classifying the play ────────────────────────────────────────────────
// liveSlate.js's parseScoringPlays already reduces ESPN's scoringType to its
// displayName ("Touchdown", "Field Goal", "Safety", ...) — the exact filter,
// no guessing needed.
export const isTouchdown = (play) => play?.type === 'Touchdown'

// The free-text description is all ESPN's summary endpoint gives for WHO
// scored — verified against real 2026 week 1/2 plays (rush, pass-reception,
// more return/defensive shapes not yet seen live — those fall through to
// the `null` case below, which still lets the play post with prettyText as
// the only "who" the card shows).
const PATTERNS = [
  { kind: 'pass', re: /^(.+?) (\d+) Yd pass from (.+?)(?:\s*\((.+?)\))?$/ },
  { kind: 'rush', re: /^(.+?) (\d+) Yd (?:Rush|Run)(?:\s*\((.+?)\))?$/ },
  { kind: 'interception return', re: /^(.+?) (\d+) Yd Interception Return(?:\s*\((.+?)\))?$/ },
  { kind: 'fumble return', re: /^(.+?) (\d+) Yd Fumble Return(?:\s*\((.+?)\))?$/ },
  { kind: 'punt return', re: /^(.+?) (\d+) Yd Punt Return(?:\s*\((.+?)\))?$/ },
  { kind: 'kickoff return', re: /^(.+?) (\d+) Yd Kickoff Return(?:\s*\((.+?)\))?$/ },
]

export function parsePlayText(text) {
  const t = String(text || '')
  for (const { kind, re } of PATTERNS) {
    const m = t.match(re)
    if (!m) continue
    if (kind === 'pass') return { kind, scorer: m[1], yards: Number(m[2]), passer: m[3] || null, note: m[4] || null }
    return { kind, scorer: m[1], yards: Number(m[2]), passer: null, note: m[3] || null }
  }
  return null
}

const KIND_WORD = {
  pass: 'PASS TD', rush: 'RUSH TD', 'interception return': 'PICK-6',
  'fumble return': 'FUMBLE RETURN TD', 'punt return': 'PUNT RETURN TD', 'kickoff return': 'KICK RETURN TD',
}
export const kindWordFor = (parsed) => (parsed && KIND_WORD[parsed.kind]) || 'TOUCHDOWN'

// ── resolving the scorer to a roster row (team + normalized name, exact) ───
// roster: the parsed nfl_roster.json ({season, players:[...]}). Returns the
// one matching row, or null on zero or MULTIPLE matches — an ambiguous
// match is exactly as unusable as no match, never resolved by guessing.
export function matchRoster(roster, name, team) {
  if (!roster?.players?.length || !name || !team) return null
  const key = normName(name)
  const hits = roster.players.filter((p) => p.team === team && normName(p.name) === key)
  if (hits.length !== 1) return null
  // 2026-09-13: nfl_roster.json was never published (its generator doesn't
  // exist in the bot repo), so the tick falls back to nfl_week.json as the
  // roster source -- and the slate keys its id as `player_id`, while every
  // downstream join (logs, picks card, matchup roles) reads `gsis_id`. They
  // are the same "00-00xxxxx" value; normalise it here so a slate-sourced row
  // enriches exactly like a real roster row would. This is what turned the
  // live cards from name-only into full cards.
  const hit = hits[0]
  return hit.gsis_id ? hit : { ...hit, gsis_id: hit.player_id || null }
}

// ── season-to-date, from the player's own log (nfl_logs.json), keyed by
// gsis_id. "Entering tonight" — see the module header on why this is
// necessarily one week behind the game in progress.
export function seasonLineFor(logs, gsisId, season) {
  const entry = logs?.logs?.[gsisId]
  const games = (entry?.log || []).filter((g) => g.s === season)
  if (!games.length) return null
  const td = games.reduce((s, g) => s + (g.g_td || 0), 0)
  const last3 = games.slice(-3)
  const last3Td = last3.reduce((s, g) => s + (g.g_td || 0), 0)
  return { games: games.length, td, last3Games: last3.length, last3Td }
}

// ── "on the bot" — this week's real TD ladder (nfl_picks.json), matched by
// gsis_id (the ladder's own rungs carry player_id already — no name match
// needed once the roster join has given us one).
export function onBotFor(picksCard, gsisId) {
  const rungs = picksCard?.TD?.rungs || []
  const hit = rungs.find((r) => r.player_id === gsisId)
  return hit ? { rank: hit.rank, score: hit.score, grade: hit.grade } : null
}

// ── the assembled event. Never throws; every enrichment field is optional
// and independently omittable.
export function buildTdEvent(play, { game, roster, logs, picksCard, matchup, season, day } = {}) {
  const parsed = parsePlayText(play.text)
  const scorerName = parsed?.scorer || null
  const rosterRow = scorerName ? matchRoster(roster, scorerName, play.team) : null
  const opponent = game ? (game.home === play.team ? game.away : game.home) : null
  const season26 = rosterRow ? seasonLineFor(logs, rosterRow.gsis_id, season) : null
  const onBot = rosterRow ? onBotFor(picksCard, rosterRow.gsis_id) : null
  // THE DEFENSE (2026-09-13, "fill those cards up" -- the box the tdCard.js
  // header used to flag as deferred). No new role/rank system needed: the
  // bot already publishes a per-player role (nfl_matchup.json's `roles`,
  // keyed by gsis_id, e.g. "RB1"/"WR2"/"Other WR") and a role-vs-defense
  // rank table (`dvp`) -- exactly what Games.js/Matchups.js already use for
  // the pregame TARGET/AVOID/EVEN tag via dvpSignal.js's matchupTag(). This
  // reuses that same function rather than inventing a second one. Needs a
  // resolved roster row (gsis_id for the roles lookup) and a known
  // opponent; either missing means this box is silently omitted, same
  // discipline as onBot and seasonToDate above.
  const defense = (rosterRow && opponent)
    ? matchupTag(matchup, { opp: opponent, player_id: rosterRow.gsis_id }, 'TD')
    : null
  return {
    day,
    gameId: play.game_id,
    // Position of this play within ITS OWN game's touchdown list, assigned
    // by touchdownsInSnap() below -- absent (null) when buildTdEvent() is
    // called directly on a bare play object that never went through it (the
    // esbuild verification harness's own samples, mainly).
    tdN: play.td_n ?? null,
    team: play.team,
    opponent,
    quarter: play.quarter,
    clock: play.clock,
    // parseScoringPlays() carries no running score (see liveSlate.js) --
    // the game's CURRENT score at fetch time is the honest substitute, and
    // for a just-happened alert the two are the same thing anyway.
    awayScore: game?.away_score ?? null,
    homeScore: game?.home_score ?? null,
    text: play.text,
    parsed,
    kindWord: kindWordFor(parsed),
    scorerName,
    gsisId: rosterRow?.gsis_id || null,
    position: rosterRow?.position || null,
    seasonToDate: season26,
    onBot,
    defense,
  }
}


// ── GROUPING LIVE PLAYS INTO NUMBERED TOUCHDOWNS (2026-09-13, wiring) ──────
// snap is a lib/nfl/liveSlate.js fetchNflLive() result. snap.plays is FLAT
// across every live game (liveSlate.js's own pull() pushes each game's
// scoring plays in turn); this regroups by game_id, drops anything that
// isn't a touchdown, and numbers what's left by POSITION within that game's
// own list -- 1st, 2nd, 3rd touchdown seen in that game so far, in the order
// ESPN already lists them (its scoringPlays array is append-only per game,
// per this file's own header note).
//
// Recomputed FRESH every call, from the CURRENT full snapshot -- never an
// incrementing counter read off what's already stored. That is what lets
// app/api/dash/nfl/tick/route.js upsert the WHOLE current list every tick
// with ON CONFLICT DO NOTHING (exactly homer_feed's own homersFrom() shape)
// and trust the database, not this function, to decide what is actually
// new.
export function touchdownsInSnap(snap) {
  const byGame = new Map()
  for (const play of snap?.plays || []) {
    if (!isTouchdown(play)) continue
    const arr = byGame.get(play.game_id) || []
    arr.push(play)
    byGame.set(play.game_id, arr)
  }
  const out = []
  for (const arr of byGame.values()) {
    arr.forEach((play, i) => out.push({ ...play, td_n: i + 1 }))
  }
  return out
}

// ── THE ROW, AND BACK (2026-09-13, wiring) ─────────────────────────────────
// "EVERYTHING ON THE ROW IS FROZEN AT FIRST SIGHT" -- homer_feed's own rule,
// carried over exactly: buildTdEvent() runs ONCE, when nfl_td_feed's insert
// first claims the row, and every field the card/post need is written down
// then. Posting (which can retry on a later tick -- see homers/tick's own
// "pending" re-read) rebuilds the same ev shape from the STORED row via
// eventFromRow(), never by re-joining roster/logs/picksCard/matchup again --
// a later roster publish or picks-ladder refresh must never change what an
// already-live card claims.
export function rowFromEvent(day, ev) {
  return {
    day,
    game_id: ev.gameId,
    td_n: ev.tdN,
    team: ev.team,
    opponent: ev.opponent,
    quarter: ev.quarter,
    clock: ev.clock,
    away_score: ev.awayScore,
    home_score: ev.homeScore,
    text: ev.text,
    kind: ev.parsed?.kind ?? null,
    kind_word: ev.kindWord,
    yards: ev.parsed?.yards ?? null,
    passer_name: ev.parsed?.passer ?? null,
    scorer_name: ev.scorerName,
    gsis_id: ev.gsisId,
    position: ev.position,
    season_to_date: ev.seasonToDate,
    on_bot: ev.onBot,
    defense: ev.defense,
  }
}

/** The ev shape tdCard()/tdPostText() expect, rebuilt from a stored row. */
export function eventFromRow(row) {
  const kind = row.kind || null
  return {
    day: row.day,
    gameId: row.game_id,
    tdN: row.td_n,
    team: row.team,
    opponent: row.opponent,
    quarter: row.quarter,
    clock: row.clock,
    awayScore: row.away_score,
    homeScore: row.home_score,
    text: row.text,
    parsed: kind ? { kind, yards: row.yards ?? null, passer: row.passer_name ?? null } : null,
    kindWord: row.kind_word,
    scorerName: row.scorer_name,
    gsisId: row.gsis_id,
    position: row.position,
    seasonToDate: row.season_to_date,
    onBot: row.on_bot,
    defense: row.defense,
  }
}

// ── THE POST TEXT (2026-09-13, wiring) ─────────────────────────────────────
// Same signature format the site's per-homer postText() already ships
// (lib/dash/homerFeed.js) and the same voice the 2026-09-13 brand plan
// locked -- "the bot called it," not "the machine saw it first" bravado
// (that line was the plan's own first draft; the "Decisions locked" section
// of the same doc superseded it same day). No Tuddy Score line: that's a
// real unified composite that doesn't exist yet (Phase 3 of the same plan),
// not something to fake here.
//
// `tail` is the same {site, handle} shape every tick route already threads
// through (empty by default -- a link in the text is 13x the per-post price
// on this account's plan, per homers/tick's own TAIL note).
export function tdPostText(ev, tail = {}) {
  const lines = ['🤖 CALLED IT']
  const scorer = ev.scorerName || 'Unnamed'
  lines.push(`🏈 ${ev.kindWord || 'TOUCHDOWN'} — ${scorer} (${ev.team})`)
  const score = (ev.awayScore != null && ev.homeScore != null) ? `${ev.awayScore}–${ev.homeScore}` : null
  const clockBit = [ev.quarter ? `Q${ev.quarter}` : null, ev.clock].filter(Boolean).join(' ')
  const scoreBit = [clockBit, score ? `${score}${ev.opponent ? ` vs ${ev.opponent}` : ''}` : null].filter(Boolean).join(' · ')
  if (scoreBit) lines.push(scoreBit)
  if (ev.onBot) lines.push(`On the bot: #${ev.onBot.rank} TD pick · ${ev.onBot.grade}`)
  else if (ev.defense) lines.push(`${ev.defense.role} vs ${ev.defense.opp}: ${ev.defense.tag} (#${ev.defense.rank} of 32 allowed)`)
  if (tail && tail.site) lines.push(tail.handle ? `${tail.site} · ${tail.handle}` : tail.site)
  return lines.join('\n')
}
