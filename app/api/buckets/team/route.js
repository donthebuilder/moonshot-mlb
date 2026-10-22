// GET /api/buckets/team?team=BOS -- one club: roster with season lines, schedule, standing. Gated.
import { rosterFor, teamScheduleFor, reduceTeamSchedule, standingsFor, reduceStandings, gamelogFor, reduceGamelog } from '../../../../lib/nba/api'
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { jerseyNumber } from '../../../../lib/jersey'

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
    return { id: String(a.id), name: a.displayName, pos: a.position?.abbreviation || null, jersey: jerseyNumber(a.jersey) != null ? String(a.jersey).trim() : null, age: a.age ?? null, injuries: (a.injuries || []).map((i) => i.status).filter(Boolean),
      gp: s?.gp ?? null, min: s?.min ?? null, pts: s?.pts ?? null, reb: s?.reb ?? null, ast: s?.ast ?? null, tpm: s?.tpm ?? null, onStats: Boolean(s) }
  }).sort((a, b) => (b.min ?? -1) - (a.min ?? -1))
  const row = st.flatMap((c) => c.rows).find((r) => r.abbrev === t.abbrev) || null
  // THE LAST THREE (10-19, the usage treemap's "more of it lately"): the rotation's game logs (the ten with the most minutes),
  // the club's three latest regular-season games among them, and each man's counts in those three (0 when he sat)
  const rot = players.filter((p) => p.onStats && p.gp > 0).slice(0, 10)
  const logs = await Promise.all(rot.map((p) => gamelogFor(p.id, sn.read).then(reduceGamelog).then((g) => [p.id, g.filter((x) => x.seasonType === 2)]).catch(() => [p.id, []])))
  const when = new Map()
  for (const [, g] of logs) for (const x of g) if (x.date) when.set(x.id, x.date)
  const last3 = [...when.entries()].sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 3).map(([id]) => id)
  const recent = last3.length === 3 ? Object.fromEntries(logs.map(([id, g]) => {
    const mine = g.filter((x) => last3.includes(x.id)), sum = (k) => mine.reduce((a, x) => a + (Number(x[k]) || 0), 0)
    return [id, { games: mine.length, pts: sum('pts'), reb: sum('reb'), ast: sum('ast'), tpm: sum('tpm'), min: Math.round(sum('min')) }]
  })) : null
  return ok({ team: t, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale, standing: row, players, recent, schedule: sched, fetchedAt: new Date().toISOString() }, 600)
})
