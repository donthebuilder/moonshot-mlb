// LAMP · STANDINGS — GET /api/lamp/standings
//
// THE SEASON TRAP, handled here on purpose (lib/nhl/api.js, standings note):
// standings/now during preseason is LAST season's final table. The response
// carries both the season the rows belong to (`seasonId`, off the rows) and
// the season that should be current (`current`, off standings-season, with
// the day its table starts) so the page can label the table honestly:
// "2025-26 FINAL · 2026-27 opens Sep 29". A page that printed these rows
// under this year's header would be exactly the leak project rule 26 names.
import { readStandings } from '../../../../lib/nhl/readers'
import { TTL } from '../../../../lib/nhl/api'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await readStandings()
    return ok({ ...data, fetchedAt: new Date().toISOString() }, TTL.standings)
  } catch (e) {
    return delayed('standings', e)
  }
}
