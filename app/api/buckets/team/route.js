// GET /api/buckets/team?team=BOS -- one club: roster with season lines, schedule, standing. Gated.
import { rosterFor, teamScheduleFor, reduceTeamSchedule, standingsFor, reduceStandings } from '../../../../lib/nba/api'
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('team', async (q) => {
  const t = nbaTeam(q.get('team'))
  if (!t) return bad('team must be an NBA club code (BOS, NY, GS ...)')
  const sn = await nbaSeason()
  const [roster, sched, stats, st] = await Promise.all([
    rosterFor(t.id).then((j) => j?.athletes || []),
    teamScheduleFor(t.id, sn.cur).then((j) => reduceTeamSchedule(j, t.abbrev)).catch(() => []),
    seasonStats(sn.read),
    standingsFor(sn.read).then(reduceStandings).catch(() => []),
  ])
  const players = roster.map((a) => {
    const s = stats.athletes.get(String(a.id))
    return { id: String(a.id), name: a.displayName, pos: a.position?.abbreviation || null, jersey: a.jersey || null, age: a.age ?? null, injuries: (a.injuries || []).map((i) => i.status).filter(Boolean),
      gp: s?.gp ?? null, min: s?.min ?? null, pts: s?.pts ?? null, reb: s?.reb ?? null, ast: s?.ast ?? null, tpm: s?.tpm ?? null, onStats: Boolean(s) }
  }).sort((a, b) => (b.min ?? -1) - (a.min ?? -1))
  const row = st.flatMap((c) => c.rows).find((r) => r.abbrev === t.abbrev) || null
  return ok({ team: t, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale, standing: row, players, schedule: sched, fetchedAt: new Date().toISOString() }, 600)
})
