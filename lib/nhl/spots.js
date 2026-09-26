// 🏒 SPECIAL TEAMS AND SCHEDULE SPOTS (lamp research step 2, 2026-09-26).
// Server only. Context for the board, never part of the score: lamp-goal-v1
// is untouched, nothing here is written to lamp_goal_log, and a v2 that uses
// any of it is a separate, measured decision.
//
//   team special teams  api.nhle.com/stats team/powerplay + team/penaltykill
//                       (powerPlayPct, ppOpportunitiesPerGame, ppGoalsPerGame,
//                       ppTimeOnIcePerGame; penaltyKillPct,
//                       timesShorthandedPerGame, pkTimeOnIcePerGame)
//   rest / back-to-back club-schedule-season/{team}/now: the last FINAL game
//                       before the night, counted in calendar days
//   PP goals            club-stats/{team}/{season}/2 skaters[].powerPlayGoals
//
// SEASON: the active season's reports, and last season's (labelled stale)
// until the new one has a game in it -- the same rule the board's legs and
// Leaders follow, so every number on the page is from the same season.
import { nhlStatsGet, clubScheduleFor, clubStatsFor } from './api'
import { reduceClubSchedule, reduceClubStats, seasonLabel } from './reduce'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { NHL_TEAMS } from './teams'

const ABBREV_BY_ID = new Map(NHL_TEAMS.map(([abbrev, id]) => [Number(id), abbrev]))
const TTL_ST = 3600
const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

const report = (name, seasonId) => nhlStatsGet(`/team/${name}?cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`, TTL_ST)

/** The season whose reports have games in them: { id, stale, current }. */
async function reportSeason() {
  const season = await whichSeason()
  const cur = season.current || season.id
  const probe = await report('powerplay', cur).catch(() => null)
  if (probe?.total > 0) return { id: cur, stale: false, current: cur, pp: probe }
  const prev = previousSeasonId(cur)
  return { id: prev, stale: true, current: cur, pp: null }
}

/** All 32 clubs: power play and penalty kill, one row each. */
export async function readSpecialTeams() {
  const s = await reportSeason()
  const [pp, pk] = await Promise.all([s.pp || report('powerplay', s.id), report('penaltykill', s.id)])
  const pkById = new Map((pk?.data || []).map((r) => [Number(r.teamId), r]))
  const teams = []
  for (const r of pp?.data || []) {
    const abbrev = ABBREV_BY_ID.get(Number(r.teamId))
    if (!abbrev) { console.error(`[lamp spots] no abbrev for team id ${r.teamId} (${r.teamFullName})`); continue }
    const k = pkById.get(Number(r.teamId)) || {}
    teams.push({
      abbrev, name: r.teamFullName, gp: n(r.gamesPlayed),
      ppPct: n(r.powerPlayPct), ppOppPg: n(r.ppOpportunitiesPerGame), ppGpg: n(r.ppGoalsPerGame), ppToiPg: n(r.ppTimeOnIcePerGame),
      pkPct: n(k.penaltyKillPct), shPg: n(k.timesShorthandedPerGame), pkToiPg: n(k.pkTimeOnIcePerGame),
    })
  }
  return { season: s.id, seasonLabel: seasonLabel(s.id), stale: s.stale, current: s.current, teams }
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

/** { [abbrev]: { rest, b2b, last } } for the night -- rest is full days off before it. */
export async function readRest(teams, date) {
  const out = {}
  await Promise.all(teams.map(async (t) => {
    try {
      const sched = reduceClubSchedule(await clubScheduleFor(t), t)
      const last = (sched.games || []).filter((g) => g.date && g.date < date && g.state === 'final').map((g) => g.date).sort().pop() || null
      const rest = last ? daysBetween(last, date) - 1 : null
      out[t] = { rest, b2b: rest === 0, last }
    } catch (e) {
      console.error(`[lamp spots] rest ${t}: ${e?.message}`)
      out[t] = { rest: null, b2b: false, last: null }
    }
  }))
  return out
}

/** Map playerId -> power-play goals in the reports' season, for the given clubs. */
export async function readPpGoals(teams, seasonId) {
  const out = new Map()
  await Promise.all(teams.map(async (t) => {
    try {
      for (const s of reduceClubStats(await clubStatsFor(t, seasonId, 2)).skaters) if (s.id) out.set(Number(s.id), s.ppg)
    } catch (e) { console.error(`[lamp spots] club stats ${t} ${seasonId}: ${e?.message}`) }
  }))
  return out
}
