// 🏒 LAMP FIRST GOAL, lamp-first-v1 (2026-10-27, Donovan: "make more clear on who the site likes for first goal ... I want these
// players ranked for first anything"). Who scores the game's FIRST goal, ranked inside each game. A RANK, never a chance.
//
//   rate   = the average of two pulled-in rates: his goals per game, and his shots per game x the league's 9.5% shooting
//            (each pulled toward the league: 20 games of weight at 0.12 a game)
//   value  = rate x his club's first-goal rate (this season's games before the day, pulled toward 50%: 20 games of weight)
//   rank   = the order of value inside the game, both clubs' dressed skaters
//   CALLED = #1 in the game · ON THE BOARD = #2-#3 · NOT ON THE BOARD = the rest   (one first goal a game, so one call a game)
//   target = he scores the game's first goal (shootout goals do not count). Not dressed = void.
//
// BACKTEST (claude/BACKTEST-FIRSTS-NHL-NFL-2026-10-27.txt, walk-forward, 2025-26 regular season, 1,237 games, skaters with 5+ prior
// games), hits of the game's first goal at #1 / top 3 / top 10 (random: 2.9% / 8.6% / 28.7%):
//   goals x club (the first cut)  79 / 233 / 613      goals + shots blend x club (THIS)  81 / 250 / 626 = 6.5% / 20.2% / 50.6%
//   + ice time                    76 / 251 / 615 (no better than the blend)      shots alone x club  83 / 245 / 612
// Ice time adds nothing on top of the blend; the power play and the goalie are not in v1 (not yet measured to help).
import { propRow } from './ptsModel'
import { versionsFor, CURRENT } from './versions'

export const MARKET = 'FIRST'
export const MODEL_VERSION = CURRENT.first
export const BAR = 1
export const LEGS = ['goalsPg', 'shotsPg', 'clubFirst', 'clubX', 'firstVal']
export const LEAGUE_SHOOT_PCT = 0.095
export const MIN_GP = 5
export const RATE_PRIOR_GAMES = 20, LEAGUE_GOALS_PG = 0.12, CLUB_PRIOR_GAMES = 20
export const CALLED_RANK = 1, BOARD_RANK = 3

const fin = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : null)
/** His goals per game pulled toward the league by games played. */
export const shrinkGoals = (goalsPg, gp) => ((fin(goalsPg) ?? 0) * (fin(gp) ?? 0) + RATE_PRIOR_GAMES * LEAGUE_GOALS_PG) / ((fin(gp) ?? 0) + RATE_PRIOR_GAMES)
/** His shots per game turned into a goal rate at the league's shooting %, pulled toward the league the same way. */
export const shrinkShots = (shotsPg, gp) => ((fin(shotsPg) ?? 0) * (fin(gp) ?? 0) * LEAGUE_SHOOT_PCT + RATE_PRIOR_GAMES * LEAGUE_GOALS_PG) / ((fin(gp) ?? 0) + RATE_PRIOR_GAMES)
/** A club's chance to score first: firsts of games, pulled toward 50%. */
export const clubFirstRate = (firsts, games) => ((fin(firsts) ?? 0) + CLUB_PRIOR_GAMES / 2) / ((fin(games) ?? 0) + CLUB_PRIOR_GAMES)

/** opening_games rows (home, away, first_score_team), games BEFORE the day -> Map(club -> { firsts, games }). */
export function clubFirstCounts(rows) {
  const m = new Map()
  const bump = (t, first) => { if (!t) return; const c = m.get(t) || { firsts: 0, games: 0 }; c.games += 1; if (first) c.firsts += 1; m.set(t, c) }
  for (const r of rows || []) { bump(r.home, r.first_score_team === r.home); bump(r.away, r.first_score_team === r.away) }
  return m
}

/**
 * candidates: [{ gameId, playerId, name, pos, team, opp, home, legs: { ok, goalsPg, gpPooled }, context }] (the goal board's)
 * counts: Map(club -> { firsts, games }). Returns { rows, byGame: Map(gameId -> rows) } in the shape the other shadows use.
 */
export function scoreFirstNight(candidates, counts = new Map()) {
  const rows = candidates.map((c) => {
    const base = { gameId: c.gameId, playerId: c.playerId, name: c.name, pos: c.pos, team: c.team, opp: c.opp, home: c.home, context: c.context || null, pct: null }
    const gp = fin(c.legs?.gpPooled)
    if (!c.legs?.ok) return { ...base, legs: c.legs, score: null, rank: null, status: 'off', reason: c.legs?.reason || 'not scored' }
    if (gp == null || gp < MIN_GP) return { ...base, legs: { ...c.legs, ok: false }, score: null, rank: null, status: 'off', reason: `fewer than ${MIN_GP} games this season` }
    const cc = counts.get(c.team) || { firsts: 0, games: 0 }
    const clubFirst = clubFirstRate(cc.firsts, cc.games)
    const goalsPg = shrinkGoals(c.legs.goalsPg, gp), shotsPg = shrinkShots(c.legs.shotsPg, gp)
    return { ...base, legs: { ...c.legs, goalsPg, shotsPg, clubFirst, clubX: clubFirst * 2, firstVal: ((goalsPg + shotsPg) / 2) * clubFirst }, score: null, rank: null, status: 'off', reason: null }
  })
  const scored = rows.filter((r) => r.legs?.firstVal != null)
  // 0-100 = where his value sits among tonight's scored skaters (a rank among players, not a chance)
  const sorted = [...scored].sort((a, b) => a.legs.firstVal - b.legs.firstVal)
  sorted.forEach((r, i) => { r.score = sorted.length > 1 ? Math.round((100 * i) / (sorted.length - 1)) : 100 })
  const byGame = new Map()
  for (const r of scored) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) {
    list.sort((a, b) => (b.legs.firstVal - a.legs.firstVal) || String(a.name).localeCompare(String(b.name)))
    list.forEach((r, i) => {
      r.rank = i + 1
      r.status = r.rank <= CALLED_RANK ? 'called' : r.rank <= BOARD_RANK ? 'board' : 'off'
      r.reason = r.status === 'off' ? `#${r.rank} in the game for the first goal (the top ${BOARD_RANK} are on the board)` : null
    })
  }
  // every candidate, scored or not, per game (the others' shape): unscored men carry their reason
  const all = new Map()
  for (const r of rows) { if (!all.has(r.gameId)) all.set(r.gameId, []); all.get(r.gameId).push(r) }
  return { rows, byGame: all }
}

/** Grade: hit = he scored the game's first goal. ctx.firstScorer = the opening's first_score_player. No ctx = nothing to grade with: rows unchanged. */
export function gradeFirstRows(rows, playerByGameStats, ctx = null) {
  if (!ctx || ctx.firstScorer == null) return rows
  const dressed = new Set()
  for (const side of ['awayTeam', 'homeTeam']) for (const grp of ['forwards', 'defense']) for (const s of playerByGameStats?.[side]?.[grp] || []) dressed.add(Number(s.playerId))
  const first = Number(ctx.firstScorer)
  return rows.map((r) => {
    const d = dressed.has(Number(r.player_id ?? r.playerId))
    const hit = d ? Number(r.player_id ?? r.playerId) === first : null
    return { ...r, dressed: d, value: d ? (hit ? 1 : 0) : null, hit }
  })
}

export const toFirstRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: versionsFor(day.date).first, bar: BAR, legs: LEGS })
