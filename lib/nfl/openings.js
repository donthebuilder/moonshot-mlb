// 🏈 TUDDY'S OPENINGS (2026-10-26, Donovan: "what about nfl" after shots-to-first-score landed for BUCKETS, LAMP and MOONSHOT). One
// finished game's ESPN summary (site.web.api.espn.com .../summary?event=<id>, the host the rest of lib/nfl reads) -> one
// opening_games row, sport 'nfl' (supabase/migrations/202610221300_openings.sql, built for this):
//   jump_win_team       the club that got the ball first: the first drive's offense (after the opening kickoff)
//   first_att_*         the game's first scrimmage play: its club and clock (ESPN's plays carry no athlete ids, so no player)
//   first_score_*       the first TOUCHDOWN (not a field goal, which is what TUDDY's first-TD board grades): club, clock, 6 points,
//                       and the scorer's id when the caller can resolve him (below)
//   pre_first_att_*     each club's scrimmage plays up to and including the touchdown play (the same two columns as the other sports'
//                       "shots to the first score")
//   p1_*_pts            the score after the first quarter
//   *_type              what the first scrimmage play and the first touchdown were: 'rush' | 'pass' (| 'return' for a touchdown scored
//                       on a return) -- lib/openings/shotType.js
// Pure: no fetch, no clock, no guess. ESPN's play text names the scorer but not his id ("Foster Moreau 6 Yd pass from C.J.
// Stroud"), the same join problem lib/nfl/tdFeed.js documents: `resolveScorer(name, team)` is the caller's roster match and
// answers an id or null, and a null is left null. A scrimmage play is every play that is not a kickoff, punt, kick try, timeout,
// period / half marker, coin toss or a penalty-only entry. A touchdown scored on a kickoff or punt return is not a scrimmage
// play, so the counts stop at the last snap before it.
import { parsePlayText } from './tdFeed'

// ESPN's abbreviations differ from nflverse's on a handful of teams (lib/nfl/liveSlate.js keeps the same map)
const ABBR = { WSH: 'WAS', LAR: 'LA' }
const abbr = (x) => ABBR[String(x || '').toUpperCase()] || String(x || '').toUpperCase()

const NOT_SCRIMMAGE = /kickoff|punt|field goal|extra point|two.?point|timeout|end (?:period|of)|two.?minute|coin toss|penalty|official|start of|half|^end\b/i
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const PERIOD_S = 900, OT_START_S = 3600

/** seconds into the game from a play's period and "mm:ss" clock; null when either is unreadable */
export function gameSecond(p) {
  const n = num(p?.period?.number)
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(p?.clock?.displayValue || ''))
  if (n == null || !m) return null
  const left = Number(m[1]) * 60 + Number(m[2])
  return n <= 4 ? (n - 1) * PERIOD_S + (PERIOD_S - left) : OT_START_S + (600 - left)
}

/** The Eastern calendar day the game kicked off on, the day the TD feed keys it under. '' when the date is unreadable. */
export function kickoffDay(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)) } catch { return '' }
}

/** Every play of the game in the order they were run, each with its drive's offense. */
export function orderedPlays(summary) {
  const drives = [...(summary?.drives?.previous || []), ...(summary?.drives?.current ? [summary.drives.current] : [])]
  const out = []
  drives.forEach((d, di) => { for (const p of d?.plays || []) out.push({ p, team: abbr(d?.team?.abbreviation), drive: di }) })
  return out.sort((a, b) => (num(a.p.sequenceNumber) ?? 0) - (num(b.p.sequenceNumber) ?? 0) || a.drive - b.drive)
}

/**
 * summary: ESPN's game summary. opts.resolveScorer(name, team) -> an id or null. Returns the opening_games row, or null for a
 * game that is not final, is preseason, or has no plays.
 */
export function openingRowNfl(summary, { resolveScorer = null } = {}) {
  const comp = summary?.header?.competitions?.[0]
  if (!comp || comp?.status?.type?.completed !== true) return null
  const seasonType = num(summary?.header?.season?.type)
  if (seasonType !== 2 && seasonType !== 3) return null
  const home = abbr(comp.competitors?.find((c) => c.homeAway === 'home')?.team?.abbreviation)
  const away = abbr(comp.competitors?.find((c) => c.homeAway === 'away')?.team?.abbreviation)
  const gameDate = kickoffDay(comp.date)
  const gameId = String(summary?.header?.id || comp.id || '')
  const plays = orderedPlays(summary)
  if (!home || !away || !gameDate || !gameId || !plays.length) return null

  const row = {
    sport: 'nfl', game_id: gameId, game_date: gameDate, season: num(summary?.header?.season?.year), season_type: seasonType, home, away,
    jump_win_team: plays[0].team || null, jump_players: null,
    first_att_team: null, first_att_player: null, first_att_clock_s: null,
    first_score_team: null, first_score_player: null, first_score_clock_s: null, first_score_pts: null,
    pre_first_att_home: null, pre_first_att_away: null, first_att_type: null, first_score_type: null,
    p1_home_pts: 0, p1_away_pts: 0,
  }
  const by = new Map()
  let td = null
  for (const { p, team } of plays) {
    if (num(p?.period?.number) === 1) { row.p1_home_pts = num(p.homeScore) ?? row.p1_home_pts; row.p1_away_pts = num(p.awayScore) ?? row.p1_away_pts }
    if (td) continue
    const type = String(p?.type?.text || '')
    const isTd = p?.scoringPlay === true && /touchdown/i.test(type)
    if (team && type && !NOT_SCRIMMAGE.test(type)) {
      by.set(team, (by.get(team) || 0) + 1)
      if (!row.first_att_team) Object.assign(row, { first_att_team: team, first_att_clock_s: gameSecond(p), first_att_type: /rush|run/i.test(type) ? 'rush' : /pass|sack|interception/i.test(type) ? 'pass' : null })
    }
    if (isTd) td = { p, team }
  }
  if (td) {
    // the scoring club and the scorer's name come from ESPN's scoring-play list, where the club is stated and the text carries
    // the full name; the drive play above fixes where to stop counting. Matched on period + clock, else the first touchdown.
    const sp = (summary?.scoringPlays || []).filter((s) => s?.scoringType?.displayName === 'Touchdown')
    const at = (s) => `${num(s?.period?.number)}|${String(s?.clock?.displayValue || '')}`
    const mine = sp.find((s) => at(s) === `${num(td.p.period?.number)}|${String(td.p.clock?.displayValue || '')}`) || sp[0] || null
    const team = mine?.team?.abbreviation ? abbr(mine.team.abbreviation) : td.team
    const parsed = parsePlayText(mine?.text)
    Object.assign(row, {
      first_score_team: team, first_score_clock_s: gameSecond(td.p), first_score_pts: 6,
      first_score_player: parsed?.scorer && resolveScorer ? resolveScorer(parsed.scorer, team) || null : null,
      pre_first_att_home: by.get(home) || 0, pre_first_att_away: by.get(away) || 0,
      first_score_type: parsed ? (parsed.kind === 'pass' || parsed.kind === 'rush' ? parsed.kind : 'return') : null,
    })
  }
  return row
}

/** Upsert one game's opening. Returns an error message or null. */
export async function writeOpeningNfl(db, row, source = 'tick') {
  if (!row) return 'no row'
  const w = await db.from('opening_games').upsert([{ ...row, source }], { onConflict: 'sport,game_id' })
  return w.error ? w.error.message : null
}

/**
 * THE TICK'S PART (rides /api/dash/nfl/tick, no cron of its own): every final game on ESPN's current-week scoreboard not yet in
 * opening_games, at most `max` a call. One scoreboard read and one small select; a summary only for a game that needs writing. The
 * scorer's id is the live tick's own roster match, read from nfl_td_feed (td_n = 1) and accepted only when the name and club agree.
 * Never throws past its caller's catch.
 */
export async function nflOpeningsTick(db, { max = 3, fetchImpl = fetch } = {}) {
  if (!db) return { written: 0 }
  const BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl'
  const sb = await fetchImpl(`${BASE}/scoreboard`)
  if (!sb.ok) throw new Error(`scoreboard ${sb.status}`)
  const finals = ((await sb.json())?.events || []).filter((e) => e?.status?.type?.completed).map((e) => String(e.id))
  if (!finals.length) return { written: 0 }
  const have = await db.from('opening_games').select('game_id').eq('sport', 'nfl').in('game_id', finals)
  if (have.error) throw new Error(have.error.message)
  const on = new Set((have.data || []).map((r) => String(r.game_id)))
  const todo = finals.filter((id) => !on.has(id)).slice(0, max)
  if (!todo.length) return { written: 0 }
  const feed = await db.from('nfl_td_feed').select('game_id, team, scorer_name, gsis_id').in('game_id', todo).eq('td_n', 1)
  const first = new Map((feed.data || []).map((r) => [String(r.game_id), r]))
  const { normName } = await import('./oddsMatch')
  let written = 0
  for (const id of todo) {
    const r = await fetchImpl(`${BASE}/summary?event=${id}`)
    if (!r.ok) continue
    const f = first.get(id)
    const row = openingRowNfl(await r.json(), { resolveScorer: (name, team) => (f?.gsis_id && f.team === team && normName(f.scorer_name) === normName(name) ? f.gsis_id : null) })
    if (row && !(await writeOpeningNfl(db, row))) written += 1
  }
  return { written, waiting: finals.length - on.size - written }
}
