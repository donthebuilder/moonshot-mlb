// LAMP · RECORD — GET /api/lamp/record?days=30
//
// THE NUMBER, hockey edition: of the skaters who actually scored, how many
// were CALLED, how many ON THE BOARD, at lock — per night and over the
// window — plus the called hit rate and hit rate by rank band. Read
// straight off graded lamp_goal_log rows; nothing here is recomputed from
// a later feed. An empty record says so. The rows come through the shared
// record reader (lib/record/nhl.js), the same one /start and /called use.
import { MODEL_VERSION, coverage } from '../../../../lib/nhl/goalModel'
import { readNhlRecords, isMissingTable } from '../../../../lib/record/nhl'
import { adminClient } from '../../../../lib/nhl/db'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const days = Math.min(120, Math.max(1, Number(searchParams.get('days')) || 30))
  // Preseason is not the season: camp lineups, split squads, three-line
  // rosters. Those nights are locked and graded like any other (the record
  // is the record) but stay out of the headline unless ?pre=1 asks.
  const includePre = searchParams.get('pre') === '1'
  try {
    const db = adminClient()
    if (!db) return ok({ modelVersion: MODEL_VERSION, nights: [], total: null, dbReady: false }, 60)
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const { rows, error } = await readNhlRecords(db, { since, includePre, graded: true })
    if (error) {
      // Before the migration has been run the table is simply not there;
      // that is an empty record with a reason, not a feed outage.
      if (isMissingTable(error)) {
        console.error(`[lamp record] ${error.message}`)
        return ok({ modelVersion: MODEL_VERSION, nights: [], total: null, dbReady: false, note: 'record table not created yet' }, 60)
      }
      throw new Error(error.message)
    }
    const byNight = new Map()
    for (const r of rows) { if (!byNight.has(r.game_date)) byNight.set(r.game_date, []); byNight.get(r.game_date).push(r) }
    const nights = [...byNight.entries()].map(([date, rs]) => ({
      date, games: new Set(rs.map((r) => r.game_id)).size, ...coverage(rs),
      called: rs.filter((r) => r.status === 'called' && r.dressed).sort((a, b) => a.game_id - b.game_id || a.rank - b.rank).map((r) => ({ playerId: r.player_id, name: r.name, team: r.team, opp: r.opp, rank: r.rank, score: r.score, goals: r.goals, hit: r.hit })),
      // `scorersOff` is coverage()'s COUNT; the list is `offScorers` (a clash the render harness caught).
      offScorers: rs.filter((r) => r.hit && r.status !== 'called').map((r) => ({ name: r.name, team: r.team, rank: r.rank, status: r.status, goals: r.goals })),
    }))
    return ok({ modelVersion: MODEL_VERSION, since, days, includePre, nights, total: rows.length ? coverage(rows) : null, dbReady: true, fetchedAt: new Date().toISOString() }, 300)
  } catch (e) {
    return delayed('record', e)
  }
}
