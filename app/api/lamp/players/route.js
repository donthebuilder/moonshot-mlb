// LAMP · PLAYERS — GET /api/lamp/players
//
// The directory: every player on every current roster, one flat list, so a
// name typed anywhere on LAMP finds him. Thirty-two roster/{team}/current
// calls in parallel, each cached an hour on its own, the list cached half
// an hour at the edge. ~750 rows of id, name, position, number, team, mug.
// A club whose roster call fails is left out and named in `missing` rather
// than the whole directory failing.
import { rosterFor, TTL2 } from '../../../../lib/nhl/api'
import { reduceRoster } from '../../../../lib/nhl/reduce'
import { NHL_TEAMS } from '../../../../lib/nhl/teams'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const missing = []
    const lists = await Promise.all(NHL_TEAMS.map(([abbrev]) =>
      rosterFor(abbrev).then((p) => reduceRoster(p, abbrev)).catch((e) => { console.error(`[lamp] roster ${abbrev}: ${e?.message}`); missing.push(abbrev); return [] })))
    if (missing.length === NHL_TEAMS.length) throw new Error('every roster call failed')
    const players = lists.flat().map((r) => ({ id: r.id, name: r.name, pos: r.pos, group: r.group, number: r.number, team: r.team, headshot: r.headshot }))
    players.sort((a, b) => a.name.localeCompare(b.name))
    return ok({ players, missing, teams: NHL_TEAMS.length - missing.length, fetchedAt: new Date().toISOString() }, 1800)
  } catch (e) {
    return delayed('players directory', e)
  }
}
