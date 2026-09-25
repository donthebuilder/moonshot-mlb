// 🏒 ASSEMBLING A NIGHT for lamp-goal-v1 — the fetch-and-join half. Server
// only (imports the feed layer). One code path for two callers:
//   · app/api/lamp/tick   scores the night and WRITES the games inside the
//                         lock window (leak-free: never after puck drop)
//   · app/api/lamp/board  scores the same night for a PREVIEW of games not
//                         yet locked, labelled as such, never written
// so what the page previews and what the record locks are the same rows.
import { scoreFor, rosterFor, clubStatsFor, clubScheduleFor, standingsNow, nhlGet, TTL } from './api'
import { reduceScoreDay, reduceRoster, reduceClubStats, reduceClubSchedule, reduceStandings } from './reduce'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { pooledLegs, scoreNight, MODEL_VERSION } from './goalModel'
import { startersFor } from './goalies'

/** Lineups appear in play-by-play rosterSpots once the league posts them. */
async function lineupFor(gameId) {
  try {
    const p = await nhlGet(`/gamecenter/${gameId}/play-by-play`, TTL.game)
    const ids = new Set((p?.rosterSpots || []).map((r) => Number(r.playerId)).filter(Boolean))
    return ids.size ? ids : null
  } catch { return null }
}

const dayBefore = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10) }

/**
 * Build and score every candidate on one game day.
 * @returns {{ day, season, games, rows, byGame, lineups, starters, modelVersion }}
 */
export async function buildNight(date, { onlyGameIds = null } = {}) {
  const day = reduceScoreDay(await scoreFor(date))
  const season = await whichSeason()
  const games = day.games.filter((g) => g.scheduleState === 'OK')
  const teams = [...new Set(games.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const standings = await standingsNow().then(reduceStandings).catch(() => null)
  const gaById = new Map((standings?.rows || []).map((r) => [r.abbrev, r.gp ? r.ga / r.gp : null]))

  // This season's line and last season's, per club. Before opening night
  // "cur" is the new season (empty) and "prev" is last season; pooledLegs
  // weights them either way.
  const curSeason = season.current || season.id
  const prevSeason = previousSeasonId(curSeason)
  const per = {}
  await Promise.all(teams.map(async (t) => {
    const [roster, cur, prev, sched] = await Promise.all([
      rosterFor(t).then((p) => reduceRoster(p, t)),
      clubStatsFor(t, curSeason, 2).then(reduceClubStats).catch(() => ({ skaters: [] })),
      clubStatsFor(t, prevSeason, 2).then(reduceClubStats).catch(() => ({ skaters: [] })),
      clubScheduleFor(t).then((p) => reduceClubSchedule(p, t)).catch(() => null),
    ])
    const yesterday = dayBefore(date)
    const b2b = Boolean(sched?.games?.some((g) => g.date === yesterday && g.state === 'final'))
    per[t] = { roster, cur: new Map(cur.skaters.map((s) => [s.id, s])), prev: new Map(prev.skaters.map((s) => [s.id, s])), b2b }
  }))

  const lineups = {}
  await Promise.all(games.map(async (g) => { lineups[g.id] = await lineupFor(g.id) }))
  // The net. v1 has no pregame source (lib/nhl/goalies.js) — the map is
  // empty and context.oppGoalie is null on every row. The slot exists so a
  // source can be plugged in without touching the model's shape.
  const starters = await startersFor(date, games).catch(() => ({ source: null, byGame: {} }))

  const candidates = []
  for (const g of games) {
    if (onlyGameIds && !onlyGameIds.has(g.id)) continue
    for (const side of ['away', 'home']) {
      const t = g[side].abbrev; const opp = g[side === 'away' ? 'home' : 'away'].abbrev
      const P = per[t]; if (!P) continue
      const dressed = lineups[g.id]
      const oppGoalie = starters.byGame[g.id]?.[side === 'away' ? 'home' : 'away'] || null
      for (const r of P.roster) {
        if (r.pos === 'G') continue
        if (dressed && !dressed.has(r.id)) continue     // lineup posted and he is not in it
        candidates.push({
          gameId: g.id, playerId: r.id, name: r.name, pos: r.pos, team: t, opp, home: side === 'home',
          legs: pooledLegs(P.cur.get(r.id), P.prev.get(r.id)),
          context: { oppGaPg: gaById.get(opp) ?? null, oppGoalie, b2b: P.b2b, lineupKnown: Boolean(dressed), staleSeason: season.stale, curSeason, prevSeason },
        })
      }
    }
  }
  const rows = scoreNight(candidates)
  const byGame = new Map()
  for (const r of rows) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  return { day, season, games, rows, byGame, lineups, starters, modelVersion: MODEL_VERSION }
}

/** A scored row → the lamp_goal_log column shape. */
export function toLogRow(r, g, day, lockedAtIso) {
  return {
    game_id: g.id, player_id: r.playerId, model_version: MODEL_VERSION,
    game_date: day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
    team: r.team, opp: r.opp, home: r.home, name: r.name, pos: r.pos,
    legs: r.legs?.ok ? { shotsPg: r.legs.shotsPg, goalsPg: r.legs.goalsPg, toi: r.legs.toi, gpPooled: r.legs.gpPooled, gpCur: r.legs.gpCur, gpPrev: r.legs.gpPrev, prevWeight: r.legs.prevWeight } : null,
    pct: r.pct, score: r.score, rank_in_game: r.rank, status: r.status, reason: r.reason || null,
    context: r.context, locked_at: lockedAtIso,
  }
}
