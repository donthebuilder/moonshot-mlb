// 🏈 LIVE SLATE, FOOTBALL — the TUDDY half of what lib/liveSlate.js does for
// baseball.
//
// Alerts existed on this site from 2026-08-06 and were baseball-only for one
// structural reason, not an oversight: MiniWire diffs a LIVE feed, and
// football had none. `nfl_results.json` is the bot's graded file — it carries
// final lines with a `graded_at` stamp, not a game in progress — so an alert
// built on it would arrive when the bot next ran, which is not an alert.
//
// This is the live feed. Same two public endpoints the bot already trusts
// (bots/nfl/nfl_espn.py): the scoreboard for game state, and the per-event
// summary for box scores. Read from the BROWSER, exactly as the MLB side
// reads statsapi.mlb.com — moonshot-mlb still publishes nothing and runs no
// bot.
//
// TWO RULES CARRIED OVER FROM THE BOT, both learned the hard way there:
//
//   1. PARSE BY LABEL, NEVER BY INDEX. ESPN reorders and adds stat columns
//      without notice; a fixed offset silently starts reading rushing average
//      as rushing yards rather than failing loudly. nfl_espn.py says this in
//      its own comment and this file obeys it.
//   2. A FAILED FETCH IS UNGRADED, NEVER ZERO. Every path here returns the
//      last good snapshot or null. A slate of zeros would fire "he's been
//      held to 0 yards" alerts across the league the moment ESPN blipped.
//
// MATCHING PLAYERS. The site's ids are nflverse gsis (`00-0033280`); ESPN's
// are its own. There is no crosswalk in the payload, so the join is on
// normalized name plus team — the same normName() the odds matcher already
// uses for the same reason. A miss is a player who gets no alert, never a
// wrong player getting one: the name AND the team have to agree.
//
// COST. One scoreboard call per poll, plus one summary call per game actually
// in progress. On an NFL Sunday that peaks around fourteen; on a Thursday it
// is two. The TTL below collapses duplicate callers the way the MLB one does.
//
// NO 'use client' DIRECTIVE, deliberately, and lib/liveSlate.js has none for
// the same reason: this is plain fetch and arithmetic with no hooks and no
// browser globals, so it runs unchanged on the server. The push cron
// (app/api/dash/push/tick) imports it to find touchdowns while nobody has the
// site open at all. A 'use client' file imported from a server route becomes a
// client reference and breaks the build — which is exactly the mistake this
// note exists to stop someone making later.

import { normName } from './oddsMatch'

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary'

// Longer than MLB's 15s: football scores about once every eight minutes across
// a whole slate, and the box score behind a single play does not change in
// twenty seconds. This is the shortest interval that buys anything real.
const TTL_MS = 30000

// ESPN's abbreviations differ from nflverse's on a handful of teams; the bot
// keeps the same map (bots/nfl/nfl_espn.py::_abbr).
const ABBR = { WSH: 'WAS', LAR: 'LA', JAX: 'JAX' }
const abbr = (x) => ABBR[String(x || '').toUpperCase()] || String(x || '').toUpperCase()

const num = (v) => {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

// "12/14" for kicking — made is the left side. Same rule as _made() in the bot.
const made = (v) => num(String(v ?? '').split('/')[0])

// nflverse column names, so a value here means what it means everywhere else
// on the site (and in bots/nfl/nfl_scoring.py's bars).
const WANT = {
  passing: { YDS: 'passing_yards' },
  rushing: { CAR: 'carries', YDS: 'rushing_yards', TD: 'rushing_tds' },
  receiving: { REC: 'receptions', YDS: 'receiving_yards', TD: 'receiving_tds' },
  kicking: { XP: 'pat_made', FG: 'fg_made' },
}

const EMPTY_LINE = {
  passing_yards: 0, carries: 0, rushing_yards: 0, rushing_tds: 0,
  receptions: 0, receiving_yards: 0, receiving_tds: 0, fg_made: 0, pat_made: 0,
}

let _snap = null
let _at = 0
let _inflight = null

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

function parseGames(payload) {
  const out = []
  for (const ev of payload?.events || []) {
    try {
      const comp = ev.competitions[0]
      const sides = {}
      for (const c of comp.competitors) sides[c.homeAway] = c
      const status = ev.status?.type || {}
      out.push({
        game_id: String(ev.id),
        kickoff: ev.date,
        home: abbr(sides.home.team.abbreviation),
        away: abbr(sides.away.team.abbreviation),
        home_score: num(sides.home.score),
        away_score: num(sides.away.score),
        state: status.state,                 // pre | in | post
        detail: status.shortDetail,
        completed: Boolean(status.completed),
        clock: ev.status?.displayClock || null,
        period: ev.status?.period ?? null,
      })
    } catch { /* one malformed event must not cost the whole board */ }
  }
  return out
}

function parseBox(data) {
  const rows = new Map()
  for (const teamBlk of data?.boxscore?.players || []) {
    const team = abbr(teamBlk?.team?.abbreviation)
    for (const cat of teamBlk?.statistics || []) {
      const want = WANT[String(cat?.name || '').toLowerCase()]
      if (!want) continue
      const labels = (cat?.labels || []).map((x) => String(x).toUpperCase())
      const idx = {}
      labels.forEach((lab, i) => { idx[lab] = i })
      for (const a of cat?.athletes || []) {
        const name = a?.athlete?.displayName || ''
        if (!name) continue
        const key = `${normName(name)}|${team}`
        const row = rows.get(key) || { name, team, ...EMPTY_LINE }
        const stats = a?.stats || []
        for (const [lab, col] of Object.entries(want)) {
          const i = idx[lab]
          if (i === undefined || i >= stats.length) continue
          row[col] = (col === 'pat_made' || col === 'fg_made') ? made(stats[i]) : num(stats[i])
        }
        rows.set(key, row)
      }
    }
  }
  return rows
}

function parseScoringPlays(data) {
  return (data?.scoringPlays || []).map((p) => ({
    quarter: p?.period?.number ?? null,
    clock: p?.clock?.displayValue || null,
    team: abbr(p?.team?.abbreviation),
    type: p?.scoringType?.displayName || '',
    text: p?.text || '',
  }))
}

async function pull() {
  let games = []
  try {
    games = parseGames(await getJSON(SCOREBOARD))
  } catch {
    // Scoreboard down: keep whatever we had. Never return an empty slate —
    // "no games" and "couldn't ask" look identical downstream and one of them
    // silently cancels every alert.
    return _snap
  }

  const live = games.filter((g) => g.state === 'in')
  const lines = new Map()
  const plays = []

  // One summary per game in progress, all at once. Failures are per game:
  // a single unreachable summary costs that game's alerts, not the slate's.
  await Promise.all(live.map(async (g) => {
    try {
      const data = await getJSON(`${SUMMARY}?event=${encodeURIComponent(g.game_id)}`)
      for (const [key, row] of parseBox(data)) lines.set(key, { ...row, game_id: g.game_id })
      for (const play of parseScoringPlays(data)) plays.push({ ...play, game_id: g.game_id })
    } catch { /* this game stays dark this tick */ }
  }))

  _snap = { at: Date.now(), games, lines, plays, liveCount: live.length }
  _at = Date.now()
  return _snap
}

/** The shared snapshot. Callers inside the TTL get the last one. */
export function fetchNflLive({ force = false } = {}) {
  if (!force && _snap && Date.now() - _at < TTL_MS) return Promise.resolve(_snap)
  if (_inflight) return _inflight
  _inflight = pull().finally(() => { _inflight = null })
  return _inflight
}

/** His live line, or null if he isn't in a box score yet. */
export function lineFor(snap, player) {
  if (!snap || !player?.name) return null
  return snap.lines.get(`${normName(player.name)}|${abbr(player.team)}`) || null
}

/** The game he's in, from the slate the site already has. */
export function gameFor(snap, player) {
  if (!snap || !player?.team) return null
  const team = abbr(player.team)
  return snap.games.find((g) => g.home === team || g.away === team) || null
}

/** Total touchdowns in a line — receiving and rushing, which is what ATD asks. */
export const tdsIn = (line) => num(line?.receiving_tds) + num(line?.rushing_tds)

/**
 * What a market's live value is, in the same units nfl_scoring's bar uses.
 * Returns null for a market this line can't speak to, so "no data" is never
 * mistaken for zero.
 */
export function marketValue(line, market) {
  if (!line) return null
  switch (market) {
    case 'TD': return tdsIn(line)
    case 'REC_YDS': return num(line.receiving_yards)
    case 'REC': return num(line.receptions)
    case 'RUSH_YDS': return num(line.rushing_yards)
    case 'RUSH_ATT': return num(line.carries)
    case 'PASS_YDS': return num(line.passing_yards)
    case 'KICK_PTS': return num(line.fg_made) * 3 + num(line.pat_made)
    default: return null
  }
}
