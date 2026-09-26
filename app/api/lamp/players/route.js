// LAMP · PLAYERS — GET /api/lamp/players
//
// The directory: every player on every current roster, one flat list, so a
// name typed anywhere on LAMP finds him. Thirty-two roster/{team}/current
// calls in parallel, each cached an hour on its own, the list cached half
// an hour at the edge. ~750 rows of id, name, position, number, team, mug.
// A club whose roster call fails is left out and named in `missing` rather
// than the whole directory failing.
import { readRosters } from '../../../../lib/nhl/readers'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await readRosters()
    return ok({ ...data, fetchedAt: new Date().toISOString() }, 1800)
  } catch (e) {
    return delayed('players directory', e)
  }
}
