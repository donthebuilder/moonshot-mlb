// WHICH WRITE-UPS GO TO X (BATCH-GAME-WRITEUP). X charges per post, so every
// game gets a write-up on the site and in Discord, but only a slate's FEATURED
// games go to X. Picked by code -- no daily choice for Donovan ("figure it out").
//
//   NFL   TNF, SNF, MNF by kickoff slot + the Sunday-afternoon game with the most
//         EXPECTED TOUCHDOWNS (2026-10-05, Donovan: "highest expected goals or the
//         most ranked players ... same with football"): the team model's expected
//         touchdowns for the game (lib/nfl/teamTdModel.js, both clubs; 2026-10-08, was
//         a sum of the players' xTD), then the most players in the TD board's top 20;
//         with no week file, the sum of its call scores as before (4 a week).
//   NHL   (2026-10-05) the game with the most expected goals -- the board's goal
//         chances as Poisson rates, summed (lib/writeups/nhl nhlExpectedGoals) --
//         then the most players in the night's top 20. dailyFeatured rank 'xg'.
//   MLB / NHL (rule only -- posting stays off until the backtest says so):
//     1. eligible: both sides have a call, lineups posted, game not started
//     2. rank by the SUM of the two calls' scores (or the TOP call's alone,
//        whichever the backtest keeps -- lib/writeups/featuredBacktest.json)
//     3. within 2 points: the later start, then the one whose post lands
//        60-90 min before first pitch inside the posting window
//     4. no repeats: skip a club featured in the last 2 days' write-ups when
//        another game is within 5 points
// PURE: no clock (pass `now`), no I/O.
import { slateTotals } from '../nfl/teamTdModel.js'

const etParts = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const s = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false })
  const [wd, hr] = s.split(' ')
  return { wd: wd.replace(',', ''), hr: Number(hr) % 24 }
}
const sumScores = (g) => (g.calls || []).reduce((a, c) => a + (Number(c.score) || 0), 0)

/** The NFL slot a kickoff falls in: 'TNF' | 'SNF' | 'MNF' | 'SUN_DAY' | null. */
export function nflSlot(kickoff) {
  const p = etParts(kickoff)
  if (!p) return null
  if (p.wd === 'Thu' && p.hr >= 19) return 'TNF'
  if (p.wd === 'Sun' && p.hr >= 19) return 'SNF'
  if (p.wd === 'Mon' && p.hr >= 19) return 'MNF'
  if (p.wd === 'Sun') return 'SUN_DAY'   // 9:30 AM London through the 4:25 window
  return null
}

// a game's expected touchdowns (the TEAM model, lib/nfl/teamTdModel.js) and its players in the TD board's top 20
function nflGameWeight(week, logs) {
  const totals = slateTotals(week, logs)
  const players = (week?.players || []).filter((p) => p.position !== 'DEF' && p.scores?.TD != null)
  const ranked = players.slice().sort((a, b) => (b.scores.TD ?? 0) - (a.scores.TD ?? 0)).slice(0, 20)
  return (g) => {
    const teams = new Set([g.away, g.home])
    return { xtd: totals[g.game_id]?.total ?? 0, ranked: ranked.filter((p) => teams.has(p.team)).length }
  }
}

/** Featured NFL game ids for one week's nfl_game_calls.json games[] (`week` + `logs`: nfl_week.json and nfl_logs.json, for the team model's expected touchdowns). */
export function nflFeatured(games = [], week = null, logs = null) {
  const out = new Map()
  for (const g of games) {
    const s = nflSlot(g.kickoff)
    if (s && s !== 'SUN_DAY') out.set(String(g.game_id), s)
  }
  const weigh = week?.players?.length && logs ? nflGameWeight(week, logs) : null
  const day = games.filter((g) => nflSlot(g.kickoff) === 'SUN_DAY' && (g.calls || []).length)
    .map((g) => ({ ...g, _w: weigh ? weigh(g) : null }))
    .sort((a, b) => (weigh ? (b._w.xtd - a._w.xtd) || (b._w.ranked - a._w.ranked) : sumScores(b) - sumScores(a)) || String(b.kickoff).localeCompare(String(a.kickoff)))
  if (day[0]) out.set(String(day[0].game_id), 'SUN_DAY')
  return out   // game_id -> slot
}

/**
 * The featured game for a one-a-day sport (MLB / NHL).
 * @param games  [{ game_id, start, teams:[a,b], calls:[{score, role}], lineups, started, xg?, ranked? }]
 * @param opts   { rank: 'sum'|'top'|'xg'|'ranked', recentTeams: Set of clubs featured in the last 2 days, now, window: [minMs, maxMs] }
 *   xg      the game's expected goals (g.xg), then the most players in the night's top 20 (g.ranked)
 *   ranked  the most players in the night's top 20, then expected goals
 */
// how close counts as a tie (rule 3) and as "within" for the no-repeats rule (rule 4), per rank
const NEAR = { sum: [2, 5], top: [2, 5], xg: [0, 0.5], ranked: [0, 1] }   // xg / ranked: the other number breaks the tie, not the clock
export function dailyFeatured(games = [], { rank = 'sum', recentTeams = new Set(), now = null, window = [60 * 60e3, 90 * 60e3] } = {}) {
  const value = (g) => (rank === 'top'
    ? Math.max(0, ...(g.calls || []).filter((c) => c.role === 'TOP').map((c) => Number(c.score) || 0))
    : rank === 'xg' ? (Number(g.xg) || 0) + (Number(g.ranked) || 0) / 1000
      : rank === 'ranked' ? (Number(g.ranked) || 0) + (Number(g.xg) || 0) / 100
        : sumScores(g))
  const [tie, within] = NEAR[rank] || NEAR.sum
  // 1. eligible
  const elig = games.filter((g) => (g.calls || []).length >= 2 && g.lineups !== false && !g.started)
  if (!elig.length) return null
  // 2. rank
  const ranked = elig.map((g) => ({ g, v: value(g) })).sort((a, b) => b.v - a.v)
  const top = ranked[0].v
  // 3. tiebreak within 2: later start, then the one whose post lands in the window
  const inWindow = (g) => { if (now == null) return false; const lead = new Date(g.start).getTime() - now; return lead >= window[0] && lead <= window[1] }
  let pool = ranked.filter((x) => top - x.v <= tie).sort((a, b) => String(b.g.start).localeCompare(String(a.g.start)) || Number(inWindow(b.g)) - Number(inWindow(a.g)))
  // 4. no repeats: a club featured in the last 2 days steps aside for a game within 5
  const fresh = (g) => !(g.teams || []).some((t) => recentTeams.has(t))
  const pick = pool[0]
  if (!fresh(pick.g)) {
    const alt = ranked.find((x) => fresh(x.g) && pick.v - x.v <= within)
    if (alt) return alt.g
  }
  return pick.g
}
