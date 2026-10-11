// 🏒 THE TEAM PAGE'S DEEP READ (2026-10-10). Server only. GET /api/lamp/teamdeep?team=TOR calls this.
//
// What the club page shows beyond the schedule / roster / standings /api/lamp/team already serves:
//   lines      the club's offence and defence with the league rank of 32 (team/summary + the PP/PK reports + the xG table)
//   goalies    each goalie's shots faced, goals allowed, xG faced and goals saved above expected (lamp_team_game_xg)
//   calls      OUR calls on this club's skaters: the graded CALLED rows of lamp_goal_log, by model version
//   next       the club's next game: the team model's expected goals (lib/nhl/teamProj) and the stored line when one was locked
//
// SEASON RULE (the one Special Teams and the board follow): the active season's reports, and last season's -- labelled
// stale -- until the new season has a game in it. Every number below is from that one season.
// Missing data is named, never filled: no xG table -> no xG rows and `xg: { available: false }`; no goal log -> no calls.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'
import { nhlStatsGet, clubScheduleFor } from './api'
import { reduceClubSchedule, seasonLabel } from './reduce'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { readSpecialTeams } from './spots'
import { readTeamProj } from './teamProjRead'
import { nhlTeam } from './teams'
import { readPaged } from '../record/paged'
import { toRecord, isMissingTable } from '../record/nhl'
import { ALL_VERSIONS, MODEL_VERSION } from './goalModel'
import { callsSummary } from '../team/contract'
import { ladderFromRecords, versionRows } from '../record/ladder'
import { summaryByClub, xgByClub, statRows, clubLines, goalieGsax } from './teamDeepCore'

const sumUrl = (id) => `/team/summary?cayenneExp=${encodeURIComponent(`seasonId=${id} and gameTypeId=2`)}`

async function pickSeason() {
  const s = await whichSeason()
  const cur = s.current || s.id
  if (!cur) return null
  const now = await nhlStatsGet(sumUrl(cur), 3600).catch(() => null)
  if ((now?.data || []).some((r) => Number(r.gamesPlayed) > 0)) return { id: cur, stale: false, current: cur, raw: now }
  const prev = previousSeasonId(cur)
  return { id: prev, stale: true, current: cur, raw: await nhlStatsGet(sumUrl(prev), 3600).catch(() => null) }
}

const mem = new Map()
async function leagueXgRows(season) {
  const run = async () => {
    const db = adminClient()
    if (!db) return { rows: [], available: false }
    const { data, error } = await readPaged(() => db.from('lamp_team_game_xg').select('game_id,team,gf,ga,sog,xg,sog_a,xg_a,goalies')
      .eq('season', Number(season)).eq('game_type', 2).order('game_id', { ascending: true }).order('team', { ascending: true }))
    if (error) { if (!isMissingTable(error)) console.error(`[lamp teamdeep] xg: ${error.message}`); return { rows: [], available: false } }
    return { rows: data, available: data.length > 0 }
  }
  try {
    return await unstable_cache(run, ['lamp-teamdeep-xg-v1', String(season)], { revalidate: 1800 })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    const hit = mem.get(season)
    if (hit && Date.now() - hit.at < 1800e3) return hit.v
    const v = await run(); mem.set(season, { at: Date.now(), v }); return v
  }
}

const CALL_SELECT = 'game_id, game_date, game_type, season, player_id, model_version, team, opp, name, pos, score, rank_in_game, status, dressed, goals, hit, locked_at, graded_at'
async function readCalls(db, team, season) {
  if (!db) return { rows: [], available: false }
  const { data, error } = await readPaged(() => db.from('lamp_goal_log').select(CALL_SELECT).eq('team', team).eq('status', 'called').eq('season', Number(season))
    .eq('game_type', 2).in('model_version', ALL_VERSIONS).order('game_date', { ascending: false }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
  if (error) { if (!isMissingTable(error)) console.error(`[lamp teamdeep] calls: ${error.message}`); return { rows: [], available: false } }
  return { rows: data.map(toRecord), available: true }
}

/**
 * The calls block: the last 10 rows, and the hit rate per model version (never pooled across versions). The rate is
 * lib/record/ladder.js's own (its Wilson range, its regular-season rule): this club's CALLED rows go through
 * ladderFromRecords like the league's do, so there is one way to build the number.
 */
export function callsBlock(records) {
  const l = ladderFromRecords(records)
  const versions = versionRows(l ? { ...l, live: MODEL_VERSION } : null).map((v) => ({
    version: v.version, current: v.live, n: v.called.n, hit: v.called.hits, rate: v.called.rate,
    range: v.called.ci ? [Math.round(v.called.ci[0] * 10) / 10, Math.round(v.called.ci[1] * 10) / 10] : null,
  }))
  const s = callsSummary(records)
  const last = records.slice(0, 10).map((r) => ({
    gameId: r.game_id, date: r.game_date, playerId: r.player_id, name: r.name, pos: r.pos, opp: r.opp, version: r.model_version,
    rank: r.rank, result: r.result, goals: r.goals,
  }))
  return { total: records.length, graded: s.n, dnp: s.dnp, pending: s.pending, versions, last }
}

async function bookLine(db, gameId) {
  if (!db || !gameId) return null
  try {
    const { data, error } = await db.from('top_totals_calls').select('model_version,line,line_source,projected_total,called,rank,field_size,locked_at').eq('sport', 'nhl').eq('game_id', String(gameId)).order('locked_at', { ascending: false }).limit(1)
    if (error || !data?.length) return null
    const r = data[0]
    return { line: r.line, source: r.line_source, projected: r.projected_total, called: r.called, rank: r.rank, of: r.field_size, version: r.model_version, lockedAt: r.locked_at }
  } catch { return null }
}

export async function readTeamDeep(team) {
  const t = nhlTeam(team)
  if (!t) throw Object.assign(new Error('no such club'), { status: 400 })
  const season = await pickSeason()
  if (!season) return { team: t, season: null, lines: [], opp: null, xg: { available: false }, goalies: [], calls: { available: false, total: 0, graded: 0, dnp: 0, pending: 0, versions: [], last: [] }, next: null }
  const db = adminClient()
  const [specials, xgRead, sched, calls] = await Promise.all([
    readSpecialTeams().catch((e) => { console.error(`[lamp teamdeep] specials: ${e?.message}`); return null }),
    leagueXgRows(season.id),
    clubScheduleFor(team).then((p) => reduceClubSchedule(p, team)).catch(() => null),
    readCalls(db, team, season.id),
  ])
  const summary = summaryByClub(season.raw)
  const spMap = specials && specials.season === season.id ? Object.fromEntries((specials.teams || []).map((r) => [r.abbrev, r])) : {}
  const xg = xgByClub(xgRead.rows)
  const rows = statRows({ summary, specials: spMap, xg })
  const lines = clubLines(rows, team)
  const lineKeys = lines.filter((l) => l.value != null).length

  // the next game, the team model for it, the stored line
  const games = sched?.games || []
  const nextG = games.filter((g) => g.state !== 'final' && g.scheduleState === 'OK' && g.gameType !== 1).sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))[0] || null
  let next = null
  if (nextG) {
    const homeAb = nextG.home ? team : nextG.opponent.abbrev
    const awayAb = nextG.home ? nextG.opponent.abbrev : team
    const projMap = await readTeamProj([{ id: nextG.id, date: nextG.date, state: nextG.state === 'live' ? 'live' : 'pre', home: homeAb, away: awayAb }]).catch(() => new Map())
    next = {
      game: { id: nextG.id, date: nextG.date, startUtc: nextG.startUtc, venue: nextG.venue, home: nextG.home, opp: nextG.opponent.abbrev, away: awayAb, homeAbbrev: homeAb, season: nextG.season, state: nextG.state },
      proj: projMap.get(nextG.id) || null,
      book: await bookLine(db, nextG.id),
      oppLines: clubLines(rows, nextG.opponent.abbrev),
    }
  }
  const goalies = Object.keys(xg[team]?.goalies || {}).map((id) => ({ id: Number(id), ...goalieGsax(xg[team], id) })).filter((g) => g.sa != null)
  return {
    team: t,
    season: { id: season.id, label: seasonLabel(season.id), stale: season.stale, current: season.current },
    gp: summary[team]?.gp ?? null,
    lines, lineKeys,
    xg: { available: xgRead.available && Boolean(xg[team]), games: xg[team]?.gp ?? 0 },
    goalies,
    calls: { available: calls.available, ...callsBlock(calls.rows) },
    next,
    fetchedAt: new Date().toISOString(),
  }
}
