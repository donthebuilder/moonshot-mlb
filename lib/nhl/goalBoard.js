// 🏒 ASSEMBLING A NIGHT for lamp-goal-v1 — the fetch-and-join half. Server
// only (imports the feed layer). One code path for two callers:
//   · app/api/lamp/tick   scores the night and WRITES the games inside the
//                         lock window (leak-free: never after puck drop)
//   · app/api/lamp/board  scores the same night for a PREVIEW of games not
//                         yet locked, labelled as such, never written
// so what the page previews and what the record locks are the same rows.
import { scoreFor, rosterFor, clubStatsFor, clubScheduleFor, standingsNow, nhlGet, TTL, leagueSkaterLines } from './api'
import { reduceScoreDay, reduceRoster, reduceClubStats, reduceClubSchedule, reduceStandings } from './reduce'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { pooledLegs, positionPriors, scoreNight, PROBABILITY_SOURCE } from './goalModel'
import { startersFor } from './goalies'
import { saPer60, sogLegs, scoreSogNight } from './sogModel'
import { pointRates, ptsLegs, scorePtsNight } from './ptsModel'
import { astLegs, scoreAstNight } from './astModel'
import { scoreGoalPosNight } from './goalPosModel'
import { dayBefore } from '../data'
import { versionsFor, isV3 } from './versions'

/** Lineups appear in play-by-play rosterSpots once the league posts them. */
async function lineupFor(gameId) {
  try {
    const p = await nhlGet(`/gamecenter/${gameId}/play-by-play`, TTL.game)
    const ids = new Set((p?.rosterSpots || []).map((r) => Number(r.playerId)).filter(Boolean))
    return ids.size ? ids : null
  } catch { return null }
}


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
  // EVERY CLUB HE PLAYED FOR (2026-10-02, Donovan: "Mason just scored and I
  // don't see him anywhere"). A skater's lines came only from his CURRENT
  // club's stats page, so anyone who changed clubs had 0 games on file and
  // was never scored -- 47 of 10-02's 193 skaters (McTavish ANA->STL, Tuch,
  // Kyrou, Arvidsson, Jenner, Peterka, Carlo ...). The league's own skater
  // report has one line per player per season across every club he played
  // for; it comes first, the club page is the fallback.
  const [leagueCur, leaguePrev] = await Promise.all([leagueSkaterLines(curSeason), leagueSkaterLines(prevSeason)])
  // v3's rookie prior: each position's league-average line over skaters with
  // 10+ games -- this season once it has 100 of them, else last season
  const curPri = positionPriors([...leagueCur.values()])
  const priors = (curPri.F?.skaters || 0) + (curPri.D?.skaters || 0) >= 100 ? curPri : positionPriors([...leaguePrev.values()])
  const priorFor = (pos) => (isV3(date) ? priors[String(pos || '').toUpperCase() === 'D' ? 'D' : 'F'] || null : null)   // v2 dates: no pull
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
    const lines = (club, league) => { const m = new Map(club.skaters.map((s) => [s.id, s])); for (const r of roster) if (league.has(r.id)) m.set(r.id, league.get(r.id)); return m }
    per[t] = { roster, cur: lines(cur, leagueCur), prev: lines(prev, leaguePrev), b2b,
      // lamp-sog-v1's opponent leg: this club's shots against per 60 of its
      // goalies' ice time, from the same two club-stats lines (no new call).
      sa60: saPer60(cur.goalies || [], prev.goalies || []) }
  }))

  const lineups = {}
  await Promise.all(games.map(async (g) => { lineups[g.id] = await lineupFor(g.id) }))
  // The net. The pregame source is lib/nhl/goalieSource.js (ESPN's starter, via startersFor). A game with
  // no data has no entry; context.oppGoalie carries a goalie only once he is CONFIRMED (a projected name
  // is a guess and is not printed as "facing"). The model never reads it.
  const starters = await startersFor(date, games).catch(() => ({ source: null, byGame: {} }))

  // SPLIT SQUADS: NOBODY COUNTS TWICE (2026-09-26, Donovan: "don't count
  // players twice"). In preseason a club can play two games on one night
  // (MTL@OTT and OTT@MTL on 09-26). Both games read the club's full roster,
  // so before lineups post every one of its skaters was scored in BOTH --
  // 41 men twice on 09-26, sitting twice in the night's percentile pool and
  // able to take a CALLED slot in both games. Which game he plays is only
  // known from the posted lineup, so until a split-squad game's lineup posts
  // its club's skaters are not scored for it (NOT ON THE BOARD, reason
  // printed); once it posts, the lineup narrowing below puts each man in the
  // one game he dresses for. A club playing once is unchanged, so a night
  // without split squads scores exactly as before.
  const gamesPerTeam = new Map()
  for (const g of games) for (const t of [g.away.abbrev, g.home.abbrev]) gamesPerTeam.set(t, (gamesPerTeam.get(t) || 0) + 1)
  const SPLIT = { ok: false, reason: 'split squad — his club plays twice tonight; scored once this game’s lineup is posted' }

  const candidates = []
  // SHADOW points/assists (lamp-pts-v1 / lamp-ast-v1): each candidate's
  // pooled points and assists rates, from the same two club-stats lines.
  const rates = new Map()
  for (const g of games) {
    if (onlyGameIds && !onlyGameIds.has(g.id)) continue
    for (const side of ['away', 'home']) {
      const t = g[side].abbrev; const opp = g[side === 'away' ? 'home' : 'away'].abbrev
      const P = per[t]; if (!P) continue
      const dressed = lineups[g.id]
      const oppE = starters.byGame[g.id]?.[side === 'away' ? 'home' : 'away'] || null
      const oppGoalie = oppE?.confirmed === true ? oppE : null
      for (const r of P.roster) {
        if (r.pos === 'G') continue
        if (dressed && !dressed.has(r.id)) continue     // lineup posted and he is not in it
        const splitUnknown = !dressed && (gamesPerTeam.get(t) || 0) > 1
        const legs = splitUnknown ? SPLIT : pooledLegs(P.cur.get(r.id), P.prev.get(r.id), priorFor(r.pos))
        rates.set(`${g.id}|${r.id}`, pointRates(legs, P.cur.get(r.id), P.prev.get(r.id)))
        candidates.push({
          gameId: g.id, playerId: r.id, name: r.name, pos: r.pos, team: t, opp, home: side === 'home',
          legs,
          context: { oppGaPg: gaById.get(opp) ?? null, oppGoalie, b2b: P.b2b, lineupKnown: Boolean(dressed), staleSeason: season.stale, curSeason, prevSeason, rookie: legs?.rookie || null },
        })
      }
    }
  }
  const rows = scoreNight(candidates)
  const byGame = new Map()
  for (const r of rows) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  // LAMP SHOTS (lamp-sog-v1): the same candidates -- same population, same
  // split-squad rule, same pooled lines -- with this model's legs.
  const sogRows = scoreSogNight(candidates.map((c) => ({ ...c, legs: sogLegs(c.legs, per[c.opp]?.sa60 ?? null), context: { ...c.context, oppSaPg: per[c.opp]?.sa60 ?? null } })))
  const sogByGame = new Map()
  for (const r of sogRows) { if (!sogByGame.has(r.gameId)) sogByGame.set(r.gameId, []); sogByGame.get(r.gameId).push(r) }
  // SHADOW (lamp-pts-v1 / lamp-ast-v1): same candidates again. Written to the
  // record by the tick; NOT returned to any page (boardRead reads only
  // byGame / sogByGame, and BOARD_MARKETS has no PTS / AST).
  const groupByGame = (list) => { const m = new Map(); for (const r of list) { if (!m.has(r.gameId)) m.set(r.gameId, []); m.get(r.gameId).push(r) } return m }
  const ptsByGame = groupByGame(scorePtsNight(candidates.map((c) => ({ ...c, legs: ptsLegs(c.legs, rates.get(`${c.gameId}|${c.playerId}`), c.context.oppGaPg) }))))
  const astByGame = groupByGame(scoreAstNight(candidates.map((c) => ({ ...c, legs: astLegs(c.legs, rates.get(`${c.gameId}|${c.playerId}`), c.context.oppGaPg) }))))
  // SHADOW lamp-goalpos-v1: the goal board with ice time ranked within position
  const goalPosByGame = groupByGame(scoreGoalPosNight(candidates))
  return { day, season, games, rows, byGame, sogRows, sogByGame, ptsByGame, astByGame, goalPosByGame, lineups, starters, modelVersion: versionsFor(date).goal, sogModelVersion: versionsFor(date).sog }
}

/** A scored row → the lamp_goal_log column shape. */
export function toLogRow(r, g, day, lockedAtIso) {
  return {
    game_id: g.id, player_id: r.playerId, model_version: versionsFor(day.date).goal,
    game_date: day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
    team: r.team, opp: r.opp, home: r.home, name: r.name, pos: r.pos,
    legs: r.legs?.ok ? { shotsPg: r.legs.shotsPg, goalsPg: r.legs.goalsPg, toi: r.legs.toi, gpPooled: r.legs.gpPooled, gpCur: r.legs.gpCur, gpPrev: r.legs.gpPrev, prevWeight: r.legs.prevWeight } : null,
    pct: r.pct, score: r.score, rank_in_game: r.rank, status: r.status, reason: r.reason || null,
    // v2 (2026-10-01): the call's role, the night-board rank the top-third
    // rule read, and the LOGGED projection with its label -- in context, no
    // new column. The probability is never printed (calibration gate).
    context: { ...(r.context || {}), role: r.role ?? null, nightRank: r.nightRank ?? null, nightOf: r.nightOf ?? null,
      goalGameProbability: r.goalGameProbability ?? null, probabilitySource: r.goalGameProbability != null ? PROBABILITY_SOURCE : null },
    locked_at: lockedAtIso,
  }
}
